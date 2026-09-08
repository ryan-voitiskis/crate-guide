import { defineVitestProject } from '@nuxt/test-utils/config'
import { playwright } from '@vitest/browser-playwright'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const localAudioCacheTimingSetting =
	process.env.LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS
if (
	localAudioCacheTimingSetting !== undefined &&
	localAudioCacheTimingSetting !== '0' &&
	localAudioCacheTimingSetting !== '1'
) {
	throw new Error(
		'LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS must be exactly 0 or 1'
	)
}
const requireLocalAudioCacheTimingBudgets = localAudioCacheTimingSetting !== '0'

const nuxtProject = await defineVitestProject({
	test: {
		name: 'nuxt',
		include: ['test/nuxt/**/*.nuxt.test.ts'],
		environment: 'nuxt',
		environmentOptions: {
			nuxt: {
				rootDir: fileURLToPath(new URL('.', import.meta.url)),
				domEnvironment: 'happy-dom',
				mock: { indexedDb: true },
				overrides: {
					supabase: {
						url: 'https://supabase.test.invalid',
						key: 'test-anon-key',
						redirect: false
					}
				}
			}
		}
	}
})

const nuxtWebStorageProject = {
	...nuxtProject,
	test: {
		...nuxtProject.test,
		environment: fileURLToPath(
			new URL('./test/environment-nuxt-webstorage.ts', import.meta.url)
		)
	}
}

export default defineConfig({
	test: {
		projects: [
			nuxtWebStorageProject,
			{
				test: {
					name: 'browser',
					include: ['test/browser/**/*.browser.test.ts'],
					testTimeout: 120000,
					browser: {
						enabled: true,
						headless: true,
						// Keep calibrated wall-clock benchmarks isolated from other
						// CPU- and IndexedDB-heavy browser files.
						fileParallelism: false,
						provider: playwright(),
						instances: [{ browser: 'chromium' }]
					}
				},
				optimizeDeps: {
					include: [
						'pinia',
						'vue',
						'essentia.js/dist/essentia.js-core.es.js',
						'essentia.js/dist/essentia-wasm.es.js'
					]
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						test: fileURLToPath(new URL('./test', import.meta.url))
					}
				},
				define: {
					'import.meta.env.LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS':
						JSON.stringify(requireLocalAudioCacheTimingBudgets)
				}
			},
			// Unit tests - pure functions, no Nuxt runtime needed
			{
				test: {
					name: 'unit',
					include: [
						'app/repositories/**/*.test.ts',
						'app/utils/**/*.test.ts',
						'app/workers/**/*.test.ts',
						'shared/**/*.test.ts'
					],
					exclude: ['app/stores/**/*.test.ts', 'app/composables/**/*.test.ts'],
					environment: 'node'
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						test: fileURLToPath(new URL('./test', import.meta.url))
					}
				}
			},
			// Store tests - need Vue/Pinia globals
			{
				test: {
					name: 'stores',
					include: [
						'app/stores/**/*.test.ts',
						'app/composables/**/*.test.ts',
						'app/middleware/**/*.test.ts'
					],
					environment: 'node',
					setupFiles: ['./test/setup-stores.ts']
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						test: fileURLToPath(new URL('./test', import.meta.url))
					}
				}
			},
			{
				test: {
					name: 'server',
					include: ['server/**/*.test.ts'],
					environment: 'node'
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						test: fileURLToPath(new URL('./test', import.meta.url)),
						'#supabase/server': fileURLToPath(
							new URL('./test/mocks/supabase-server.ts', import.meta.url)
						)
					}
				}
			},
			{
				test: {
					name: 'integration',
					include: ['test/integration/**/*.integration.test.ts'],
					environment: 'node',
					fileParallelism: false,
					testTimeout: 120000,
					hookTimeout: 120000
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						'~~': fileURLToPath(new URL('.', import.meta.url))
					}
				}
			},
			{
				test: {
					name: 'e2e',
					include: ['test/e2e/**/*.e2e.test.ts'],
					environment: 'node',
					testTimeout: 120000
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url)),
						test: fileURLToPath(new URL('./test', import.meta.url))
					}
				}
			}
		]
	}
})
