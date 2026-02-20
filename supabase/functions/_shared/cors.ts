export const corsHeaders = {
	'Access-Control-Allow-Origin':
		Deno.env.get('SITE_URL') || 'https://crate.guide',
	'Access-Control-Allow-Headers':
		'authorization, x-client-info, apikey, content-type'
}
