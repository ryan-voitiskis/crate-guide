import { toast } from 'vue-sonner'
import { validateImportResult } from '~/utils/discogs-validation'
import {
	RECORD_COVER_BUCKET,
	type RecordCoverCrop,
	processRecordCoverFile
} from '~/utils/recordCover'
import { decodeRecordRow, reportDecodeIssues } from '~/utils/supabaseRows'

type ManualRecordTrackInput = {
	title: string
	artistName?: string | null
	position?: string | null
	duration?: number | null
	bpm?: number | null
	rpm?: number | null
	key?: number | null
	mode?: number | null
	genres?: string[]
	playable?: boolean
}

type ManualRecordWithTracksInput = {
	title: string
	artistName?: string | null
	labelName?: string | null
	catno?: string | null
	year?: number | null
	cover?: string | null
	defaultGenres?: string[]
	defaultRpm?: number | null
	tracks: ManualRecordTrackInput[]
}

function buildArtistPayload(name?: string | null): DiscogsArtistDb[] {
	const trimmedName = name?.trim()
	return trimmedName ? [{ name: trimmedName, role: null }] : []
}

function buildLabelPayload(
	name?: string | null,
	catno?: string | null
): DiscogsLabelDb[] {
	const trimmedName = name?.trim()
	if (!trimmedName) return []

	const trimmedCatno = catno?.trim()
	return [
		{
			name: trimmedName,
			catno: trimmedCatno || undefined
		}
	]
}

