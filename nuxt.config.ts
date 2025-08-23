// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
	compatibilityDate: '2024-04-03',
	ssr: false,
	devtools: { enabled: false },
	css: ['~/assets/css/main.css'],
	vite: {
		plugins: [tailwindcss()]
	},
	modules: ['@nuxt/eslint', '@nuxtjs/supabase', '@pinia/nuxt', 'shadcn-nuxt'],
	shadcn: {
		prefix: '',
		componentDir: './components/ui'
	},
	imports: {
		dirs: ['types', 'stores']
	},
	components: [
		{ path: '~/components', pathPrefix: false },
		{ path: '~/components/icons', prefix: 'Icon' },
		{ path: '~/components/notices', prefix: 'Notice' }
	],
	app: {
		keepalive: true,
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
		key: process.env.SUPABASE_ANON_KEY,
		redirect: false,
		types: 'types/database.ts'
	}
})
