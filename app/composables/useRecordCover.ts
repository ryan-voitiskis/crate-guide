const SIGNED_URL_LIFETIME_SECONDS = 300
const SIGNED_URL_REUSE_WINDOW_MS = 240_000
const MAX_SIGNED_URL_CACHE_ENTRIES = 500

type SignedCoverUrlCacheEntry = {
	url: string
	expiresAt: number
	lastUsedAt: number
}

const signedCoverUrlCache = new Map<string, SignedCoverUrlCacheEntry>()
const signedCoverUrlRequests = new Map<string, Promise<string | null>>()

function getSignedCoverUrlCacheKey(userId: string, path: string): string {
	return JSON.stringify([userId, path])
}

function pruneSignedCoverUrlCache(now: number) {
	for (const [key, entry] of signedCoverUrlCache) {
		if (entry.expiresAt <= now) signedCoverUrlCache.delete(key)
	}

	while (signedCoverUrlCache.size > MAX_SIGNED_URL_CACHE_ENTRIES) {
		let leastRecentlyUsedKey: string | null = null
		let leastRecentlyUsedAt = Number.POSITIVE_INFINITY

		for (const [key, entry] of signedCoverUrlCache) {
			if (entry.lastUsedAt < leastRecentlyUsedAt) {
				leastRecentlyUsedKey = key
				leastRecentlyUsedAt = entry.lastUsedAt
			}
		}

		if (!leastRecentlyUsedKey) break
		signedCoverUrlCache.delete(leastRecentlyUsedKey)
	}
}

export function resetRecordCoverUrlCacheForTests() {
	signedCoverUrlCache.clear()
	signedCoverUrlRequests.clear()
}

export function useRecordCover() {
	const supabase = useSupabaseClient<Database>()
	const user = useUserStore()

	async function getCoverUrl(
		record: Pick<DatabaseRecord, 'cover' | 'cover_storage_path'>
	): Promise<string | null> {
		if (!record.cover_storage_path) return record.cover

		let userId: string
		try {
			userId = await user.resolveAuthenticatedUserId()
		} catch {
			return record.cover
		}

		const now = Date.now()
		pruneSignedCoverUrlCache(now)
		const cacheKey = getSignedCoverUrlCacheKey(
			userId,
			record.cover_storage_path
		)
		const cachedEntry = signedCoverUrlCache.get(cacheKey)
		if (cachedEntry) {
			cachedEntry.lastUsedAt = now
			return cachedEntry.url
		}

		let signedUrlRequest = signedCoverUrlRequests.get(cacheKey)
		if (!signedUrlRequest) {
			signedUrlRequest = (async () => {
				const { data, error } = await supabase.storage
					.from(RECORD_COVER_BUCKET)
					.createSignedUrl(
						record.cover_storage_path!,
						SIGNED_URL_LIFETIME_SECONDS
					)

				if (error || !data.signedUrl) return null

				const createdAt = Date.now()
				signedCoverUrlCache.set(cacheKey, {
					url: data.signedUrl,
					expiresAt: createdAt + SIGNED_URL_REUSE_WINDOW_MS,
					lastUsedAt: createdAt
				})
				pruneSignedCoverUrlCache(createdAt)
				return data.signedUrl
			})().finally(() => {
				signedCoverUrlRequests.delete(cacheKey)
			})
			signedCoverUrlRequests.set(cacheKey, signedUrlRequest)
		}

		return (await signedUrlRequest) ?? record.cover
	}

	return { getCoverUrl }
}
