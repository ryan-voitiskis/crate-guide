import { buildNuxt, loadNuxt, logger } from '@nuxt/kit'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import { E2E_NUXT_CONFIG } from './fixtures/e2eNuxtConfig'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const buildDir = fileURLToPath(
	new URL('../../.nuxt/test/e2e-shared', import.meta.url)
)

declare module 'vitest' {
	export interface ProvidedContext {
		e2eBuildDir: string
	}
}

// Every E2E file serves the same production build, so build it once instead
// of once per file. Each file still starts and stops its own server.
export default async function setup(project: TestProject) {
	await rm(buildDir, { recursive: true, force: true })
	// Nuxt's logger wraps the console while loading and building; restore it
	// afterwards, as @nuxt/test-utils does, so Vitest's reporter output stays.
	const nuxt = await loadNuxt({
		cwd: rootDir,
		dev: false,
		overrides: {
			...E2E_NUXT_CONFIG,
			buildDir,
			nitro: {
				...E2E_NUXT_CONFIG.nitro,
				output: { dir: `${buildDir}/output` }
			}
		}
	}).finally(() => logger.restoreAll())
	try {
		await buildNuxt(nuxt)
	} finally {
		logger.restoreAll()
		await nuxt.close()
	}
	project.provide('e2eBuildDir', buildDir)

	return async () => {
		await rm(buildDir, { recursive: true, force: true })
	}
}
