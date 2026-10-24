import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
	BrowserDraftLease,
	BrowserWorkflowDraftEntry
} from '~/repositories/deviceDrafts/contracts'
import {
	type TrackEnrichmentDraftOwnershipDependencies,
	createTrackEnrichmentDraftOwnership
} from '~/utils/trackEnrichmentDraftOwnership'

const NOW = '2026-09-08T00:00:00.000Z'
const draft: BrowserWorkflowDraftEntry['draft'] = {
	status: 'invalid',
	metadata: {
		id: 'draft-a',
		kind: 'track-enrichment',
		draftRevision: 3,
		updatedAt: NOW
	}
}

function lease(revision: number): BrowserDraftLease {
	return {
		leaseRevision: revision,
		acquiredAt: NOW,
		renewedAt: NOW,
		expiresAt: '2026-09-08T00:01:00.000Z'
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function harness() {
	type Repository = NonNullable<
		ReturnType<TrackEnrichmentDraftOwnershipDependencies['getRepository']>
	>
	const repository = {
		claimDraft: vi.fn<Repository['claimDraft']>(),
		takeOverDraft: vi.fn<Repository['takeOverDraft']>(),
		renewDraftLease: vi.fn<Repository['renewDraftLease']>(),
		releaseDraftLease: vi.fn<Repository['releaseDraftLease']>(),
		readDraft: vi.fn<Repository['readDraft']>()
	}
	let generation = 0
	let deviceRevision = 1
	let tail: Promise<unknown> = Promise.resolve()
	function runSerializedMutation<T>(operation: () => Promise<T>) {
		const result = tail.then(operation)
		tail = result.catch(() => undefined)
		return result
	}
	function captureLifecycleGuard() {
		const captured = generation
		return () => generation === captured
	}
	const onChange = vi.fn()
	const onRenewed = vi.fn()
	const onRenewalFailed = vi.fn(() => ownership.reset())
	const ownership = createTrackEnrichmentDraftOwnership({
		ownerToken: 'owner-a',
		getRepository: () => repository,
		getDeviceRevision: () => deviceRevision,
		setDeviceRevision: (value) => {
			deviceRevision = value
		},
		captureLifecycleGuard,
		runSerializedMutation,
		onChange,
		onRenewed,
		onRenewalFailed,
		leaseRenewIntervalMs: 1000
	})
	return {
		ownership,
		repository,
		onChange,
		onRenewed,
		onRenewalFailed,
		captureLifecycleGuard,
		runSerializedMutation,
		get deviceRevision() {
			return deviceRevision
		},
		set deviceRevision(value: number) {
			deviceRevision = value
		},
		invalidate() {
			generation += 1
			ownership.reset()
		}
	}
}

beforeEach(() => {
	vi.useFakeTimers()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('draft ownership', () => {
	it.each(['claim', 'takeOver'] as const)(
		'%s waits for autosave and uses its committed device revision',
		async (operation) => {
			const h = harness()
			const save = deferred<undefined>()
			void h.runSerializedMutation(async () => {
				await save.promise
				h.deviceRevision = 8
			})
			const result = { value: { draft, lease: lease(5) }, deviceRevision: 9 }
			h.repository.claimDraft.mockResolvedValue(result)
			h.repository.takeOverDraft.mockResolvedValue(result)
			const guard = h.captureLifecycleGuard()
			const pending =
				operation === 'claim'
					? h.ownership.claim('draft-a', guard)
					: h.ownership.takeOver('draft-a', 4, guard)
			await Promise.resolve()
			expect(h.repository.claimDraft).not.toHaveBeenCalled()
			expect(h.repository.takeOverDraft).not.toHaveBeenCalled()
			save.resolve(undefined)
			expect(await pending).toEqual(result.value)
			if (operation === 'claim') {
				expect(h.repository.claimDraft).toHaveBeenCalledWith(
					'draft-a',
					'owner-a',
					8
				)
			} else {
				expect(h.repository.takeOverDraft).toHaveBeenCalledWith(
					'draft-a',
					'owner-a',
					{ deviceRevision: 8, leaseRevision: 4 }
				)
			}
			expect(h.deviceRevision).toBe(9)
			expect(h.ownership.lease).toEqual(lease(5))
		}
	)

	it('serializes overlapping renewals and release using each preceding result', async () => {
		const h = harness()
		h.ownership.accept('draft-a', lease(4))
		const first = deferred<{
			value: BrowserDraftLease
			deviceRevision: number
		}>()
		h.repository.renewDraftLease
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce({ value: lease(6), deviceRevision: 3 })
		h.repository.releaseDraftLease.mockResolvedValue({
			value: undefined,
			deviceRevision: 4
		})
		const pending = [h.ownership.renew(), h.ownership.renew()]
		const released = h.ownership.release(h.captureLifecycleGuard())
		await Promise.resolve()
		expect(h.repository.renewDraftLease).toHaveBeenCalledTimes(1)
		expect(h.repository.releaseDraftLease).not.toHaveBeenCalled()
		first.resolve({ value: lease(5), deviceRevision: 2 })
		await Promise.all(pending)
		expect(await released).toBe(true)
		expect(h.repository.renewDraftLease).toHaveBeenNthCalledWith(
			2,
			'draft-a',
			'owner-a',
			{ deviceRevision: 2, leaseRevision: 5 }
		)
		expect(h.repository.releaseDraftLease).toHaveBeenCalledWith(
			'draft-a',
			'owner-a',
			{ deviceRevision: 3, leaseRevision: 6 }
		)
		expect(h.deviceRevision).toBe(4)
	})

	it('ignores a claim that completes after its workspace is replaced', async () => {
		const h = harness()
		const claimed = deferred<{
			value: { draft: typeof draft; lease: BrowserDraftLease }
			deviceRevision: number
		}>()
		h.repository.claimDraft.mockReturnValue(claimed.promise)
		const pending = h.ownership.claim('draft-a', h.captureLifecycleGuard())
		await Promise.resolve()
		expect(h.repository.claimDraft).toHaveBeenCalledOnce()
		h.invalidate()
		claimed.resolve({ value: { draft, lease: lease(5) }, deviceRevision: 2 })
		expect(await pending).toBeNull()
		expect(h.ownership.draftId).toBeNull()
		expect(h.deviceRevision).toBe(1)
		expect(vi.getTimerCount()).toBe(0)
	})

	it.each(['resolve', 'reject'] as const)(
		'discards a pending renewal that will %s after a workspace switch',
		async (outcome) => {
			const h = harness()
			h.ownership.accept('draft-a', lease(4))
			const renewed = deferred<{
				value: BrowserDraftLease
				deviceRevision: number
			}>()
			h.repository.renewDraftLease.mockReturnValue(renewed.promise)
			const pending = h.ownership.renew()
			await Promise.resolve()
			h.invalidate()
			if (outcome === 'resolve')
				renewed.resolve({ value: lease(5), deviceRevision: 2 })
			else renewed.reject(new Error('Superseded lease'))
			await pending
			expect(h.onRenewed).not.toHaveBeenCalled()
			expect(h.onRenewalFailed).not.toHaveBeenCalled()
			expect(h.deviceRevision).toBe(1)
			expect(vi.getTimerCount()).toBe(0)
		}
	)

	it('stops automatic renewal when ownership is lost', async () => {
		const h = harness()
		const error = new Error('Lease taken over')
		h.repository.renewDraftLease.mockRejectedValue(error)
		h.ownership.accept('draft-a', lease(4))
		h.ownership.startRenewing()
		await vi.advanceTimersByTimeAsync(1000)
		expect(h.onRenewalFailed).toHaveBeenCalledWith(error)
		expect(h.ownership.lease).toBeNull()
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(5000)
		expect(h.repository.renewDraftLease).toHaveBeenCalledOnce()
	})

	it('requires ownership before deleting an invalid draft and refuses another live lease', async () => {
		const h = harness()
		let entry: BrowserWorkflowDraftEntry = {
			draft,
			lease: { status: 'live', lease: lease(4) }
		}
		const onClaimed = vi.fn((claimed: BrowserWorkflowDraftEntry) => {
			entry = claimed
		})
		const ensure = () =>
			h.ownership.ensureOwned(() => entry, h.captureLifecycleGuard(), onClaimed)
		expect(await ensure()).toBe(false)
		expect(h.repository.claimDraft).not.toHaveBeenCalled()
		entry = { ...entry, lease: { status: 'expired', lease: lease(4) } }
		h.repository.claimDraft.mockResolvedValue({
			value: { draft, lease: lease(5) },
			deviceRevision: 2
		})
		expect(await ensure()).toBe(true)
		expect(entry.lease).toEqual({ status: 'live', lease: lease(5) })
		expect(h.ownership.lease).toEqual(lease(5))
		expect(h.deviceRevision).toBe(2)
		expect(await ensure()).toBe(true)
		expect(h.repository.claimDraft).toHaveBeenCalledOnce()
	})

	it('releases the lease observed after a drained first save despite reset local ownership', async () => {
		const h = harness()
		h.ownership.reset()
		h.repository.readDraft.mockResolvedValue({
			value: { draft, lease: { status: 'live', lease: lease(7) } },
			deviceRevision: 12
		})
		h.repository.releaseDraftLease.mockResolvedValue({
			value: undefined,
			deviceRevision: 13
		})
		await h.ownership.releaseObserved(h.repository, 'draft-a')
		expect(h.repository.releaseDraftLease).toHaveBeenCalledWith(
			'draft-a',
			'owner-a',
			{ deviceRevision: 12, leaseRevision: 7 }
		)
		expect(h.deviceRevision).toBe(1)
	})
})
