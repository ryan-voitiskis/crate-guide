import type { DiscogsCredentialRepository } from './credentials.ts'
import { DiscogsQuotaExceededError } from './requestErrors.ts'

export async function quotaBoundFetch(
	credentials: DiscogsCredentialRepository,
	fetcher: typeof fetch,
	input: string | URL | Request,
	init?: RequestInit
): Promise<Response> {
	const quota = await credentials.consumeRequestQuota()
	if (!quota.allowed) {
		throw new DiscogsQuotaExceededError(quota.retryAfterMs)
	}
	return await fetcher(input, init)
}
