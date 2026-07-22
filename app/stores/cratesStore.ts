import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import {
	ensureCloudWorkbenchRuntime,
	ensureDemoWorkbenchRuntime
} from '~/composables/useWorkbench'
import type { WorkspaceOperationContext } from '~/repositories/library/contracts'
import {
	compareCreatedAtDescIdDesc,
	postgresTimestampMicroseconds
} from '~/utils/supabaseOrdering'
import {
	getWorkbenchRuntime,
	isDemoWorkbenchPinia
} from '~/utils/workbenchPinia'
import type {
	CrateCreateInput,
	CrateMetadataUpdate,
	LibraryCrate
} from '~~/shared/types/library'

type AccountContext = WorkspaceOperationContext & {
	generation: number
}

type FetchSnapshot = {
	crateIds: Set<string>
	crateRevisions: Map<string, number>
}

type DecodedCrate = {
	crate: LibraryCrate
	version: bigint | null
}

type CrateMembershipRpc = 'add_record_to_crate' | 'remove_record_from_crate'

type CrateMetadataField = keyof CrateMetadataUpdate

type OptimisticMetadataField = {
	token: symbol
	value: LibraryCrate[CrateMetadataField]
}

type MembershipContext = {
	account: AccountContext
	crateRevision: number
}

type MembershipResult = {
	context: MembershipContext
	crate: LibraryCrate
}

type PendingMembershipOperation = {
	crateId: string
}

