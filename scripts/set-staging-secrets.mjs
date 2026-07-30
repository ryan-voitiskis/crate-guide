#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const STAGING_DEPLOYMENT_RECORD = resolve(
	repositoryRoot,
	'deployment/staging-project.json'
)
const defaultEnvFile = resolve(repositoryRoot, 'supabase/functions/.env')
const localSupabaseBinary = resolve(
	repositoryRoot,
	'node_modules/.bin/supabase'
)

function validateProjectRef(value) {
	return typeof value === 'string' && /^[a-z0-9]{20}$/.test(value)
}

export function buildStagingSecretsCommand({
	authoritativeProjectRef,
	envFile = defaultEnvFile,
	requestedProjectRef = authoritativeProjectRef,
	supabaseBinary = localSupabaseBinary
}) {
	if (!validateProjectRef(authoritativeProjectRef)) {
		throw new Error(
			'Staging secret upload is disabled until deployment/staging-project.json records the authoritative Supabase project ref.'
		)
	}
	if (requestedProjectRef !== authoritativeProjectRef) {
		throw new Error('Requested project ref does not match the staging record.')
	}
	return {
		args: [
			'secrets',
			'set',
			'--project-ref',
			authoritativeProjectRef,
			'--env-file',
			resolve(envFile)
		],
		command: supabaseBinary
	}
}

export async function readStagingProjectRef(
	recordPath = STAGING_DEPLOYMENT_RECORD
) {
	let record
	try {
		record = JSON.parse(await readFile(recordPath, 'utf8'))
	} catch {
		throw new Error(
			'Staging secret upload is disabled until deployment/staging-project.json is supplied by a maintainer.'
		)
	}
	if (!validateProjectRef(record?.supabaseProjectRef)) {
		throw new Error('The staging deployment record has an invalid project ref.')
	}
	return record.supabaseProjectRef
}

export async function prepareStagingSecretsCommand({
	envFile = defaultEnvFile,
	requestedProjectRef,
	recordPath = STAGING_DEPLOYMENT_RECORD,
	supabaseBinary = localSupabaseBinary
} = {}) {
	const authoritativeProjectRef = await readStagingProjectRef(recordPath)
	const command = buildStagingSecretsCommand({
		authoritativeProjectRef,
		envFile,
		requestedProjectRef,
		supabaseBinary
	})
	try {
		await access(command.command, constants.X_OK)
		await access(resolve(envFile), constants.R_OK)
	} catch {
		throw new Error(
			'The locked Supabase CLI and readable function env file are required.'
		)
	}
	return command
}

function parseArguments(args) {
	const options = { dryRun: false }
	for (const argument of args) {
		if (argument === '--dry-run') options.dryRun = true
		else if (argument.startsWith('--project-ref=')) {
			options.requestedProjectRef = argument.slice('--project-ref='.length)
		} else if (argument.startsWith('--env-file=')) {
			options.envFile = argument.slice('--env-file='.length)
		} else {
			throw new Error(
				'Usage: node scripts/set-staging-secrets.mjs [--dry-run] [--project-ref=REF] [--env-file=PATH]'
			)
		}
	}
	return options
}

async function main() {
	const { dryRun, envFile, requestedProjectRef } = parseArguments(
		process.argv.slice(2)
	)
	const command = await prepareStagingSecretsCommand({
		envFile,
		requestedProjectRef
	})
	if (dryRun) {
		console.log(JSON.stringify(command))
		return
	}
	const result = spawnSync(command.command, command.args, {
		cwd: repositoryRoot,
		stdio: 'inherit'
	})
	if (result.error) throw new Error('Could not start the locked Supabase CLI.')
	if (result.status !== 0) {
		throw new Error(
			`Supabase secret upload exited with status ${result.status}.`
		)
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
}
