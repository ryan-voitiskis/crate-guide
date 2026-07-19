import { toast } from 'vue-sonner'
import { getActivePinia } from 'pinia'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import { isDemoWorkbenchPinia } from '~/utils/workbenchPinia'

type FetchContext = {
	generation: number
	userId: string
}

type CrateMetadataUpdate = Partial<
	Omit<Crate, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'records'>
>

type CrateMembershipRpc = 'add_record_to_crate' | 'remove_record_from_crate'

const POSTGRES_TIMESTAMP_PATTERN =
	/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/

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
	let activeMembershipMutations = 0
	const appliedMembershipVersions = new Map<string, bigint>()

	// Dialog state (store-based pattern)
	const crateToDelete = ref<Crate | null>(null)

	const cratesCount = computed(() => crates.value.length)
	const hasCrates = computed(() => crates.value.length > 0)

	function isCurrentFetchContext(context: FetchContext): boolean {
		return (
			context.generation === accountGeneration &&
			activeFetchUserId === context.userId
		)
	}

	async function performFetchAllCrates(generation: number): Promise<boolean> {
		isLoadingCrates.value = true
		let context: FetchContext | null = null
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

			const rows = await fetchAllSupabasePages(async (from, to) => {
				return await supabase
					.from('crates')
					.select('*')
					.eq('user_id', userId)
					.order('created_at', { ascending: false })
					.order('id', { ascending: false })
					.range(from, to)
			})
			if (!isCurrentFetchContext(context)) return false

			crates.value = rows as Crate[]
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
		const userId = user.supaUserId
		if (!userId) {
			toast.error('You must be signed in to create crates.')
			return null
		}

		isCreatingCrate.value = true
		try {
			const { data, error } = await supabase
				.from('crates')
				.insert({
					...crateData,
					user_id: userId
				})
				.select()
				.single()

			if (error) throw error

			// Add to local state
			crates.value.unshift(data as Crate)
			toast.success('Crate created successfully.')
			return data as Crate
		} catch (error) {
			console.error('Failed to create crate:', error)
			toast.error('Error creating crate.')
			return null
		} finally {
			isCreatingCrate.value = false
		}
	}

	async function updateCrate(
		id: string,
		updates: CrateMetadataUpdate
	): Promise<Crate | null> {
		if (isDemoStore) return null
		isUpdatingCrate.value = true

		// Optimistic update
		const crateIndex = crates.value.findIndex((c: Crate) => c.id === id)
		if (crateIndex === -1) {
			toast.error('Crate not found.')
			isUpdatingCrate.value = false
			return null
		}

		const originalCrate = crates.value[crateIndex]
		crates.value[crateIndex] = { ...originalCrate, ...updates } as Crate

		try {
			const { data, error } = await supabase
				.from('crates')
				.update(updates)
				.eq('id', id)
				.select()
				.single()

			if (error) throw error

			// Update with server response
			crates.value[crateIndex] = data as Crate
			return data as Crate
		} catch (error) {
			console.error('Failed to update crate:', error)
			// Revert optimistic update
			crates.value[crateIndex] = originalCrate as Crate
			toast.error('Error updating crate.')
			return null
		} finally {
			isUpdatingCrate.value = false
		}
	}

	function postgresTimestampMicroseconds(value: string | null): bigint | null {
		if (!value) return null
		const match = POSTGRES_TIMESTAMP_PATTERN.exec(value)
		if (!match) return null

		const [, date, time, fraction = '', offset] = match
		const wholeSecondMilliseconds = Date.parse(`${date}T${time}${offset}`)
		if (!Number.isFinite(wholeSecondMilliseconds)) return null

		return (
			BigInt(wholeSecondMilliseconds) * 1000n + BigInt(fraction.padEnd(6, '0'))
		)
	}

	function decodeMembershipCrate(
		data: unknown,
		crateId: string
	): { crate: Crate; serverUpdatedAt: bigint } {
		if (!data || typeof data !== 'object') {
			throw new Error('Invalid crate membership response.')
		}

		const crate = data as Partial<Crate>
		const parsedUpdatedAt = postgresTimestampMicroseconds(
			typeof crate.updated_at === 'string' ? crate.updated_at : null
		)
		if (
			crate.id !== crateId ||
			!Array.isArray(crate.records) ||
			parsedUpdatedAt === null
		) {
			throw new Error('Invalid crate membership response.')
		}

		return { crate: data as Crate, serverUpdatedAt: parsedUpdatedAt }
	}

	function reconcileMembershipCrate(
		crate: Crate,
		serverUpdatedAt: bigint
	): void {
		const appliedVersion = appliedMembershipVersions.get(crate.id)
		if (appliedVersion !== undefined && serverUpdatedAt <= appliedVersion)
			return

		appliedMembershipVersions.set(crate.id, serverUpdatedAt)
		const crateIndex = crates.value.findIndex(({ id }) => id === crate.id)
		if (crateIndex !== -1) crates.value[crateIndex] = crate
	}

	async function mutateCrateMembership(
		rpcName: CrateMembershipRpc,
		crateId: string,
		recordId: string
	): Promise<Crate | null> {
		activeMembershipMutations += 1
		isUpdatingCrate.value = true

		try {
			const { data, error } = await supabase.rpc(rpcName, {
				target_crate_id: crateId,
				target_record_id: recordId
			})
			if (error) throw error

			const { crate: authoritativeCrate, serverUpdatedAt } =
				decodeMembershipCrate(data, crateId)
			reconcileMembershipCrate(authoritativeCrate, serverUpdatedAt)
			return authoritativeCrate
		} catch (error) {
			console.error('Failed to update crate:', error)
			toast.error('Error updating crate.')
			return null
		} finally {
			activeMembershipMutations -= 1
			if (activeMembershipMutations === 0) isUpdatingCrate.value = false
		}
	}

	async function deleteCrate(id: string): Promise<boolean> {
		if (isDemoStore) return false
		isDeletingCrate.value = true

		// Optimistic update
		const crateIndex = crates.value.findIndex((c: Crate) => c.id === id)
		if (crateIndex === -1) {
			toast.error('Crate not found.')
			isDeletingCrate.value = false
			return false
		}

		const removedCrate = crates.value.splice(crateIndex, 1)[0]

		try {
			const { error } = await supabase.from('crates').delete().eq('id', id)

			if (error) throw error

			toast.success('Crate deleted successfully.')
			return true
		} catch (error) {
			console.error('Failed to delete crate:', error)
			// Revert optimistic update
			crates.value.splice(crateIndex, 0, removedCrate as Crate)
			toast.error('Error deleting crate.')
			return false
		} finally {
			isDeletingCrate.value = false
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

		if (crate.records.includes(recordId)) {
			if (!options?.silent) toast.info('Record is already in this crate.')
			return false
		}
		if (isDemoStore) return false

		const result = await mutateCrateMembership(
			'add_record_to_crate',
			crateId,
			recordId
		)

		if (result) {
			if (!options?.silent) toast.success('Record added to crate.')
			return true
		}
		return false
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

		if (!crate.records.includes(recordId)) {
			toast.info('Record is not in this crate.')
			return false
		}
		if (isDemoStore) return false

		const result = await mutateCrateMembership(
			'remove_record_from_crate',
			crateId,
			recordId
		)

		return Boolean(result)
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
		crates.value = crates.value.map((crate) => ({
			...crate,
			records: crate.records.filter((id) => id !== recordId)
		}))
	}

	function clearAllCrateRecords() {
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
		appliedMembershipVersions.clear()
		isLoadingCrates.value = false
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
