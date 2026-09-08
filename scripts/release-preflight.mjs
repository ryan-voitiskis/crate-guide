#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
	parseReleaseArguments,
	releaseOrganization,
	releaseRepository,
	releaseTarget
} from './lib/release-targets.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

export function assertReleaseProjects(projects, target) {
	const project = Array.isArray(projects)
		? projects.find((entry) => entry.id === target.projectRef)
		: undefined
	if (
		!project ||
		project.organization_id !== releaseOrganization ||
		project.name !== target.projectName
	) {
		throw new Error(
			`Supabase CLI cannot verify ${target.projectName} (${target.projectRef}) in the Crate Guide organization. Authenticate the correct CLI identity before backend release.`
		)
	}
	if (project.status !== 'ACTIVE_HEALTHY')
		throw new Error('The selected Supabase project is not healthy.')
}

export function assertReleaseChecks(runs, commit) {
	const latest = Array.isArray(runs) ? runs[0] : undefined
	if (
		!latest ||
		latest.headSha !== commit ||
		latest.event !== 'push' ||
		latest.headBranch !== 'main' ||
		latest.status !== 'completed' ||
		latest.conclusion !== 'success'
	) {
		throw new Error(
			'The latest push-to-main Verify workflow for this exact source must have completed successfully.'
		)
	}
	return latest.url
}

function command(binary, args) {
	const result = spawnSync(binary, args, {
		cwd: root,
		encoding: 'utf8',
		timeout: 30_000,
		shell: false
	})
	if (result.error || result.status !== 0) {
		// CLI output can contain credentials or unrelated organization details.
		throw new Error(
			`${binary === 'gh' ? 'GitHub' : binary === 'git' ? 'Git' : 'Supabase'} preflight command failed; verify its authentication and connectivity.`
		)
	}
	return result.stdout.trim()
}

export function releasePreflight({ environment, commit }) {
	const target = releaseTarget(environment)
	if (!/^[a-f0-9]{40}$/.test(commit))
		throw new Error('Commit must be a full 40-character SHA.')
	if (command('git', ['rev-parse', 'HEAD']) !== commit)
		throw new Error(
			'Checkout HEAD does not match the requested release source.'
		)
	if (command('git', ['status', '--porcelain']))
		throw new Error(
			'Release checkout must be clean, including untracked files.'
		)
	const origin = command('git', ['remote', 'get-url', 'origin'])
	if (
		![
			`git@github.com:${releaseRepository}.git`,
			`https://github.com/${releaseRepository}.git`,
			`https://github.com/${releaseRepository}`
		].includes(origin)
	) {
		throw new Error('Checkout origin is not the Crate Guide repository.')
	}
	const workflow = assertReleaseChecks(
		JSON.parse(
			command('gh', [
				'run',
				'list',
				'--repo',
				releaseRepository,
				'--commit',
				commit,
				'--workflow',
				'verify.yml',
				'--event',
				'push',
				'--branch',
				'main',
				'--limit',
				'1',
				'--json',
				'headSha,event,headBranch,status,conclusion,url'
			])
		),
		commit
	)
	assertReleaseProjects(
		JSON.parse(
			command(resolve(root, 'node_modules/.bin/supabase'), [
				'projects',
				'list',
				'--output',
				'json'
			])
		),
		target
	)
	const migrations = readdirSync(resolve(root, 'supabase/migrations'))
		.filter((name) => name.endsWith('.sql'))
		.sort()
		.map((name) => ({
			name,
			sha256: createHash('sha256')
				.update(readFileSync(resolve(root, 'supabase/migrations', name)))
				.digest('hex')
		}))
	return {
		checkedAt: new Date().toISOString(),
		environment,
		source: commit,
		workflow,
		...target,
		organization: releaseOrganization,
		migrations,
		remainingReleaseChecks: [
			'Compare hosted migration ledger and review the exact pending SQL.',
			'Verify database and cover backup restore evidence.',
			'Verify built artifact configuration and record its build ID.',
			'Apply reviewed migrations and only changed Edge Functions to staging first.',
			'Record deployment identity, smoke results, and fixture cleanup.'
		]
	}
}

if (
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
	try {
		console.log(
			JSON.stringify(
				releasePreflight(
					parseReleaseArguments(process.argv.slice(2), [
						'environment',
						'commit'
					])
				),
				null,
				2
			)
		)
	} catch (error) {
		console.error(error.message)
		process.exitCode = 1
	}
}
