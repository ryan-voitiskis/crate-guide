import {
	type SupabaseClient,
	type User,
	createClient
} from '@supabase/supabase-js'
import type { Profile } from './types/supabase.ts'

/**
 * Creates an authenticated Supabase client for a single request.
 * A fresh client is created per invocation to prevent data leakage
 * between serverless invocations.
 */
export function createAuthedSupabaseClient(authHeader: string): SupabaseClient {
	return createClient(
		Deno.env.get('SUPABASE_URL') ?? '',
		Deno.env.get('SUPABASE_ANON_KEY') ?? '',
		{ global: { headers: { Authorization: authHeader } } }
	)
}

/**
 * Gets the authenticated user from the provided Supabase client.
 */
export async function getUser(supabase: SupabaseClient): Promise<User> {
	const { data, error } = await supabase.auth.getUser()
	if (error) throw error
	const user = data.user
	if (!user) throw Error('Crate Guide user not found')
	return user
}

/**
 * Gets the user profile for the authenticated user.
 */
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
