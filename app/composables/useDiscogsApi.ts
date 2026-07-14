import {
	type DiscogsFolderResponse,
	type DiscogsFoldersResponse,
	type DiscogsReleaseFull,
	isDiscogsFolderResponse,
	isDiscogsFoldersResponse,
	isDiscogsReleaseFull
} from '../../shared/types/discogs'

type DispatchBody =
	| { endpoint: 'folders' }
	| {
			endpoint: 'folder_releases'
			folder_id: number
			page: number
			per_page: number
	  }
	| { endpoint: 'release'; release_id: number }

export function useDiscogsApi() {
	const supabase = getSupabase()
	const user = useUserStore()

	const invokeDispatcher = async (body: DispatchBody): Promise<unknown> => {
		const { data, error } = await supabase.functions.invoke(
			'authenticated-discogs-request',
			{ body: JSON.stringify(body) }
		)
		if (error) {
			const message = error.message || error.toString() || 'API request failed'
			throw new Error(message)
		}
		return data
	}

	const decodeResponse = <T>(
		data: unknown,
		isExpectedResponse: (value: unknown) => value is T,
		endpoint: string
	): T => {
		if (!isExpectedResponse(data)) {
			throw new Error(`Discogs returned an invalid ${endpoint} response.`)
		}
		return data
	}

	const getFolders = async (): Promise<DiscogsFoldersResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		return decodeResponse(
			await invokeDispatcher({ endpoint: 'folders' }),
			isDiscogsFoldersResponse,
			'folders'
		)
	}

	const getFolderReleases = async (
		folderId: number,
		page = 1,
		perPage = 100
	): Promise<DiscogsFolderResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		return decodeResponse(
			await invokeDispatcher({
				endpoint: 'folder_releases',
				folder_id: folderId,
				page,
				per_page: perPage
			}),
			isDiscogsFolderResponse,
			'folder releases'
		)
	}

	const getRelease = async (releaseId: number): Promise<DiscogsReleaseFull> => {
		return decodeResponse(
			await invokeDispatcher({
				endpoint: 'release',
				release_id: releaseId
			}),
			isDiscogsReleaseFull,
			'release'
		)
	}

	return {
		getFolders,
		getFolderReleases,
		getRelease
	}
}
