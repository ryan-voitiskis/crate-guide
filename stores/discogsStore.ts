import { toast } from 'vue-sonner'
import { defineStore } from 'pinia'
import type { DiscogsFolder, DiscogsRelease } from '~/types/discogs'

const API_URL = 'https://api.discogs.com/'

export const useDiscogsStore = defineStore('discogs', () => {
	const user = useUserStore()
	const supabase = useSupabaseClient<Database>()
	const folders = ref<DiscogsFolder[]>([])
	const releasesToFilter = ref<DiscogsRelease[]>([])
	const releasesToImport = ref<DiscogsRelease[]>([])
	const isLoadingFolders = ref(false)
	const isLoadingSelectedFolder = ref(false)
	const selectedFolder = ref<string | undefined>(undefined)
	const showFilterDialog = ref(false)

	async function getFolders() {
		isLoadingFolders.value = true
		try {
			const url = `${API_URL}users/${user.profile?.discogs_username}/collection/folders`
			const { data, error } = await supabase.functions.invoke(
				'authenticated-discogs-request',
				{ body: JSON.stringify({ httpMethod: 'GET', url }) }
			)
			if (error) throw error
			if (!data.folders) toast.error('No folders found.')
			else folders.value = data.folders
		} catch (error) {
			toast.error('Error fetching folders.')
		} finally {
			isLoadingFolders.value = false
		}
	}

	async function getSelectedFolder() {
		if (!selectedFolder.value) return
		const folder = folders.value.find((f) => f.name === selectedFolder.value)
		if (!folder) return
		isLoadingSelectedFolder.value = true
		try {
			const url = `${API_URL}users/${user.profile?.discogs_username}/collection/folders/${folder.id}/releases`
			const releases: DiscogsRelease[] = []
			let allReleasesFetched = false
			let page = 1
			while (!allReleasesFetched) {
				const { data, error } = await supabase.functions.invoke(
					'authenticated-discogs-request',
					{
						body: JSON.stringify({
							httpMethod: 'GET',
							url,
							page,
							per_page: 100
						})
					}
				)
				if (error) throw error
				if (!data.releases) throw new Error('No releases found.')
				if (!data.pagination) throw new Error('No pagination on response.')
				releases.push(...data.releases)
				allReleasesFetched = page >= data.pagination.pages
				page++
			}
			releasesToFilter.value = releases
			showFilterDialog.value = true
		} catch (e) {
			toast.error(isError(e) ? e.message : 'Error fetching folder.')
		} finally {
			isLoadingSelectedFolder.value = false
		}
	}

	return {
		folders,
		releasesToFilter,
		isLoadingFolders,
		isLoadingSelectedFolder,
		selectedFolder,
		showFilterDialog,
		getFolders,
		getSelectedFolder
	}
})
