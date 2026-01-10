import { toast } from 'vue-sonner'

export const useCratesStore = defineStore('crates', () => {
	const supabase = useSupabaseClient<Database>()
	const user = useUserStore()

	const crates = ref<Crate[]>([])
	const isLoadingCrates = ref(false)
	const isCreatingCrate = ref(false)
	const isUpdatingCrate = ref(false)
	const isDeletingCrate = ref(false)

	const cratesCount = computed(() => crates.value.length)
	const hasCrates = computed(() => crates.value.length > 0)

	async function fetchAllCrates() {
		if (!user.supaUser?.id) return

		isLoadingCrates.value = true
		try {
			const { data, error } = await supabase
				.from('crates')
				.select('*')
				.eq('user_id', user.supaUser.id)
				.order('created_at', { ascending: false })

			if (error) throw error
			crates.value = (data as Crate[]) || []
		} catch (error) {
			toast.error('Error fetching crates.')
		} finally {
			isLoadingCrates.value = false
		}
	}

	async function createCrate(
		crateData: Omit<Crate, 'id' | 'user_id' | 'created_at' | 'updated_at'>
	): Promise<Crate | null> {
		if (!user.supaUser?.id) {
			toast.error('You must be signed in to create crates.')
			return null
		}

		isCreatingCrate.value = true
		try {
			const { data, error } = await supabase
				.from('crates')
				.insert({
					...crateData,
					user_id: user.supaUser.id
				})
				.select()
				.single()

			if (error) throw error

			// Add to local state
			crates.value.unshift(data as Crate)
			toast.success('Crate created successfully.')
			return data as Crate
		} catch (error) {
			toast.error('Error creating crate.')
			return null
		} finally {
			isCreatingCrate.value = false
		}
	}

	async function updateCrate(
		id: string,
		updates: Partial<
			Omit<Crate, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>
	): Promise<Crate | null> {
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
			// Revert optimistic update
			crates.value[crateIndex] = originalCrate as Crate
			toast.error('Error updating crate.')
			return null
		} finally {
			isUpdatingCrate.value = false
		}
	}

	async function deleteCrate(id: string): Promise<boolean> {
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

		const updatedRecords = [...crate.records, recordId]
		const result = await updateCrate(crateId, { records: updatedRecords })

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

		const updatedRecords = crate.records.filter((id) => id !== recordId)
		const result = await updateCrate(crateId, { records: updatedRecords })

		return Boolean(result)
	}

	function getCrateById(id: string): Crate | undefined {
		return crates.value.find((c: Crate) => c.id === id)
	}

	function getCratesByIds(ids: string[]): Crate[] {
		return crates.value.filter((c: Crate) => ids.includes(c.id))
	}

	function getCrateRecords(crateId: string): string[] {
		const crate = getCrateById(crateId)
		return crate?.records || []
	}

	function getCratesContainingRecord(recordId: string): Crate[] {
		return crates.value.filter((crate: Crate) =>
			crate.records.includes(recordId)
		)
	}

	function searchCrates(query: string): Crate[] {
		if (!query.trim()) return crates.value

		const lowercaseQuery = query.toLowerCase()
		return crates.value.filter((crate: Crate) =>
			crate.name.toLowerCase().includes(lowercaseQuery)
		)
	}

	function getCrateStats(crateId: string): {
		recordCount: number
		isEmpty: boolean
	} {
		const crate = getCrateById(crateId)
		const recordCount = crate?.records.length || 0
		return {
			recordCount,
			isEmpty: recordCount === 0
		}
	}

	function duplicateCrate(
		crateId: string,
		newName?: string
	): Promise<Crate | null> | null {
		const originalCrate = getCrateById(crateId)
		if (!originalCrate) {
			toast.error('Crate not found.')
			return null
		}

		const crateName = newName || `${originalCrate.name} (Copy)`
		return createCrate({
			name: crateName,
			description: originalCrate.description,
			color: originalCrate.color,
			records: [...originalCrate.records]
		})
	}

	// Clear crates when user signs out
	function clearCrates() {
		crates.value = []
	}

	return {
		crates,
		isLoadingCrates,
		isCreatingCrate,
		isUpdatingCrate,
		isDeletingCrate,
		cratesCount,
		hasCrates,
		fetchAllCrates,
		createCrate,
		updateCrate,
		deleteCrate,
		addRecordToCrate,
		removeRecordFromCrate,
		getCrateById,
		getCratesByIds,
		getCrateRecords,
		getCratesContainingRecord,
		searchCrates,
		getCrateStats,
		duplicateCrate,
		clearCrates
	}
})
