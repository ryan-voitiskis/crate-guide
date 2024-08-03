// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	compatibilityDate: '2024-04-03',
	devtools: { enabled: false },
	modules: [
		'@nuxt/eslint',
		'@nuxtjs/supabase',
		'@nuxtjs/tailwindcss',
		'@pinia/nuxt',
		'shadcn-nuxt'
	],
	imports: {
		dirs: ['types', 'stores']
	},
	app: {
		head: {
			htmlAttrs: { lang: 'en' },
			charset: 'utf-8',
			viewport: 'width=device-width, initial-scale=1',
			meta: [
				{ property: 'og:type', content: 'website' },
				{ property: 'twitter:site', content: '@ryanvoitiskis' },
				{ property: 'twitter:creator', content: '@ryanvoitiskis' }
			],
			link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]
		}
	},
	supabase: {
		url: process.env.SUPABASE_URL,
		key: process.env.SUPABASE_KEY,
		redirect: false,
		types: 'types/database.ts'
	}
})
