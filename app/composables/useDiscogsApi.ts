const DISCOGS_API_URL = 'https://api.discogs.com/'

export function useDiscogsApi() {
	const supabase = getSupabase()
	const user = useUserStore()

	const makeRequest = async <T>(
		method: string,
		url: string,
		params?: Record<string, any>
	): Promise<T> => {
		const { data, error } = await supabase.functions.invoke(
			'authenticated-discogs-request',
			{ body: JSON.stringify({ httpMethod: method, url, ...params }) }
		)

		if (error) {
			// Normalize all supabase error types to standard Error
			const message = error.message || error.toString() || 'API request failed'
			throw new Error(message)
		}
		return data
	}

	const getFolders = async (): Promise<DiscogsFoldersResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required')
		}

		const url = `${DISCOGS_API_URL}users/${user.profile.discogs_username}/collection/folders`
		return makeRequest<DiscogsFoldersResponse>('GET', url)
	}

	const getFolderReleases = async (
		folderId: number,
		page = 1,
		perPage = 100
	): Promise<DiscogsFolderResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required')
		}

		const url = `${DISCOGS_API_URL}users/${user.profile.discogs_username}/collection/folders/${folderId}/releases`
		return makeRequest('GET', url, { page, per_page: perPage })
	}

	const getRelease = async (releaseId: number): Promise<DiscogsReleaseFull> => {
		const url = `${DISCOGS_API_URL}releases/${releaseId}`
		return makeRequest<DiscogsReleaseFull>('GET', url)
	}

	return {
		makeRequest,
		getFolders,
		getFolderReleases,
		getRelease
	}
}
