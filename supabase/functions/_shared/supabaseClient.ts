import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

export function getAuthedSupabaseClient(authHeader: string) {
	return createClient(
		Deno.env.get('SUPABASE_URL') ?? '',
		Deno.env.get('SUPABASE_ANON_KEY') ?? '',
		{ global: { headers: { Authorization: authHeader } } }
	)
}
