import { requireEnv } from '../supabaseHelpers.ts'

export interface DiscogsConfig {
	consumerKey: string
	consumerSecret: string
	userAgent: string
}

export function getDiscogsConfig(): DiscogsConfig {
	return {
		consumerKey: requireEnv('DISCOGS_CONSUMER_KEY'),
		consumerSecret: requireEnv('DISCOGS_CONSUMER_SECRET'),
		userAgent: requireEnv('DISCOGS_USER_AGENT')
	}
}
