const configurationError =
	'Cloud library mode requires valid public SUPABASE_URL and SUPABASE_ANON_KEY values.'

function parseSupabaseUrl(value) {
	if (typeof value !== 'string' || !value.trim()) return undefined
	let url
	try {
		url = new URL(value.trim())
	} catch {
		throw new Error(configurationError)
	}
	if (
		(url.protocol !== 'http:' && url.protocol !== 'https:') ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	) {
		throw new Error(configurationError)
	}
	return url.toString().replace(/\/$/, '')
}

function parsePublicKey(value) {
	if (typeof value !== 'string' || !value.trim()) return undefined
	const key = value.trim()
	if (key.length < 16 || /\s/.test(key)) throw new Error(configurationError)
	return key
}

export function requiresCloudRuntimeConfig(environment = process.env) {
	if (environment.CRATE_GUIDE_STORAGE_MODE === 'local') return false
	return ['build', 'dev', 'generate', 'preview'].includes(
		environment.npm_lifecycle_event
	)
}

export function validatePublicRuntimeConfig(
	environment = process.env,
	{ required = requiresCloudRuntimeConfig(environment) } = {}
) {
	const url = parseSupabaseUrl(environment.SUPABASE_URL)
	const key = parsePublicKey(environment.SUPABASE_ANON_KEY)
	if (required && (!url || !key)) throw new Error(configurationError)
	return { key, url }
}
