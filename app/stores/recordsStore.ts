import { toast } from 'vue-sonner'

export const useRecordsStore = defineStore('records', () => {
	const supabase = useSupabaseClient<Database>()
	const user = useUserStore()

	const records = ref<DatabaseRecord[]>([])
	const isLoadingRecords = ref(false)
	const isCreatingRecord = ref(false)
	const isUpdatingRecord = ref(false)
	const isDeletingRecord = ref(false)

	const recordsCount = computed(() => records.value.length)
	const hasRecords = computed(() => records.value.length > 0)

	async function fetchAllRecords() {
		if (!user.supaUser?.id) return

		isLoadingRecords.value = true
		try {
			const { data, error } = await supabase
				.from('records')
				.select('*')
				.eq('user_id', user.supaUser.id)
				.order('created_at', { ascending: false })

			if (error) throw error
			records.value = (data as DatabaseRecord[]) || []
		} catch (error) {
			toast.error('Error fetching records.')
		} finally {
			isLoadingRecords.value = false
		}
	}

	async function createRecord(
		recordData: Omit<DatabaseRecord, 'id' | 'created_at' | 'updated_at'>
	): Promise<DatabaseRecord | null> {
		if (!user.supaUser?.id) {
			toast.error('You must be signed in to create records.')
			return null
		}

		isCreatingRecord.value = true
		try {
			const { data, error } = await supabase
				.from('records')
				.insert({
					...recordData,
					user_id: user.supaUser.id
				})
				.select()
				.single()

			if (error) throw error

			// Add to local state
			records.value.unshift(data as DatabaseRecord)
			toast.success('Record created successfully.')
			return data as DatabaseRecord
		} catch (error) {
			toast.error('Error creating record.')
			return null
		} finally {
			isCreatingRecord.value = false
		}
	}

	async function updateRecord(
		id: string,
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>
	): Promise<DatabaseRecord | null> {
		isUpdatingRecord.value = true

		// Optimistic update
		const recordIndex = records.value.findIndex(
			(r: DatabaseRecord) => r.id === id
		)
		if (recordIndex === -1) {
			toast.error('Record not found.')
			isUpdatingRecord.value = false
			return null
		}

		const originalRecord = records.value[recordIndex]
		records.value[recordIndex] = {
			...originalRecord,
			...updates
		} as DatabaseRecord

		try {
			const { data, error } = await supabase
				.from('records')
				.update(updates)
				.eq('id', id)
				.select()
				.single()

			if (error) throw error

			// Update with server response
			records.value[recordIndex] = data as DatabaseRecord
			toast.success('Record updated successfully.')
			return data as DatabaseRecord
		} catch (error) {
			// Revert optimistic update
			records.value[recordIndex] = originalRecord as DatabaseRecord
			toast.error('Error updating record.')
			return null
		} finally {
			isUpdatingRecord.value = false
		}
	}

	async function deleteRecord(id: string): Promise<boolean> {
		isDeletingRecord.value = true

		// Optimistic update
		const recordIndex = records.value.findIndex(
			(r: DatabaseRecord) => r.id === id
		)
		if (recordIndex === -1) {
			toast.error('Record not found.')
			isDeletingRecord.value = false
			return false
		}

		const removedRecord = records.value.splice(recordIndex, 1)[0]

		try {
			const { error } = await supabase.from('records').delete().eq('id', id)

			if (error) throw error

			toast.success('Record deleted successfully.')
			return true
		} catch (error) {
			// Revert optimistic update
			records.value.splice(recordIndex, 0, removedRecord as DatabaseRecord)
			toast.error('Error deleting record.')
			return false
		} finally {
			isDeletingRecord.value = false
		}
	}

	function getRecordById(id: string): DatabaseRecord | undefined {
		return records.value.find((r: DatabaseRecord) => r.id === id)
	}

	function getRecordsByIds(ids: string[]): DatabaseRecord[] {
		return records.value.filter((r: DatabaseRecord) => ids.includes(r.id))
	}

	function searchRecords(query: string): DatabaseRecord[] {
		if (!query.trim()) return records.value

		const lowercaseQuery = query.toLowerCase()
		return records.value.filter((record: DatabaseRecord) => {
			// Search in title
			if (record.title.toLowerCase().includes(lowercaseQuery)) return true

			// Search in artists
			const artistMatch = record.artists.some((artist: any) =>
				artist.name.toLowerCase().includes(lowercaseQuery)
			)
			if (artistMatch) return true

			// Search in labels
			const labelMatch = record.labels.some((label: any) =>
				label.name.toLowerCase().includes(lowercaseQuery)
			)
			if (labelMatch) return true

			// Search in year
			if (record.year && record.year.toString().includes(query)) return true

			return false
		})
	}

	// Clear records when user signs out
	function clearRecords() {
		records.value = []
	}

	return {
		records,
		isLoadingRecords,
		isCreatingRecord,
		isUpdatingRecord,
		isDeletingRecord,
		recordsCount,
		hasRecords,
		fetchAllRecords,
		createRecord,
		updateRecord,
		deleteRecord,
		getRecordById,
		getRecordsByIds,
		searchRecords,
		clearRecords
	}
})
