import { type SupabaseClient, createClient } from 'jsr:@supabase/supabase-js@2'
import { type User } from 'jsr:@supabase/supabase-js@2'
import { type Profile } from './types/supabase.ts'

let cachedSupabaseClient: SupabaseClient | null = null
let cachedUser: User | null = null
let cachedProfile: Profile | null = null

export function getAuthedSupabaseClient(authHeader: string): SupabaseClient {
	if (cachedSupabaseClient) return cachedSupabaseClient

	const client = createClient(
		Deno.env.get('SUPABASE_URL') ?? '',
		Deno.env.get('SUPABASE_ANON_KEY') ?? '',
		{ global: { headers: { Authorization: authHeader } } }
	)
	cachedSupabaseClient = client
	return client
}

export async function getUser(authHeader: string) {
	if (cachedUser) return cachedUser
	const supabase = getAuthedSupabaseClient(authHeader)
	const { data, error } = await supabase.auth.getUser()
	if (error) throw error
	const user = data.user
	if (!user) throw Error('Crate Guide user not found')
	cachedUser = user
	return user
}

export async function getUserProfile(authHeader: string): Promise<Profile> {
	if (cachedProfile) return cachedProfile
	const supabase = getAuthedSupabaseClient(authHeader)
	const user = await getUser(authHeader)
	const { data, error } = await supabase
		.from('profiles')
		.select()
		.eq('id', user.id)
	if (error) throw error
	const profile = data[0]
	if (!profile) throw Error('Crate Guide user not found')
	cachedProfile = profile
	return profile
}
