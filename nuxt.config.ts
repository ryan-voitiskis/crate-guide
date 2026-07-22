// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { buildThemeBootstrapScript } from './app/utils/themeBootstrap'
import { applyDeferredClientAssetPrefetchPolicy } from './scripts/check-client-bundle-budget.mjs'
import { validatePublicRuntimeConfig } from './scripts/runtime-config.mjs'
import clientBundleBudget from './shared/config/clientBundleBudget.json'

const publicRuntimeConfig = validatePublicRuntimeConfig()

export default defineNuxtConfig({
	runtimeConfig: {
		browserSecurity: {
			supabaseOrigin: publicRuntimeConfig.url
				? new URL(publicRuntimeConfig.url).origin
				: ''
		}
	},
	alias: {
		test: fileURLToPath(new URL('./test', import.meta.url))
	},
	compatibilityDate: '2026-03-01',
	hooks: {
		'build:manifest'(manifest) {
			applyDeferredClientAssetPrefetchPolicy(manifest, clientBundleBudget)
		}
	},
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
		build: {
			rollupOptions: {
				output: {
					manualChunks(id) {
						const moduleId = id.split('?', 1)[0]
						if (
							[
								'/app/types/trackEnrichmentDraft.ts',
								'/app/utils/trackEnrichmentDraftCodec.ts',
								'/app/utils/trackEnrichmentDraftPrivacy.ts'
							].some((suffix) => moduleId.endsWith(suffix))
						) {
							return 'track-enrichment-draft-format'
						}
					}
				}
			}
		},
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
					key: 'theme-bootstrap',
					innerHTML: buildThemeBootstrapScript(),
					tagPosition: 'head',
					tagPriority: 'critical'
				}
			]
		}
	},
	supabase: {
		url: publicRuntimeConfig.url,
		key: publicRuntimeConfig.key,
		redirect: false,
		types: '~~/shared/types/database.ts'
	}
})
