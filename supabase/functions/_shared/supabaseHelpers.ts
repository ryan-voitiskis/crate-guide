import {
	type SupabaseClient,
	type User,
	createClient
} from '@supabase/supabase-js'
import type { Profile } from './types/supabase.ts'

export function requireEnv(name: string): string {
	const value = Deno.env.get(name)?.trim()
	if (!value)
		throw new Error(`Server configuration error: ${name} is required.`)
	return value
}

export function createAuthedSupabaseClient(authHeader: string): SupabaseClient {
	return createClient(
		requireEnv('SUPABASE_URL'),
		requireEnv('SUPABASE_ANON_KEY'),
		{ global: { headers: { Authorization: authHeader } } }
	)
}

export function createServiceRoleSupabaseClient(): SupabaseClient {
	return createClient(
		requireEnv('SUPABASE_URL'),
		requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		}
	)
}

export async function getUser(supabase: SupabaseClient): Promise<User> {
	const { data, error } = await supabase.auth.getUser()
	if (error) throw error
	const user = data.user
	if (!user) throw Error('Crate Guide user not found')
	return user
}

export async function getUserProfile(
	supabase: SupabaseClient,
	user: User
): Promise<Profile> {
	const { data, error } = await supabase
		.from('profiles')
		.select()
		.eq('id', user.id)
	if (error) throw error
	const profile = data[0]
	if (!profile) throw Error('Crate Guide user not found')
	return profile
}
