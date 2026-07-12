const siteUrl = Deno.env.get('SITE_URL')?.trim()
if (!siteUrl) {
	throw new Error(
		'Server configuration error: SITE_URL is required for CORS headers.'
	)
}

export const corsHeaders = {
	'Access-Control-Allow-Origin': siteUrl,
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type'
}
