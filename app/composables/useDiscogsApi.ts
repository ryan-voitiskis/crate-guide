// Thin client over the authenticated-discogs-request edge function.
//
// The edge function is a per-endpoint dispatcher (H4): callers pick a named
// endpoint and pass structured params. The server resolves the Discogs URL
// (including the user's discogs_username) so the client cannot point the
// proxy at arbitrary paths, and cannot issue writes the UI doesn't expose.

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

	const invokeDispatcher = async <T>(body: DispatchBody): Promise<T> => {
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

	const getFolders = async (): Promise<DiscogsFoldersResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		return invokeDispatcher<DiscogsFoldersResponse>({ endpoint: 'folders' })
	}

	const getFolderReleases = async (
		folderId: number,
		page = 1,
		perPage = 100
	): Promise<DiscogsFolderResponse> => {
		if (!user.profile?.discogs_username) {
			throw new Error('Discogs username required.')
		}
		return invokeDispatcher<DiscogsFolderResponse>({
			endpoint: 'folder_releases',
			folder_id: folderId,
			page,
			per_page: perPage
		})
	}

	const getRelease = async (releaseId: number): Promise<DiscogsReleaseFull> => {
		return invokeDispatcher<DiscogsReleaseFull>({
			endpoint: 'release',
			release_id: releaseId
		})
	}

	return {
		getFolders,
		getFolderReleases,
		getRelease
	}
}
