import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			// Unit tests - pure functions, no Nuxt runtime needed
			{
				test: {
					name: 'unit',
					include: ['app/utils/**/*.test.ts', 'shared/**/*.test.ts'],
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
			// Nuxt tests - uncomment when needed for components
			// await defineVitestProject({
			//   test: {
			//     name: 'nuxt',
			//     include: ['test/nuxt/**/*.test.ts'],
			//     environment: 'nuxt',
			//   },
			// }),
		]
	}
})
