// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { buildAnonymousThemeBootstrapScript } from './app/utils/themeBootstrap'

export default defineNuxtConfig({
	alias: {
		test: fileURLToPath(new URL('./test', import.meta.url))
	},
	compatibilityDate: '2026-03-01',
	future: {
		compatibilityVersion: 4
	},
	ssr: false,
	nitro: {
		preset: 'cloudflare-pages'
	},
	devtools: { enabled: false },
	css: ['~/assets/css/main.css'],
	vite: {
		plugins: [tailwindcss()],
		worker: {
			format: 'es'
		}
	},
	modules: [
		'@nuxt/eslint',
		'@nuxtjs/supabase',
		'@pinia/nuxt',
		'@vueuse/nuxt',
		'shadcn-nuxt'
	],
	shadcn: {
		prefix: '',
		componentDir: './app/components/ui'
	},
	imports: {
		dirs: ['shared/types', 'stores', 'utils'],
		presets: [
			{
				from: '@vueuse/integrations/useSortable',
				imports: ['useSortable']
			}
		]
	},
	components: [
		{ path: '~/components', pathPrefix: false },
		{ path: '~/components/icons', prefix: 'Icon' },
		{ path: '~/components/notices', prefix: 'Notice' },
		{ path: '~/components/turntable', prefix: 'Turntable' }
	],
	app: {
		keepalive: true,
		head: {
			htmlAttrs: { lang: 'en' },
			bodyAttrs: { class: 'noise-bg' },
			charset: 'utf-8',
			viewport: 'width=device-width, initial-scale=1',
			meta: [
				{ property: 'og:type', content: 'website' },
				{ property: 'twitter:site', content: '@ryanvoitiskis' },
				{ property: 'twitter:creator', content: '@ryanvoitiskis' }
			],
			link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
			script: [
				{
					key: 'anonymous-theme-bootstrap',
					innerHTML: buildAnonymousThemeBootstrapScript(),
					tagPosition: 'head',
					tagPriority: 'critical'
				}
			]
		}
	},
	supabase: {
		url: process.env.SUPABASE_URL,
		key: process.env.SUPABASE_ANON_KEY,
		redirect: false,
		types: '~~/shared/types/database.ts'
	}
})
