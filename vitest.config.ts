import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
	test: {
		projects: [
			// Unit tests - pure functions, no Nuxt runtime needed
			{
				test: {
					name: 'unit',
					include: ['app/**/*.test.ts', 'shared/**/*.test.ts'],
					environment: 'node'
				},
				resolve: {
					alias: {
						'~': fileURLToPath(new URL('./app', import.meta.url)),
						'@': fileURLToPath(new URL('./app', import.meta.url))
					}
				}
			}
			// Nuxt tests - uncomment when needed for stores/components
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