export const useRecordsStore = defineStore('records', () => {
	const supabase = useSupabaseClient<Database>()
	const user = useUserStore()
	const tracksStore = useTracksStore()

	const records = ref<DatabaseRecord[]>([])
	const isLoadingRecords = ref(false)
	const isCreatingRecord = ref(false)
	const isUpdatingRecord = ref(false)
	const isUpdatingCover = ref(false)
	const isDeletingRecord = ref(false)
	let fetchPromise: Promise<boolean> | null = null

	// Search state
	const searchQuery = ref('')
	const searchResults = ref<DatabaseRecord[]>([])
	const isSearching = ref(false)

	const recordsCount = computed(() => records.value.length)
	const hasRecords = computed(() => records.value.length > 0)

	// Search computed properties
	const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
	const hasSearchResults = computed(() => searchResults.value.length > 0)
	const resultsCount = computed(() => searchResults.value.length)

	// Display the right data based on search state
	const displayedRecords = computed(() =>
		hasSearchQuery.value ? searchResults.value : records.value
	)

	async function resolveMutationUserId(): Promise<string | null> {
		try {
			return await user.resolveAuthenticatedUserId()
		} catch (error) {
			console.error('Auth failed in recordsStore mutation:', error)
			toast.error('You must be signed in to update your collection.')
			return null
		}
	}

	async function performFetchAllRecords(): Promise<boolean> {
		isLoadingRecords.value = true
		try {
			const userId = await user
				.resolveAuthenticatedUserId()
				.catch((e: unknown) => {
					console.error('Auth failed in recordsStore:', e)
					toast.error('Failed to load data')
					return null as string | null
				})
			if (!userId) return false

			const { data, error } = await supabase
				.from('records')
				.select('*')
				.eq('user_id', userId)
				.order('created_at', { ascending: false })

			if (error) throw error
			const decodedRows = (data ?? []).map(decodeRecordRow)
			const issues = decodedRows.flatMap((decoded) => decoded.issues)
			reportDecodeIssues(issues, (message) => toast.warning(message))
			records.value = decodedRows.map((decoded) => decoded.row)
			return true
		} catch (error) {
			console.error('Failed to fetch records:', error)
			toast.error('Error fetching records.')
			return false
		} finally {
			isLoadingRecords.value = false
			fetchPromise = null
		}
	}

	function fetchAllRecords(): Promise<boolean> {
		if (fetchPromise) return fetchPromise

		fetchPromise = performFetchAllRecords()
		return fetchPromise
	}

	async function createRecord(
		recordData: Omit<DatabaseRecord, 'id' | 'created_at' | 'updated_at'>
	): Promise<DatabaseRecord | null> {
		isCreatingRecord.value = true
		try {
			const userId = await resolveMutationUserId()
			if (!userId) return null

			const { data, error } = await supabase
				.from('records')
				.insert({
					...recordData,
					user_id: userId
				})
				.select()
				.single()

			if (error) throw error

			const decoded = decodeRecordRow(data)
			reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
			records.value.unshift(decoded.row)
			toast.success('Record created successfully.')
			return decoded.row
		} catch (error) {
			console.error('Failed to create record:', error)
			toast.error('Error creating record.')
			return null
		} finally {
			isCreatingRecord.value = false
		}
	}

	async function createRecordWithTracks(
		recordInput: ManualRecordWithTracksInput
	): Promise<DatabaseRecord | null> {
		isCreatingRecord.value = true

		try {
			const userId = await resolveMutationUserId()
			if (!userId) return null

			const recordArtists = buildArtistPayload(recordInput.artistName)
			const defaultGenres = recordInput.defaultGenres ?? []

			const recordPayload = {
				user_id: userId,
				discogs_id: null,
				discogs_release_url: null,
				title: recordInput.title.trim(),
				artists: recordArtists,
				labels: buildLabelPayload(recordInput.labelName, recordInput.catno),
				year: recordInput.year ?? null,
				cover: recordInput.cover?.trim() || null
			}

			const trackPayloads = recordInput.tracks.map((track) => {
				const trackArtists = buildArtistPayload(track.artistName)

				return {
					title: track.title.trim(),
					artists: trackArtists.length ? trackArtists : recordArtists,
					extraartists: [],
					position: track.position?.trim() || null,
					duration: track.duration ?? null,
					bpm: track.bpm ?? null,
					rpm: track.rpm ?? recordInput.defaultRpm ?? null,
					key: track.key ?? null,
					mode: track.mode ?? null,
					genres: track.genres?.length ? track.genres : defaultGenres,
					time_signature_upper: null,
					time_signature_lower: null,
					playable: track.playable ?? true
				}
			})

			const { data, error } = await supabase.rpc('import_record_with_tracks', {
				record: recordPayload,
				tracks: trackPayloads
			})

			if (error) throw error

			const result = validateImportResult(data)

			await Promise.all([fetchAllRecords(), tracksStore.fetchAllTracks()])

			const createdRecord = result.record_id
				? getRecordById(result.record_id)
				: records.value[0]

			const tracksInserted = result.tracks_inserted ?? trackPayloads.length
			toast.success(
				tracksInserted > 0
					? `Record and ${tracksInserted} ${tracksInserted === 1 ? 'track' : 'tracks'} created successfully.`
					: 'Record created successfully.'
			)

			return createdRecord ?? null
		} catch (error) {
			console.error('Failed to create record with tracks:', error)
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

			const decoded = decodeRecordRow(data)
			reportDecodeIssues(decoded.issues, (message) => toast.warning(message))
			records.value[recordIndex] = decoded.row
			toast.success('Record updated successfully.')
			return decoded.row
		} catch (error) {
			console.error('Failed to update record:', error)
			// Revert optimistic update (index was validated above, originalRecord is defined)
			records.value[recordIndex] = originalRecord!
			toast.error('Error updating record.')
			return null
		} finally {
			isUpdatingRecord.value = false
		}
	}

	async function removeCoverObjects(
		paths: Array<string | null | undefined>,
		notifyOnFailure = true
	): Promise<boolean> {
		const uniquePaths = [
			...new Set(paths.filter((path): path is string => !!path))
		]
		if (!uniquePaths.length) return true

		for (let index = 0; index < uniquePaths.length; index += 100) {
			const batch = uniquePaths.slice(index, index + 100)
			const { error } = await supabase.storage
				.from(RECORD_COVER_BUCKET)
				.remove(batch)

			if (!error) continue
			console.error('Failed to remove record cover objects:', error)
			if (notifyOnFailure) {
				toast.warning('Some old cover files still need cleanup.')
			}
			return false
		}

		return true
	}

	async function updateRecordWithCover(
		id: string,
		updates: Partial<
			Omit<DatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
		>,
		coverChange:
			| { type: 'keep' }
			| { type: 'remove' }
			| { type: 'upload'; file: File; crop: RecordCoverCrop }
	): Promise<DatabaseRecord | null> {
		const currentRecord = getRecordById(id)
		if (!currentRecord) {
			toast.error('Record not found.')
			return null
		}

		if (coverChange.type === 'keep') return updateRecord(id, updates)

		isUpdatingCover.value = true
		let newPath: string | null = null

		try {
			if (coverChange.type === 'upload') {
				const userId = await resolveMutationUserId()
				if (!userId) return null

				const blob = await processRecordCoverFile(
					coverChange.file,
					coverChange.crop
				)
				newPath = `${userId}/${id}/${crypto.randomUUID()}.webp`
				const { error } = await supabase.storage
					.from(RECORD_COVER_BUCKET)
					.upload(newPath, blob, {
						cacheControl: '300',
						contentType: 'image/webp',
						upsert: false
					})
				if (error) throw error
			}

			const updatedRecord = await updateRecord(id, {
				...updates,
				cover_storage_path: newPath
			})

			if (!updatedRecord) {
				if (newPath) await removeCoverObjects([newPath], false)
				return null
			}

			if (
				currentRecord.cover_storage_path &&
				currentRecord.cover_storage_path !== newPath
			) {
				await removeCoverObjects([currentRecord.cover_storage_path])
			}

			return updatedRecord
		} catch (error) {
			if (newPath) await removeCoverObjects([newPath], false)
			console.error('Failed to update record cover:', error)
			toast.error(
				error instanceof Error ? error.message : 'Cover upload failed.'
			)
			return null
		} finally {
			isUpdatingCover.value = false
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
			await removeCoverObjects([removedRecord?.cover_storage_path])
			toast.success('Record deleted successfully.')
			return true
		} catch (error) {
			console.error('Failed to delete record:', error)
			// Revert optimistic update (removedRecord is already DatabaseRecord)
			records.value.splice(recordIndex, 0, removedRecord!)
			toast.error('Error deleting record.')
			return false
		} finally {
			isDeletingRecord.value = false
		}
	}

	async function removeRecordFromCollection(id: string): Promise<boolean> {
		isDeletingRecord.value = true
		const record = getRecordById(id)

		try {
			const { error } = await supabase.rpc('remove_record_from_collection', {
				target_record_id: id
			})

			if (error) throw error

			records.value = records.value.filter((record) => record.id !== id)
			searchResults.value = searchResults.value.filter(
				(record) => record.id !== id
			)
			await removeCoverObjects([record?.cover_storage_path])

			toast.success('Record removed from collection')
			return true
		} catch (error) {
			console.error('Failed to remove record from collection:', error)
			toast.error('Failed to remove record')
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

	async function performSearch(query: string) {
		searchQuery.value = query

		if (!query.trim()) {
			searchResults.value = []
			return
		}

		isSearching.value = true
		try {
			searchResults.value = records.value.filter(
				(record: DatabaseRecord) =>
					record.title.toLowerCase().includes(query.toLowerCase()) ||
					record.artists.some((artist: DiscogsArtistDb) =>
						artist.name.toLowerCase().includes(query.toLowerCase())
					) ||
					record.labels.some((label: DiscogsLabelDb) =>
						label.name.toLowerCase().includes(query.toLowerCase())
					) ||
					(record.year && record.year.toString().includes(query))
			)
		} catch (error) {
			console.error('Failed to search records:', error)
			toast.error('Error searching your collection')
			searchResults.value = []
		} finally {
			isSearching.value = false
		}
	}

	function clearSearch() {
		searchQuery.value = ''
		searchResults.value = []
	}

	function clearRecords() {
		records.value = []
		searchResults.value = []
		searchQuery.value = ''
	}

	return {
		records,
		isLoadingRecords,
		isCreatingRecord,
		isUpdatingRecord,
		isUpdatingCover,
		isDeletingRecord,
		recordsCount,
		hasRecords,
		searchQuery: readonly(searchQuery),
		searchResults: readonly(searchResults),
		isSearching: readonly(isSearching),
		hasSearchQuery,
		hasSearchResults,
		resultsCount,
		displayedRecords,
		fetchAllRecords,
		createRecord,
		createRecordWithTracks,
		updateRecord,
		updateRecordWithCover,
		removeCoverObjects,
		deleteRecord,
		removeRecordFromCollection,
		getRecordById,
		getRecordsByIds,
		performSearch,
		clearSearch,
		clearRecords
	}
})