export const useCratesStore = defineStore('crates', () => {
	const pinia = getActivePinia()
	const runtime =
		getWorkbenchRuntime(pinia) ??
		(isDemoWorkbenchPinia(pinia)
			? ensureDemoWorkbenchRuntime(pinia!)
			: ensureCloudWorkbenchRuntime(pinia!))

	const crates = ref<LibraryCrate[]>([])
	const isLoadingCrates = ref(false)
	const isCreatingCrate = ref(false)
	const isUpdatingCrate = ref(false)
	const isDeletingCrate = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let activeFetchContext: AccountContext | null = null
	let activeCreateOperations = 0
	let activeUpdateOperations = 0
	let activeDeleteOperations = 0
	const authoritativeCrates = new Map<string, LibraryCrate>()
	const authoritativeVersions = new Map<string, bigint | null>()
	const crateRevisions = new Map<string, number>()
	const crateLifecycleBoundaries = new Map<string, number>()
	const explicitDeletionTombstones = new Set<string>()
	const optimisticMetadataFields = new Map<
		string,
		Map<CrateMetadataField, OptimisticMetadataField>
	>()
	const pendingMembershipOperations = new Map<
		string,
		Set<PendingMembershipOperation>
	>()
	// A delayed fetch or membership response may predate committed deletion.
	// Filter only that record while allowing unrelated crate changes to publish.
	const removedRecordMembershipTombstones = new Set<string>()

	const crateToDelete = ref<LibraryCrate | null>(null)

	const cratesCount = computed(() => crates.value.length)
	const hasCrates = computed(() => crates.value.length > 0)

	function captureAccountContext(): AccountContext | null {
		const captured = runtime.capture()
		return captured.descriptor.readOnly
			? null
			: { ...captured.context, generation: accountGeneration }
	}

	function isCurrentAccountContext(context: AccountContext): boolean {
		return (
			context.generation === accountGeneration && runtime.isCurrent(context)
		)
	}

	function isCurrentFetchContext(context: AccountContext): boolean {
		return isCurrentAccountContext(context) && activeFetchContext === context
	}

	function repositoriesFor(context: AccountContext) {
		if (!isCurrentAccountContext(context)) return null
		const captured = runtime.capture()
		return runtime.isCurrent(context) ? captured.repositories : null
	}

	function isReadOnlyWorkbench(): boolean {
		return runtime.capture().descriptor.readOnly
	}

	function beginUpdateOperation(context: AccountContext): () => void {
		activeUpdateOperations += 1
		isUpdatingCrate.value = true
		let finished = false

		return () => {
			if (finished) return
			finished = true
			if (!isCurrentAccountContext(context)) return
			activeUpdateOperations = Math.max(0, activeUpdateOperations - 1)
			isUpdatingCrate.value = activeUpdateOperations > 0
		}
	}

	function beginCreateOperation(context: AccountContext): () => void {
		activeCreateOperations += 1
		isCreatingCrate.value = true
		let finished = false

		return () => {
			if (finished) return
			finished = true
			if (!isCurrentAccountContext(context)) return
			activeCreateOperations = Math.max(0, activeCreateOperations - 1)
			isCreatingCrate.value = activeCreateOperations > 0
		}
	}

	function beginDeleteOperation(context: AccountContext): () => void {
		activeDeleteOperations += 1
		isDeletingCrate.value = true
		let finished = false

		return () => {
			if (finished) return
			finished = true
			if (!isCurrentAccountContext(context)) return
			activeDeleteOperations = Math.max(0, activeDeleteOperations - 1)
			isDeletingCrate.value = activeDeleteOperations > 0
		}
	}

	function getCrateRevision(crateId: string): number {
		return crateRevisions.get(crateId) ?? 0
	}

	function invalidateCrate(crateId: string): number {
		const revision = getCrateRevision(crateId) + 1
		crateRevisions.set(crateId, revision)
		return revision
	}

	function wasInvalidatedByLifecycle(
		crateId: string,
		operationRevision: number
	): boolean {
		return (crateLifecycleBoundaries.get(crateId) ?? 0) > operationRevision
	}

	function isCurrentMembershipContext(
		context: MembershipContext,
		crateId: string
	): boolean {
		return (
			isCurrentAccountContext(context.account) &&
			context.crateRevision === getCrateRevision(crateId)
		)
	}

	function beginMembershipOperation(
		recordId: string,
		crateId: string
	): () => void {
		const operation = { crateId }
		let operations = pendingMembershipOperations.get(recordId)
		if (!operations) {
			operations = new Set()
			pendingMembershipOperations.set(recordId, operations)
		}
		operations.add(operation)

		return () => {
			const currentOperations = pendingMembershipOperations.get(recordId)
			if (!currentOperations?.delete(operation)) return
			if (currentOperations.size === 0) {
				pendingMembershipOperations.delete(recordId)
			}
		}
	}

	function decodeCrate(crate: LibraryCrate, expectedId?: string): DecodedCrate {
		if (expectedId !== undefined && crate.id !== expectedId) {
			throw new Error('Invalid crate response.')
		}
		const version = crate.updated_at
			? postgresTimestampMicroseconds(crate.updated_at)
			: null
		if (crate.updated_at !== null && version === null) {
			throw new Error('Invalid crate response.')
		}
		return {
			crate: {
				...crate,
				records: crate.records.filter(
					(recordId) => !removedRecordMembershipTombstones.has(recordId)
				)
			},
			version
		}
	}

	function overlayOptimisticMetadata(crate: LibraryCrate): LibraryCrate {
		const fields = optimisticMetadataFields.get(crate.id)
		if (!fields) return crate

		const updates = Object.fromEntries(
			[...fields].map(([field, owner]) => [field, owner.value])
		) as CrateMetadataUpdate
		return { ...crate, ...updates }
	}

	function insertCrateInDeclaredOrder(
		rows: LibraryCrate[],
		crate: LibraryCrate
	): void {
		const insertAt = rows.findIndex(
			(existingCrate) => compareCreatedAtDescIdDesc(crate, existingCrate) < 0
		)
		if (insertAt === -1) rows.push(crate)
		else rows.splice(insertAt, 0, crate)
	}

	function canAdvanceAuthoritativeVersion(
		crateId: string,
		version: bigint | null
	): boolean {
		if (!authoritativeVersions.has(crateId)) return true

		const appliedVersion = authoritativeVersions.get(crateId)!
		return (
			version !== null && (appliedVersion === null || version > appliedVersion)
		)
	}

	function recordAuthoritativeCrate(decoded: DecodedCrate): boolean {
		const { crate, version } = decoded
		if (!canAdvanceAuthoritativeVersion(crate.id, version)) return false

		authoritativeVersions.set(crate.id, version)
		authoritativeCrates.set(crate.id, crate)
		return true
	}

	function applyAuthoritativeCrate(
		decoded: DecodedCrate,
		options?: { insertInDeclaredOrder?: boolean }
	): boolean {
		const accepted = recordAuthoritativeCrate(decoded)
		const authoritativeCrate = authoritativeCrates.get(decoded.crate.id)
		const crateIndex = crates.value.findIndex(
			({ id }) => id === decoded.crate.id
		)

		if (crateIndex !== -1 && authoritativeCrate) {
			crates.value[crateIndex] = overlayOptimisticMetadata(authoritativeCrate)
		} else if (authoritativeCrate && options?.insertInDeclaredOrder) {
			const renderedCrate = overlayOptimisticMetadata(authoritativeCrate)
			insertCrateInDeclaredOrder(crates.value, renderedCrate)
		}

		return accepted
	}

	function captureFetchSnapshot(): FetchSnapshot {
		return {
			crateIds: new Set(crates.value.map(({ id }) => id)),
			crateRevisions: new Map(crateRevisions)
		}
	}

	function reconcileFetchedCrates(
		decodedRows: DecodedCrate[],
		snapshot: FetchSnapshot
	): void {
		const decodedIds = new Set<string>()
		for (const { crate } of decodedRows) {
			if (decodedIds.has(crate.id)) throw new Error('Invalid crate response.')
			decodedIds.add(crate.id)
		}

		const currentRows = new Map(crates.value.map((crate) => [crate.id, crate]))
		const fetchedIds = new Set<string>()
		const reconciledRows: LibraryCrate[] = []
		const rowsAddedDuringFetch: LibraryCrate[] = []

		for (const decoded of decodedRows) {
			const crateId = decoded.crate.id
			fetchedIds.add(crateId)

			const revisionAtStart = snapshot.crateRevisions.get(crateId) ?? 0
			if (
				revisionAtStart !== getCrateRevision(crateId) ||
				explicitDeletionTombstones.has(crateId)
			) {
				const currentCrate = currentRows.get(crateId)
				if (currentCrate) reconciledRows.push(currentCrate)
				continue
			}

			recordAuthoritativeCrate(decoded)
			const authoritativeCrate = authoritativeCrates.get(crateId)
			if (authoritativeCrate) {
				reconciledRows.push(overlayOptimisticMetadata(authoritativeCrate))
			} else {
				const currentCrate = currentRows.get(crateId)
				if (currentCrate) reconciledRows.push(currentCrate)
			}
		}

		for (const currentCrate of currentRows.values()) {
			if (fetchedIds.has(currentCrate.id)) continue

			const wasAddedDuringFetch = !snapshot.crateIds.has(currentCrate.id)
			if (wasAddedDuringFetch) {
				rowsAddedDuringFetch.push(currentCrate)
				continue
			}

			authoritativeCrates.delete(currentCrate.id)
			authoritativeVersions.delete(currentCrate.id)
			optimisticMetadataFields.delete(currentCrate.id)
			const lifecycleRevision = invalidateCrate(currentCrate.id)
			crateLifecycleBoundaries.set(currentCrate.id, lifecycleRevision)
		}

		for (const addedCrate of rowsAddedDuringFetch.sort(
			compareCreatedAtDescIdDesc
		)) {
			insertCrateInDeclaredOrder(reconciledRows, addedCrate)
		}
		crates.value = reconciledRows
	}

	async function performFetchAllCrates(generation: number): Promise<boolean> {
		isLoadingCrates.value = true
		const context = captureAccountContext()
		try {
			if (!context || context.generation !== generation) return false
			activeFetchContext = context
			if (!isCurrentFetchContext(context)) return false
			const snapshot = captureFetchSnapshot()
			const repositories = repositoriesFor(context)
			if (!repositories) return false
			const outcome = await repositories.crates.list(context)
			if (!isCurrentFetchContext(context)) return false
			if (outcome.status === 'stale') return false
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return false
			}

			const decodedRows = outcome.value
				.map((crate) => decodeCrate(crate))
				.sort((left, right) =>
					compareCreatedAtDescIdDesc(left.crate, right.crate)
				)
			reconcileFetchedCrates(decodedRows, snapshot)
			return true
		} catch (error) {
			if (!context || !isCurrentFetchContext(context)) return false
			console.error('Failed to fetch crates:', error)
			toast.error('Error fetching crates.')
			return false
		} finally {
			const isCurrentOperation = context
				? isCurrentFetchContext(context)
				: generation === accountGeneration
			if (isCurrentOperation) isLoadingCrates.value = false
			if (activeFetchContext === context) activeFetchContext = null
		}
	}

	function fetchAllCrates(): Promise<boolean> {
		if (runtime.capture().descriptor.location === 'demo') {
			return Promise.resolve(true)
		}
		if (fetchPromise) return fetchPromise

		const createdPromise = performFetchAllCrates(accountGeneration).finally(
			() => {
				if (fetchPromise === createdPromise) fetchPromise = null
			}
		)
		fetchPromise = createdPromise
		return createdPromise
	}

	async function createCrate(
		crateData: CrateCreateInput
	): Promise<LibraryCrate | null> {
		if (isReadOnlyWorkbench()) return null
		const context = captureAccountContext()
		if (!context) {
			toast.error('You must be signed in to create crates.')
			return null
		}

		const finishCreate = beginCreateOperation(context)
		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return null
			const outcome = await repositories.crates.create(context, crateData)
			if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
				return null
			}
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return null
			}

			const decoded = decodeCrate(outcome.value)
			applyAuthoritativeCrate(decoded, { insertInDeclaredOrder: true })
			toast.success('Crate created successfully.')
			return decoded.crate
		} catch (error) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to create crate:', error)
			toast.error('Error creating crate.')
			return null
		} finally {
			finishCreate()
		}
	}

	async function updateCrate(
		id: string,
		updates: CrateMetadataUpdate
	): Promise<LibraryCrate | null> {
		if (isReadOnlyWorkbench()) return null
		const crateIndex = crates.value.findIndex((c: LibraryCrate) => c.id === id)
		if (crateIndex === -1) {
			toast.error('Crate not found.')
			return null
		}
		const context = captureAccountContext()
		if (!context) {
			toast.error('Error updating crate.')
			return null
		}
		const crateRevision = getCrateRevision(id)
		const finishUpdate = beginUpdateOperation(context)

		const token = Symbol('crate metadata update')
		const originalValues = new Map<
			CrateMetadataField,
			LibraryCrate[CrateMetadataField]
		>()
		const optimisticValues = new Map<
			CrateMetadataField,
			LibraryCrate[CrateMetadataField]
		>()
		const owners =
			optimisticMetadataFields.get(id) ??
			new Map<CrateMetadataField, OptimisticMetadataField>()
		const originalCrate = crates.value[crateIndex]!
		for (const field of Object.keys(updates) as CrateMetadataField[]) {
			const value = updates[field] as LibraryCrate[CrateMetadataField]
			if (value === undefined) continue
			originalValues.set(field, originalCrate[field])
			optimisticValues.set(field, value)
			owners.set(field, { token, value })
		}
		if (owners.size > 0) optimisticMetadataFields.set(id, owners)
		crates.value[crateIndex] = { ...originalCrate, ...updates } as LibraryCrate

		function releaseOwnedFields(): void {
			const currentOwners = optimisticMetadataFields.get(id)
			if (!currentOwners) return
			for (const field of originalValues.keys()) {
				if (currentOwners.get(field)?.token === token) {
					currentOwners.delete(field)
				}
			}
			if (currentOwners.size === 0) optimisticMetadataFields.delete(id)
		}

		function rollbackOwnedFields(): void {
			const currentOwners = optimisticMetadataFields.get(id)
			const currentIndex = crates.value.findIndex((crate) => crate.id === id)
			const currentCrate = crates.value[currentIndex]
			if (!currentOwners || !currentCrate) {
				releaseOwnedFields()
				return
			}

			let rolledBackCrate = { ...currentCrate }
			const authoritativeCrate = authoritativeCrates.get(id)
			for (const [field, originalValue] of originalValues) {
				if (currentOwners.get(field)?.token !== token) continue
				if (Object.is(currentCrate[field], optimisticValues.get(field))) {
					rolledBackCrate = {
						...rolledBackCrate,
						[field]: authoritativeCrate
							? authoritativeCrate[field]
							: originalValue
					}
				}
				currentOwners.delete(field)
			}
			if (currentOwners.size === 0) optimisticMetadataFields.delete(id)
			crates.value[currentIndex] = overlayOptimisticMetadata(rolledBackCrate)
		}

		function commitOwnedFields(decoded: DecodedCrate): LibraryCrate | null {
			const { crate, version } = decoded
			const currentIndex = crates.value.findIndex(
				(candidate) => candidate.id === id
			)
			const currentCrate = crates.value[currentIndex]
			const currentOwners = optimisticMetadataFields.get(id)
			if (!currentCrate) {
				releaseOwnedFields()
				return null
			}

			if (
				wasInvalidatedByLifecycle(id, crateRevision) ||
				!canAdvanceAuthoritativeVersion(id, version)
			) {
				releaseOwnedFields()
				const authoritativeCrate = authoritativeCrates.get(id)
				if (authoritativeCrate) {
					crates.value[currentIndex] =
						overlayOptimisticMetadata(authoritativeCrate)
				}
				return null
			}

			let committedOwnedField = false
			for (const field of originalValues.keys()) {
				if (currentOwners?.get(field)?.token !== token) continue
				committedOwnedField = true
				currentOwners.delete(field)
			}

			const authoritativeCrate = authoritativeCrates.get(id)
			const committedAuthoritativeCrate = {
				...crate,
				records: (authoritativeCrate ?? currentCrate).records
			}
			authoritativeCrates.set(id, committedAuthoritativeCrate)
			authoritativeVersions.set(id, version)
			if (currentOwners?.size === 0) optimisticMetadataFields.delete(id)
			crates.value[currentIndex] = overlayOptimisticMetadata(
				committedAuthoritativeCrate
			)
			return committedOwnedField ? committedAuthoritativeCrate : null
		}

		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return null
			const outcome = await repositories.crates.updateMetadata(context, {
				id,
				updates
			})
			if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
				return null
			}
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return null
			}

			const decoded = decodeCrate(outcome.value, id)
			if (crateRevision !== getCrateRevision(id)) {
				return commitOwnedFields(decoded)
			}
			releaseOwnedFields()
			return applyAuthoritativeCrate(decoded) ? decoded.crate : null
		} catch (error) {
			if (!isCurrentAccountContext(context)) return null
			console.error('Failed to update crate:', error)
			rollbackOwnedFields()
			toast.error('Error updating crate.')
			return null
		} finally {
			finishUpdate()
		}
	}

	async function mutateCrateMembership(
		rpcName: CrateMembershipRpc,
		crateId: string,
		recordId: string
	): Promise<MembershipResult | null> {
		const account = captureAccountContext()
		if (!account) {
			toast.error('Error updating crate.')
			return null
		}
		const context = {
			account,
			crateRevision: getCrateRevision(crateId)
		}
		const finishMembership = beginMembershipOperation(recordId, crateId)
		const finishUpdate = beginUpdateOperation(account)

		try {
			const repositories = repositoriesFor(account)
			if (!repositories) return null
			const outcome = await (rpcName === 'add_record_to_crate'
				? repositories.crates.addRecord(account, { crateId, recordId })
				: repositories.crates.removeRecord(account, { crateId, recordId }))
			if (
				!isCurrentMembershipContext(context, crateId) ||
				outcome.status === 'stale'
			) {
				return null
			}
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(account, outcome.repositoryRevision)
			) {
				return null
			}

			const decoded = decodeCrate(outcome.value, crateId)
			applyAuthoritativeCrate(decoded)
			return { context, crate: decoded.crate }
		} catch (error) {
			if (!isCurrentMembershipContext(context, crateId)) return null
			console.error('Failed to update crate:', error)
			toast.error('Error updating crate.')
			return null
		} finally {
			finishMembership()
			finishUpdate()
		}
	}

	async function deleteCrate(id: string): Promise<boolean> {
		if (isReadOnlyWorkbench()) return false
		const crateIndex = crates.value.findIndex((c: LibraryCrate) => c.id === id)
		if (crateIndex === -1) {
			toast.error('Crate not found.')
			return false
		}
		const context = captureAccountContext()
		if (!context) {
			toast.error('Error deleting crate.')
			return false
		}
		const finishDelete = beginDeleteOperation(context)
		const deletionRevision = invalidateCrate(id)
		crateLifecycleBoundaries.set(id, deletionRevision)
		explicitDeletionTombstones.add(id)
		optimisticMetadataFields.delete(id)

		const removedCrate = crates.value.splice(crateIndex, 1)[0]!

		try {
			const repositories = repositoriesFor(context)
			if (!repositories) return false
			const outcome = await repositories.crates.delete(context, { id })
			if (!isCurrentAccountContext(context) || outcome.status === 'stale') {
				return false
			}
			if (outcome.status !== 'success') {
				throw outcome.status === 'unavailable'
					? (outcome.error ?? new Error(outcome.reason))
					: new Error(outcome.reason)
			}
			if (
				!runtime.acceptRepositoryRevision(context, outcome.repositoryRevision)
			) {
				return false
			}

			crates.value = crates.value.filter((crate) => crate.id !== id)
			authoritativeCrates.delete(id)
			authoritativeVersions.delete(id)
			optimisticMetadataFields.delete(id)
			toast.success('Crate deleted successfully.')
			return true
		} catch (error) {
			if (!isCurrentAccountContext(context)) return false
			console.error('Failed to delete crate:', error)
			const safeCrate = authoritativeCrates.get(id) ?? removedCrate
			explicitDeletionTombstones.delete(id)
			applyAuthoritativeCrate(decodeCrate(safeCrate, id), {
				insertInDeclaredOrder: true
			})
			toast.error('Error deleting crate.')
			return false
		} finally {
			finishDelete()
		}
	}

	async function addRecordToCrate(
		crateId: string,
		recordId: string,
		options?: { silent?: boolean }
	): Promise<boolean> {
		const crate = getCrateById(crateId)
		if (!crate) {
			toast.error('Crate not found.')
			return false
		}

		const wasLocallyPresent = crate.records.includes(recordId)
		if (isReadOnlyWorkbench()) {
			if (wasLocallyPresent && !options?.silent) {
				toast.info('Record is already in this crate.')
			}
			return false
		}

		const result = await mutateCrateMembership(
			'add_record_to_crate',
			crateId,
			recordId
		)

		if (!result || !isCurrentMembershipContext(result.context, crateId)) {
			return false
		}

		const reconciledCrate = getCrateById(crateId)
		if (!reconciledCrate?.records.includes(recordId)) return false

		if (!options?.silent) {
			if (wasLocallyPresent) toast.info('Record is already in this crate.')
			else toast.success('Record added to crate.')
		}
		return true
	}

	async function removeRecordFromCrate(
		crateId: string,
		recordId: string
	): Promise<boolean> {
		const crate = getCrateById(crateId)
		if (!crate) {
			toast.error('Crate not found.')
			return false
		}

		const wasLocallyAbsent = !crate.records.includes(recordId)
		if (isReadOnlyWorkbench()) {
			if (wasLocallyAbsent) toast.info('Record is not in this crate.')
			return false
		}

		const result = await mutateCrateMembership(
			'remove_record_from_crate',
			crateId,
			recordId
		)

		if (!result || !isCurrentMembershipContext(result.context, crateId)) {
			return false
		}

		const reconciledCrate = getCrateById(crateId)
		if (!reconciledCrate || reconciledCrate.records.includes(recordId)) {
			return false
		}
		if (wasLocallyAbsent) toast.info('Record is not in this crate.')
		return true
	}

	function getCrateById(id: string): LibraryCrate | undefined {
		return crates.value.find((c: LibraryCrate) => c.id === id)
	}

	function getCratesContainingRecord(recordId: string): LibraryCrate[] {
		return crates.value.filter((crate: LibraryCrate) =>
			crate.records.includes(recordId)
		)
	}

	function getCrateIdsAffectedByRecordRemoval(recordId: string): string[] {
		const affectedIds = new Set(
			getCratesContainingRecord(recordId).map(({ id }) => id)
		)
		for (const operation of pendingMembershipOperations.get(recordId) ?? []) {
			affectedIds.add(operation.crateId)
		}
		return [...affectedIds]
	}

	function removeRecordFromCrates(
		recordId: string,
		affectedCrateIds: readonly string[]
	) {
		removedRecordMembershipTombstones.add(recordId)
		const affectedIds = new Set([
			...affectedCrateIds,
			...getCrateIdsAffectedByRecordRemoval(recordId)
		])
		for (const crateId of affectedIds) {
			const authoritativeCrate = authoritativeCrates.get(crateId)
			if (authoritativeCrate) {
				authoritativeCrates.set(crateId, {
					...authoritativeCrate,
					records: authoritativeCrate.records.filter((id) => id !== recordId)
				})
			}
		}
		crates.value = crates.value.map((crate) =>
			affectedIds.has(crate.id)
				? {
						...crate,
						records: crate.records.filter((id) => id !== recordId)
					}
				: crate
		)
	}

	function clearAllCrateRecords() {
		for (const crate of crates.value) {
			invalidateCrate(crate.id)
			const authoritativeCrate = authoritativeCrates.get(crate.id)
			if (authoritativeCrate) {
				authoritativeCrates.set(crate.id, {
					...authoritativeCrate,
					records: []
				})
			}
		}
		crates.value = crates.value.map((crate) => ({
			...crate,
			records: []
		}))
	}

	function clearCrates() {
		accountGeneration += 1
		fetchPromise = null
		activeFetchContext = null
		activeCreateOperations = 0
		activeUpdateOperations = 0
		activeDeleteOperations = 0
		authoritativeCrates.clear()
		authoritativeVersions.clear()
		crateRevisions.clear()
		crateLifecycleBoundaries.clear()
		explicitDeletionTombstones.clear()
		optimisticMetadataFields.clear()
		pendingMembershipOperations.clear()
		removedRecordMembershipTombstones.clear()
		isLoadingCrates.value = false
		isCreatingCrate.value = false
		isUpdatingCrate.value = false
		isDeletingCrate.value = false
		crateToDelete.value = null
		crates.value = []
	}

	return {
		crates,
		isLoadingCrates,
		isCreatingCrate,
		isUpdatingCrate,
		isDeletingCrate,
		crateToDelete,
		cratesCount,
		hasCrates,
		fetchAllCrates,
		createCrate,
		updateCrate,
		deleteCrate,
		addRecordToCrate,
		removeRecordFromCrate,
		getCrateById,
		getCratesContainingRecord,
		getCrateIdsAffectedByRecordRemoval,
		removeRecordFromCrates,
		clearAllCrateRecords,
		clearCrates
	}
})
