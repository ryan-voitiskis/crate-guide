#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validatePublicRuntimeConfig } from './runtime-config.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultEnvPath = resolve(repositoryRoot, '.env')
const localSupabaseBinary = resolve(
	repositoryRoot,
	'node_modules/.bin/supabase'
)

export function decodeLocalSupabaseStatus(output) {
	let status
	try {
		status = JSON.parse(String(output))
	} catch {
		throw new Error('Could not decode local Supabase status output.')
	}
	const config = validatePublicRuntimeConfig(
		{
			SUPABASE_ANON_KEY: status?.ANON_KEY,
			SUPABASE_URL: status?.API_URL
		},
		{ required: true }
	)
	if (config.url !== 'http://127.0.0.1:42821') {
		throw new Error(
			'Local Supabase status did not use Crate Guide reserved API port 42821.'
		)
	}
	return config
}

export function renderLocalEnv({ key, url }) {
	return [
		'# Generated from the running local Supabase stack.',
		`SUPABASE_URL=${url}`,
		`SUPABASE_ANON_KEY=${key}`,
		'NODE_ENV=development',
		'SITE_URL=http://localhost:3000',
		''
	].join('\n')
}

export async function bootstrapLocalEnv({
	commandRunner = spawnSync,
	envPath = defaultEnvPath,
	force = false,
	supabaseBinary = localSupabaseBinary
} = {}) {
	try {
		await access(supabaseBinary, constants.X_OK)
	} catch {
		throw new Error('Run npm install before bootstrapping local configuration.')
	}
	if (!force) {
		try {
			await access(envPath, constants.F_OK)
			throw new Error(
				'Local .env already exists; rerun with --force only if replacement is intended.'
			)
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error
		}
	}

	const result = commandRunner(supabaseBinary, ['status', '-o', 'json'], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		shell: false
	})
	if (result?.error || result?.status !== 0) {
		throw new Error('Start the local Supabase stack before bootstrapping .env.')
	}
	const config = decodeLocalSupabaseStatus(result.stdout)
	await writeFile(envPath, renderLocalEnv(config), {
		flag: force ? 'w' : 'wx',
		mode: 0o600
	})
	return { envPath }
}

async function main() {
	const args = new Set(process.argv.slice(2))
	const force = args.delete('--force')
	if (args.size) {
		throw new Error('Usage: node scripts/bootstrap-local-env.mjs [--force]')
	}
	const { envPath } = await bootstrapLocalEnv({ force })
	console.log(`Wrote public local configuration to ${envPath}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
}
