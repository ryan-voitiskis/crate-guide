import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'

type AccountContext = {
	generation: number
	userId: string
}

type FetchSnapshot = {
	crateIds: Set<string>
	crateRevisions: Map<string, number>
}

type DecodedCrate = {
	crate: Crate
	version: bigint | null
}

type CrateMetadataUpdate = Partial<
	Omit<Crate, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'records'>
>

type CrateMembershipRpc = 'add_record_to_crate' | 'remove_record_from_crate'

type CrateMetadataField = keyof CrateMetadataUpdate

type OptimisticMetadataField = {
	token: symbol
	value: Crate[CrateMetadataField]
}

type MembershipContext = {
	account: AccountContext
	crateRevision: number
}

type MembershipResult = {
	context: MembershipContext
	crate: Crate
}

const POSTGRES_TIMESTAMP_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/

export const useCratesStore = defineStore('crates', () => {
	const supabase = useSupabaseClient<Database>()
	const pinia = getActivePinia()
	const isDemoStore = isDemoWorkbenchPinia(pinia)
	const user = useUserStore(pinia)

	const crates = ref<Crate[]>([])
	const isLoadingCrates = ref(false)
	const isCreatingCrate = ref(false)
	const isUpdatingCrate = ref(false)
	const isDeletingCrate = ref(false)
	let fetchPromise: Promise<boolean> | null = null
	let accountGeneration = 0
	let activeFetchUserId: string | null = null
	let activeCreateOperations = 0
	let activeUpdateOperations = 0
	let activeDeleteOperations = 0
	const authoritativeCrates = new Map<string, Crate>()
	const authoritativeVersions = new Map<string, bigint | null>()
	const crateRevisions = new Map<string, number>()
	const crateLifecycleBoundaries = new Map<string, number>()
	const explicitDeletionTombstones = new Set<string>()
	const optimisticMetadataFields = new Map<
		string,
		Map<CrateMetadataField, OptimisticMetadataField>
	>()

	// Dialog state (store-based pattern)
	const crateToDelete = ref<Crate | null>(null)

	const cratesCount = computed(() => crates.value.length)
	const hasCrates = computed(() => crates.value.length > 0)

	function captureAccountContext(): AccountContext | null {
		const userId = user.supaUserId
		return userId ? { generation: accountGeneration, userId } : null
	}

	function isCurrentAccountContext(context: AccountContext): boolean {
		return (
			context.generation === accountGeneration &&
			user.supaUserId === context.userId
		)
	}

	function isCurrentFetchContext(context: AccountContext): boolean {
		return (
			isCurrentAccountContext(context) && activeFetchUserId === context.userId
		)
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

	function postgresTimestampMicroseconds(value: string): bigint | null {
		const match = POSTGRES_TIMESTAMP_PATTERN.exec(value)
		if (!match) return null

		const [
			,
			yearValue,
			monthValue,
			dayValue,
			hourValue,
			minuteValue,
			secondValue,
			fraction = '',
			offset,
			offsetSign,
			offsetHourValue,
			offsetMinuteValue
		] = match
		const year = Number(yearValue)
		const month = Number(monthValue)
		const day = Number(dayValue)
		const hour = Number(hourValue)
		const minute = Number(minuteValue)
		const second = Number(secondValue)
		const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
		const daysInMonth = [
			31,
			isLeapYear ? 29 : 28,
			31,
			30,
			31,
			30,
			31,
			31,
			30,
			31,
			30,
			31
		]

		if (
			year < 1 ||
			month < 1 ||
			month > 12 ||
			day < 1 ||
			day > daysInMonth[month - 1]! ||
			hour > 23 ||
			minute > 59 ||
			second > 59
		) {
			return null
		}

		let offsetMinutes = 0
		if (offset !== 'Z') {
			const offsetHours = Number(offsetHourValue)
			const offsetMinute = Number(offsetMinuteValue)
			if (
				offsetHours > 14 ||
				offsetMinute > 59 ||
				(offsetHours === 14 && offsetMinute !== 0)
			) {
				return null
			}
			offsetMinutes =
				(offsetHours * 60 + offsetMinute) * (offsetSign === '-' ? -1 : 1)
		}

		const date = new Date(0)
		date.setUTCFullYear(year, month - 1, day)
		date.setUTCHours(hour, minute, second, 0)
		const absoluteMilliseconds =
			BigInt(date.getTime()) - BigInt(offsetMinutes) * 60_000n

		return absoluteMilliseconds * 1000n + BigInt(fraction.padEnd(6, '0'))
	}

	function decodeCrate(
		data: unknown,
		expected: { id?: string; userId: string }
	): DecodedCrate {
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			throw new Error('Invalid crate response.')
		}

		const candidate = data as Record<string, unknown>
		const nullableStringsAreValid = ['description', 'color'].every(
			(field) =>
				candidate[field] === null || typeof candidate[field] === 'string'
		)
		const timestampsAreValid = ['created_at', 'updated_at'].every((field) => {
			const value = candidate[field]
			return (
				value === null ||
				(typeof value === 'string' &&
					postgresTimestampMicroseconds(value) !== null)
			)
		})

		if (
			typeof candidate.id !== 'string' ||
			candidate.id !== (expected.id ?? candidate.id) ||
			typeof candidate.name !== 'string' ||
			typeof candidate.user_id !== 'string' ||
			candidate.user_id !== expected.userId ||
			!nullableStringsAreValid ||
			!timestampsAreValid ||
			!Array.isArray(candidate.records) ||
			!candidate.records.every((recordId) => typeof recordId === 'string')
		) {
			throw new Error('Invalid crate response.')
		}

		const updatedAt = candidate.updated_at as string | null
		return {
			crate: {
				id: candidate.id,
				name: candidate.name,
				description: candidate.description as string | null,
				color: candidate.color as string | null,
				records: candidate.records,
				user_id: candidate.user_id,
				created_at: candidate.created_at as string | null,
				updated_at: updatedAt
			},
			version:
				updatedAt === null ? null : postgresTimestampMicroseconds(updatedAt)
		}
	}

	function overlayOptimisticMetadata(crate: Crate): Crate {
		const fields = optimisticMetadataFields.get(crate.id)
		if (!fields) return crate

		const updates = Object.fromEntries(
			[...fields].map(([field, owner]) => [field, owner.value])
		) as CrateMetadataUpdate
		return { ...crate, ...updates }
	}

	function compareCratesByDeclaredOrder(left: Crate, right: Crate): number {
		const leftCreatedAt = left.created_at
			? postgresTimestampMicroseconds(left.created_at)
			: null
		const rightCreatedAt = right.created_at
			? postgresTimestampMicroseconds(right.created_at)
			: null

		if (leftCreatedAt === null && rightCreatedAt !== null) return 1
		if (leftCreatedAt !== null && rightCreatedAt === null) return -1
		if (leftCreatedAt !== null && rightCreatedAt !== null) {
			if (leftCreatedAt > rightCreatedAt) return -1
			if (leftCreatedAt < rightCreatedAt) return 1
		}

		if (left.id === right.id) return 0
		return left.id > right.id ? -1 : 1
	}

	function insertCrateInDeclaredOrder(rows: Crate[], crate: Crate): void {
		const insertAt = rows.findIndex(
			(existingCrate) => compareCratesByDeclaredOrder(crate, existingCrate) < 0
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
		const reconciledRows: Crate[] = []
		const rowsAddedDuringFetch: Crate[] = []

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
			compareCratesByDeclaredOrder
		)) {
			insertCrateInDeclaredOrder(reconciledRows, addedCrate)
		}
		crates.value = reconciledRows
	}

	async function performFetchAllCrates(generation: number): Promise<boolean> {
		isLoadingCrates.value = true
		let context: AccountContext | null = null
		try {
			let userId: string
			try {
				userId = await user.resolveAuthenticatedUserId()
			} catch (error) {
				if (generation !== accountGeneration) return false
				console.error('Auth failed in cratesStore:', error)
				toast.error('Failed to load data')
				return false
			}
			if (generation !== accountGeneration) return false
			activeFetchUserId = userId
			context = { generation, userId }
			if (!isCurrentFetchContext(context)) return false
			const snapshot = captureFetchSnapshot()

			const rows = await fetchAllSupabasePages(async (from, to) => {
				return await supabase
					.from('crates')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false, nullsFirst: false })
					.order('id', { ascending: false })
					.range(from, to)
			})
			if (!isCurrentFetchContext(context)) return false

			const decodedRows = rows.map((row) => decodeCrate(row, { userId }))
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
		}
	}

	function fetchAllCrates(): Promise<boolean> {
		if (isDemoStore) return Promise.resolve(true)
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
		crateData: Omit<Crate, 'id' | 'user_id' | 'created_at' | 'updated_at'>
	): Promise<Crate | null> {
		if (isDemoStore) return null
		const context = captureAccountContext()
		if (!context) {
			toast.error('You must be signed in to create crates.')
			return null
		}

		const finishCreate = beginCreateOperation(context)
		try {
			const { data, error } = await supabase
				.from('crates')
				.insert({
					...crateData,
					user_id: context.userId
				})
				.select()
				.single()

			if (error) throw error
			if (!isCurrentAccountContext(context)) return null

			const decoded = decodeCrate(data, { userId: context.userId })
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
	): Promise<Crate | null> {
		if (isDemoStore) return null
		const crateIndex = crates.value.findIndex((c: Crate) => c.id === id)
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
			Crate[CrateMetadataField]
		>()
		const optimisticValues = new Map<
			CrateMetadataField,
			Crate[CrateMetadataField]
		>()
		const owners =
			optimisticMetadataFields.get(id) ??
			new Map<CrateMetadataField, OptimisticMetadataField>()
		const originalCrate = crates.value[crateIndex]!
		for (const field of Object.keys(updates) as CrateMetadataField[]) {
			const value = updates[field] as Crate[CrateMetadataField]
			if (value === undefined) continue
			originalValues.set(field, originalCrate[field])
			optimisticValues.set(field, value)
			owners.set(field, { token, value })
		}
		if (owners.size > 0) optimisticMetadataFields.set(id, owners)
		crates.value[crateIndex] = { ...originalCrate, ...updates } as Crate

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

		function commitOwnedFields(decoded: DecodedCrate): Crate | null {
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
			const { data, error } = await supabase
				.from('crates')
				.update(updates)
				.eq('id', id)
				.select()
				.single()

			if (error) throw error
			if (!isCurrentAccountContext(context)) return null

			const decoded = decodeCrate(data, { id, userId: context.userId })
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
		const finishUpdate = beginUpdateOperation(account)

		try {
			const { data, error } = await supabase.rpc(rpcName, {
				target_crate_id: crateId,
				target_record_id: recordId
			})
			if (error) throw error
			if (!isCurrentMembershipContext(context, crateId)) return null

			const decoded = decodeCrate(data, {
				id: crateId,
				userId: account.userId
			})
			applyAuthoritativeCrate(decoded)
			return { context, crate: decoded.crate }
		} catch (error) {
			if (!isCurrentMembershipContext(context, crateId)) return null
			console.error('Failed to update crate:', error)
			toast.error('Error updating crate.')
			return null
		} finally {
			finishUpdate()
		}
	}

	async function deleteCrate(id: string): Promise<boolean> {
		if (isDemoStore) return false
		const crateIndex = crates.value.findIndex((c: Crate) => c.id === id)
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
			const { error } = await supabase.from('crates').delete().eq('id', id)

			if (error) throw error
			if (!isCurrentAccountContext(context)) return false

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
			applyAuthoritativeCrate(
				decodeCrate(safeCrate, { id, userId: context.userId }),
				{ insertInDeclaredOrder: true }
			)
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
		if (isDemoStore) {
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
		if (isDemoStore) {
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

	function getCrateById(id: string): Crate | undefined {
		return crates.value.find((c: Crate) => c.id === id)
	}

	function getCratesContainingRecord(recordId: string): Crate[] {
		return crates.value.filter((crate: Crate) =>
			crate.records.includes(recordId)
		)
	}

	function removeRecordFromAllCrates(recordId: string) {
		for (const crate of crates.value) {
			invalidateCrate(crate.id)
			const authoritativeCrate = authoritativeCrates.get(crate.id)
			if (authoritativeCrate) {
				authoritativeCrates.set(crate.id, {
					...authoritativeCrate,
					records: authoritativeCrate.records.filter((id) => id !== recordId)
				})
			}
		}
		crates.value = crates.value.map((crate) => ({
			...crate,
			records: crate.records.filter((id) => id !== recordId)
		}))
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

	// Clear crates when user signs out
	function clearCrates() {
		accountGeneration += 1
		fetchPromise = null
		activeFetchUserId = null
		activeCreateOperations = 0
		activeUpdateOperations = 0
		activeDeleteOperations = 0
		authoritativeCrates.clear()
		authoritativeVersions.clear()
		crateRevisions.clear()
		crateLifecycleBoundaries.clear()
		explicitDeletionTombstones.clear()
		optimisticMetadataFields.clear()
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
		removeRecordFromAllCrates,
		clearAllCrateRecords,
		clearCrates
	}
})
