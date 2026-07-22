import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceOperationContext } from '../contracts'
import { createCloudCoverResolver } from './cloudCoverResolver'
import type {
	CloudOperationLease,
	CloudRepositoryState
} from './cloudRepositoryState'

const context: WorkspaceOperationContext = {
	workspaceId: 'cloud-library',
	repositoryId: 'cloud-repository',
	activationGeneration: 0
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createHarness() {
	let current = true
	let userId = 'user-a'
	const createSignedUrl = vi.fn<
		(assetId: string) => Promise<{
			data: { signedUrl: string }
			error: Error | null
		}>
	>(async (assetId: string) => ({
		data: { signedUrl: `https://signed.example/${assetId}` },
		error: null
	}))
	const state = {
		dependencies: {
			supabase: {
				storage: {
					from: vi.fn(() => ({ createSignedUrl }))
				}
			}
		},
		async capture(capturedContext: WorkspaceOperationContext) {
			return {
				context: capturedContext,
				userId,
				startedRevision: 0
			} satisfies CloudOperationLease
		},
		isLease(value: unknown): value is CloudOperationLease {
			return Boolean(value && typeof value === 'object' && 'userId' in value)
		},
		isCurrent(lease: CloudOperationLease) {
			return current && lease.userId === userId
		}
	} as unknown as CloudRepositoryState

	return {
		createSignedUrl,
		resolver: createCloudCoverResolver(state),
		setCurrent(value: boolean) {
			current = value
		},
		setUserId(value: string) {
			userId = value
		}
	}
}

describe('cloud cover resolver', () => {
	beforeEach(() => {
		vi.useRealTimers()
	})

	it('coalesces and reuses signed URLs for the same account asset', async () => {
		const harness = createHarness()
		const reference = {
			kind: 'cloud' as const,
			assetId: 'record-1/cover.webp',
			fallbackUrl: 'https://fallback.example/cover.jpg'
		}

		const [first, concurrent] = await Promise.all([
			harness.resolver.resolve(context, reference),
			harness.resolver.resolve(context, reference)
		])
		const cached = await harness.resolver.resolve(context, reference)

		expect(first).toBe('https://signed.example/record-1/cover.webp')
		expect(concurrent).toBe(first)
		expect(cached).toBe(first)
		expect(harness.createSignedUrl).toHaveBeenCalledOnce()
	})

	it('does not share signed URLs across account leases', async () => {
		const harness = createHarness()
		const reference = {
			kind: 'cloud' as const,
			assetId: 'shared/cover.webp',
			fallbackUrl: null
		}

		await harness.resolver.resolve(context, reference)
		harness.setUserId('user-b')
		await harness.resolver.resolve(context, reference)

		expect(harness.createSignedUrl).toHaveBeenCalledTimes(2)
	})

	it('bounds signed URL reuse to the 500 most recently inserted assets', async () => {
		const harness = createHarness()

		for (let index = 0; index <= 500; index += 1) {
			await harness.resolver.resolve(context, {
				kind: 'cloud',
				assetId: `record-${index}/cover.webp`,
				fallbackUrl: null
			})
		}
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(501)

		await harness.resolver.resolve(context, {
			kind: 'cloud',
			assetId: 'record-500/cover.webp',
			fallbackUrl: null
		})
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(501)

		await harness.resolver.resolve(context, {
			kind: 'cloud',
			assetId: 'record-0/cover.webp',
			fallbackUrl: null
		})
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(502)
	})

	it('does not let a signer completing after reset repopulate the cache', async () => {
		const harness = createHarness()
		const deferred = createDeferred<{
			data: { signedUrl: string }
			error: null
		}>()
		harness.createSignedUrl.mockReturnValueOnce(deferred.promise)
		const reference = {
			kind: 'cloud' as const,
			assetId: 'record-1/slow.webp',
			fallbackUrl: 'https://fallback.example/cover.jpg'
		}

		const pending = harness.resolver.resolve(context, reference)
		await vi.waitFor(() =>
			expect(harness.createSignedUrl).toHaveBeenCalledOnce()
		)
		harness.resolver.reset()
		deferred.resolve({
			data: { signedUrl: 'https://signed.example/stale.webp' },
			error: null
		})
		await expect(pending).resolves.toBe(reference.fallbackUrl)

		await harness.resolver.resolve(context, reference)
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(2)
	})

	it('falls back for failed cloud signing and rejects browser-managed refs', async () => {
		const harness = createHarness()
		harness.createSignedUrl.mockResolvedValueOnce({
			data: { signedUrl: '' },
			error: new Error('Access denied')
		})

		await expect(
			harness.resolver.resolve(context, {
				kind: 'cloud',
				assetId: 'record-1/cover.webp',
				fallbackUrl: 'https://fallback.example/cover.jpg'
			})
		).resolves.toBe('https://fallback.example/cover.jpg')
		await expect(
			harness.resolver.resolve(context, {
				kind: 'browser',
				assetId: 'local-cover',
				fallbackUrl: 'https://fallback.example/local.jpg'
			})
		).resolves.toBeNull()
		expect(harness.createSignedUrl).toHaveBeenCalledOnce()
	})

	it('does not cache a result after its account lease becomes stale', async () => {
		const harness = createHarness()
		const deferred = createDeferred<{
			data: { signedUrl: string }
			error: null
		}>()
		harness.createSignedUrl.mockReturnValueOnce(deferred.promise)
		const reference = {
			kind: 'cloud' as const,
			assetId: 'record-1/account-switch.webp',
			fallbackUrl: 'https://fallback.example/cover.jpg'
		}

		const pending = harness.resolver.resolve(context, reference)
		await vi.waitFor(() =>
			expect(harness.createSignedUrl).toHaveBeenCalledOnce()
		)
		harness.setCurrent(false)
		deferred.resolve({
			data: { signedUrl: 'https://signed.example/stale.webp' },
			error: null
		})
		await expect(pending).resolves.toBe(reference.fallbackUrl)

		harness.setCurrent(true)
		await harness.resolver.resolve(context, reference)
		expect(harness.createSignedUrl).toHaveBeenCalledTimes(2)
	})
})
