export interface SiteUrlConfig {
	siteBaseUrl: string
	siteOrigin: string
}

export function createCorsHeaders(siteUrl: string | undefined) {
	return {
		'Access-Control-Allow-Origin': parseSiteUrl(siteUrl).siteOrigin,
		'Access-Control-Allow-Headers':
			'authorization, x-client-info, apikey, content-type'
	}
}

const configurationError =
	'Server configuration error: SITE_URL must be one absolute HTTP(S) origin.'

export function parseSiteUrl(value: string | undefined): SiteUrlConfig {
	const rawValue = value?.trim()
	if (!rawValue) throw new Error(configurationError)

	let parsedUrl: URL
	try {
		parsedUrl = new URL(rawValue)
	} catch {
		throw new Error(configurationError)
	}

	if (
		(parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
		parsedUrl.username ||
		parsedUrl.password ||
		parsedUrl.pathname !== '/' ||
		parsedUrl.search ||
		parsedUrl.hash
	) {
		throw new Error(configurationError)
	}

	return {
		siteBaseUrl: `${parsedUrl.origin}/`,
		siteOrigin: parsedUrl.origin
	}
}

export function getSiteUrlConfig(): SiteUrlConfig {
	return parseSiteUrl(Deno.env.get('SITE_URL'))
}
