import type { SupabaseClient, User } from '@supabase/supabase-js'
import {
	createAuthedSupabaseClient,
	createServiceRoleSupabaseClient,
	getUser
} from '../supabaseHelpers.ts'
import {
	type DiscogsRateLimitConfig,
	DiscogsRateLimitError,
	decodeDiscogsQuotaResponse,
	getDiscogsRateLimitConfig
} from './rateLimit.ts'

export interface DiscogsCredentialsRow {
	request_token: string | null
	request_secret: string | null
	access_token: string | null
	access_secret: string | null
}

export interface DiscogsCredentialRepository {
	callerClient: SupabaseClient
	user: User
	getCredentials(): Promise<DiscogsCredentialsRow | null>
	setRequestCredentials(token: string, secret: string): Promise<void>
	setAccessCredentials(token: string, secret: string): Promise<void>
	consumeRequestQuota(): Promise<{
		allowed: boolean
		retryAfterMs: number
	}>
}

interface CredentialRepositoryDependencies {
	createCallerClient(authHeader: string): SupabaseClient
	createServiceClient(): SupabaseClient
	getAuthenticatedUser(client: SupabaseClient): Promise<User>
	getRateLimitConfig(): DiscogsRateLimitConfig
}

const defaultDependencies: CredentialRepositoryDependencies = {
	createCallerClient: createAuthedSupabaseClient,
	createServiceClient: createServiceRoleSupabaseClient,
	getAuthenticatedUser: getUser,
	getRateLimitConfig: getDiscogsRateLimitConfig
}

export async function createDiscogsCredentialRepository(
	authHeader: string,
	dependencies: CredentialRepositoryDependencies = defaultDependencies
): Promise<DiscogsCredentialRepository> {
	const callerClient = dependencies.createCallerClient(authHeader)
	const user = await dependencies.getAuthenticatedUser(callerClient)
	const serviceClient = dependencies.createServiceClient()

	const getCredentials = async (): Promise<DiscogsCredentialsRow | null> => {
		const { data, error } = await serviceClient
			.from('discogs_credentials')
			.select('request_token, request_secret, access_token, access_secret')
			.eq('user_id', user.id)
			.maybeSingle()
		if (error) throw error
		return data as DiscogsCredentialsRow | null
	}

	const upsertCredentials = async (
		values: Partial<DiscogsCredentialsRow>
	): Promise<void> => {
		const { error } = await serviceClient.from('discogs_credentials').upsert(
			{
				user_id: user.id,
				...values,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		)
		if (error) throw error
	}

	const consumeRequestQuota = async () => {
		const config = dependencies.getRateLimitConfig()
		let result: { data: unknown; error: unknown }
		try {
			result = await serviceClient.rpc('consume_discogs_request_quota', {
				target_user_id: user.id,
				per_user_limit: config.perUserLimit,
				global_limit: config.globalLimit,
				window_seconds: config.windowSeconds
			})
		} catch {
			throw new DiscogsRateLimitError()
		}
		if (result.error) throw new DiscogsRateLimitError()
		return decodeDiscogsQuotaResponse(result.data)
	}

	return {
		callerClient,
		user,
		getCredentials,
		setRequestCredentials: (token, secret) =>
			upsertCredentials({ request_token: token, request_secret: secret }),
		setAccessCredentials: (token, secret) =>
			upsertCredentials({ access_token: token, access_secret: secret }),
		consumeRequestQuota
	}
}
