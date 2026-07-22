import { RECORD_COVER_BUCKET } from '~/utils/recordCover'
import type { CoverResolver } from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

const SIGNED_URL_LIFETIME_SECONDS = 300
const SIGNED_URL_REUSE_WINDOW_MS = 240_000
const MAX_SIGNED_URL_CACHE_ENTRIES = 500

type CacheEntry = { url: string; reusableUntil: number }

export function createCloudCoverResolver(
	state: CloudRepositoryState
): CoverResolver {
	const cache = new Map<string, CacheEntry>()
	const requests = new Map<string, Promise<string | null>>()

	function prune(now: number): void {
		for (const [key, entry] of cache) {
			if (entry.reusableUntil <= now) cache.delete(key)
		}
		while (cache.size > MAX_SIGNED_URL_CACHE_ENTRIES) {
			const oldestKey = cache.keys().next().value
			if (typeof oldestKey !== 'string') break
			cache.delete(oldestKey)
		}
	}

	return {
		async resolve(context, reference) {
			if (reference.kind === 'none') return null
			if (reference.kind === 'external') return reference.url
			if (reference.kind === 'browser') return reference.fallbackUrl

			const captured = await state.capture(context)
			if (!state.isLease(captured)) return null
			const key = `${captured.userId}:${reference.assetId}`
			const now = Date.now()
			prune(now)
			const cached = cache.get(key)
			if (cached && cached.reusableUntil > now) return cached.url
			const pending = requests.get(key)
			if (pending) return pending

			const created = (async () => {
				const { data, error } = await state.dependencies.supabase.storage
					.from(RECORD_COVER_BUCKET)
					.createSignedUrl(reference.assetId, SIGNED_URL_LIFETIME_SECONDS)
				if (!(await state.isCurrent(captured)) || error || !data?.signedUrl) {
					return reference.fallbackUrl
				}
				cache.set(key, {
					url: data.signedUrl,
					reusableUntil: Date.now() + SIGNED_URL_REUSE_WINDOW_MS
				})
				prune(Date.now())
				return data.signedUrl
			})().finally(() => {
				if (requests.get(key) === created) requests.delete(key)
			})
			requests.set(key, created)
			return created
		},
		reset() {
			cache.clear()
			requests.clear()
		}
	}
}
