import {
	BROWSER_DRAFT_LEASE_RENEW_INTERVAL_MS,
	type BrowserClaimedDraftState,
	type BrowserDeviceDraftReadResult,
	type BrowserDeviceDraftRepository,
	type BrowserDraftLease,
	type BrowserWorkflowDraftEntry
} from '~/repositories/deviceDrafts/contracts'

type OwnershipRepository = Pick<
	BrowserDeviceDraftRepository,
	| 'claimDraft'
	| 'takeOverDraft'
	| 'renewDraftLease'
	| 'releaseDraftLease'
	| 'readDraft'
>

export type TrackEnrichmentDraftOwnershipDependencies = {
	ownerToken: string
	getRepository: () => OwnershipRepository | null
	getDeviceRevision: () => number
	setDeviceRevision: (revision: number) => void
	captureLifecycleGuard: () => () => boolean
	runSerializedMutation: <T>(operation: () => Promise<T>) => Promise<T>
	onChange: () => void
	onRenewed: (draftId: string, lease: BrowserDraftLease) => void
	onRenewalFailed: (error: unknown) => void
	leaseRenewIntervalMs?: number
	setInterval?: typeof globalThis.setInterval
	clearInterval?: typeof globalThis.clearInterval
}

// Ownership uses the session's mutation queue and device revision. Giving lease
// operations a separate queue would race autosave's compare-and-swap writes.
export function createTrackEnrichmentDraftOwnership(
	dependencies: TrackEnrichmentDraftOwnershipDependencies
) {
	const {
		ownerToken,
		getRepository,
		getDeviceRevision,
		setDeviceRevision,
		captureLifecycleGuard,
		runSerializedMutation,
		onChange,
		onRenewed,
		onRenewalFailed
	} = dependencies
	const scheduleInterval = dependencies.setInterval ?? globalThis.setInterval
	const cancelInterval = dependencies.clearInterval ?? globalThis.clearInterval
	const intervalMs =
		dependencies.leaseRenewIntervalMs ?? BROWSER_DRAFT_LEASE_RENEW_INTERVAL_MS
	let ownedDraftId: string | null = null
	let ownedLease: BrowserDraftLease | null = null
	let timer: ReturnType<typeof globalThis.setInterval> | null = null

	function stopRenewing() {
		if (timer === null) return
		cancelInterval(timer)
		timer = null
	}

	function reset() {
		stopRenewing()
		ownedDraftId = null
		ownedLease = null
		onChange()
	}

	function accept(draftId: string, lease: BrowserDraftLease) {
		ownedDraftId = draftId
		ownedLease = lease
		onChange()
	}

	function startRenewing() {
		stopRenewing()
		if (!ownedDraftId || !ownedLease) return
		timer = scheduleInterval(() => {
			void renew()
		}, intervalMs)
	}

	async function renew() {
		const isCurrentLifecycle = captureLifecycleGuard()
		await runSerializedMutation(async () => {
			const repository = getRepository()
			const lease = ownedLease
			const draftId = ownedDraftId
			if (!repository || !lease || !draftId || !isCurrentLifecycle()) return
			try {
				const result = await repository.renewDraftLease(draftId, ownerToken, {
					deviceRevision: getDeviceRevision(),
					leaseRevision: lease.leaseRevision
				})
				if (repository !== getRepository() || !isCurrentLifecycle()) return
				setDeviceRevision(result.deviceRevision)
				ownedLease = result.value
				onRenewed(draftId, result.value)
				onChange()
				startRenewing()
			} catch (error) {
				if (repository !== getRepository() || !isCurrentLifecycle()) return
				// The session coordinates lost ownership with its unsaved-work state.
				onRenewalFailed(error)
			}
		})
	}

	async function acquire(
		draftId: string,
		isCurrentOperation: () => boolean,
		operation: (
			repository: OwnershipRepository,
			deviceRevision: number
		) => Promise<BrowserDeviceDraftReadResult<BrowserClaimedDraftState>>
	) {
		const repository = getRepository()
		if (!repository) return null
		const result = await runSerializedMutation(async () => {
			if (!isCurrentOperation()) return null
			return await operation(repository, getDeviceRevision())
		})
		if (!result || !isCurrentOperation()) return null
		setDeviceRevision(result.deviceRevision)
		accept(draftId, result.value.lease)
		return result.value
	}

	function claim(draftId: string, isCurrentOperation: () => boolean) {
		return acquire(draftId, isCurrentOperation, (repository, revision) =>
			repository.claimDraft(draftId, ownerToken, revision)
		)
	}

	function takeOver(
		draftId: string,
		leaseRevision: number,
		isCurrentOperation: () => boolean
	) {
		return acquire(draftId, isCurrentOperation, (repository, revision) =>
			repository.takeOverDraft(draftId, ownerToken, {
				deviceRevision: revision,
				leaseRevision
			})
		)
	}

	async function ensureOwned(
		getEntry: () => BrowserWorkflowDraftEntry | null,
		isCurrentOperation: () => boolean,
		onClaimed: (entry: BrowserWorkflowDraftEntry) => void
	) {
		return await runSerializedMutation(async () => {
			const entry = getEntry()
			const repository = getRepository()
			if (!entry || !repository || !isCurrentOperation()) return false
			if (ownedLease && ownedDraftId === entry.draft.metadata.id) return true
			if (entry.lease.status === 'live') return false
			const result = await repository.claimDraft(
				entry.draft.metadata.id,
				ownerToken,
				getDeviceRevision()
			)
			if (!isCurrentOperation()) return false
			setDeviceRevision(result.deviceRevision)
			ownedDraftId = entry.draft.metadata.id
			ownedLease = result.value.lease
			onClaimed({
				draft: result.value.draft,
				lease: { status: 'live', lease: result.value.lease }
			})
			onChange()
			startRenewing()
			return true
		})
	}

	async function release(isCurrentOperation: () => boolean) {
		if (!getRepository() || !ownedLease || !ownedDraftId) return true
		const result = await runSerializedMutation(async () => {
			const repository = getRepository()
			const lease = ownedLease
			const draftId = ownedDraftId
			if (!repository || !lease || !draftId || !isCurrentOperation())
				return null
			return await repository.releaseDraftLease(draftId, ownerToken, {
				deviceRevision: getDeviceRevision(),
				leaseRevision: lease.leaseRevision
			})
		})
		if (!result || !isCurrentOperation()) return false
		setDeviceRevision(result.deviceRevision)
		return true
	}

	// Teardown calls this only after draining pending saves and their shared queue.
	// A first save can have acquired a lease after teardown cleared local ownership.
	async function releaseObserved(
		repository: OwnershipRepository,
		draftId: string
	) {
		const fresh = await repository.readDraft(draftId)
		if (fresh.value?.lease.status !== 'live') return
		await repository.releaseDraftLease(draftId, ownerToken, {
			deviceRevision: fresh.deviceRevision,
			leaseRevision: fresh.value.lease.lease.leaseRevision
		})
	}

	return {
		get draftId() {
			return ownedDraftId
		},
		get lease() {
			return ownedLease
		},
		accept,
		reset,
		claim,
		takeOver,
		ensureOwned,
		renew,
		startRenewing,
		stopRenewing,
		release,
		releaseObserved
	}
}
