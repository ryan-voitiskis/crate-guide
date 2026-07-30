#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUPABASE_JS_SPECIFIER = 'npm:@supabase/supabase-js@2.111.0'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function listFunctionConfigs(root = repositoryRoot) {
	const functionsRoot = resolve(root, 'supabase/functions')
	const entries = await readdir(functionsRoot, { withFileTypes: true })
	return entries
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
		.map((entry) => ({
			config: resolve(functionsRoot, entry.name, 'deno.json'),
			entrypoint: resolve(functionsRoot, entry.name, 'index.ts'),
			name: entry.name
		}))
		.sort((left, right) => left.name.localeCompare(right.name))
}

export async function checkEdgeImportLock({
	commandRunner = spawnSync,
	resolveImports = true,
	root = repositoryRoot
} = {}) {
	const lock = await readFile(resolve(root, 'supabase/deno.lock'), 'utf8')
	if (!lock.includes(`"${SUPABASE_JS_SPECIFIER}"`)) {
		throw new Error(
			'The root Deno lockfile does not pin the Edge Supabase SDK.'
		)
	}

	const configs = await listFunctionConfigs(root)
	for (const item of configs) {
		const config = JSON.parse(await readFile(item.config, 'utf8'))
		if (config?.imports?.['@supabase/supabase-js'] !== SUPABASE_JS_SPECIFIER) {
			throw new Error(`${item.name} does not use the pinned Supabase SDK.`)
		}
		if (!resolveImports) continue
		const result = commandRunner(
			'deno',
			[
				'cache',
				'--frozen',
				'--lock=deno.lock',
				`--config=functions/${item.name}/deno.json`,
				`functions/${item.name}/index.ts`
			],
			{
				cwd: resolve(root, 'supabase'),
				encoding: 'utf8',
				shell: false,
				stdio: 'pipe'
			}
		)
		if (result?.error || result?.status !== 0) {
			throw new Error(
				`Frozen Edge dependency resolution failed for ${item.name}.`
			)
		}
	}
	return configs.map(({ name }) => name)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	checkEdgeImportLock()
		.then((names) =>
			console.log(`Frozen Edge imports passed for ${names.length} functions.`)
		)
		.catch((error) => {
			console.error(error instanceof Error ? error.message : error)
			process.exitCode = 1
		})
}
