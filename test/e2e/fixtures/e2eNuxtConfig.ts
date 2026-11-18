// Nuxt overrides shared by the one E2E build and every file that serves it.
export const E2E_NUXT_CONFIG = {
	nitro: { preset: 'node-server' },
	supabase: {
		url: 'https://e2e.invalid',
		key: 'e2e-public-key'
	}
} as const
