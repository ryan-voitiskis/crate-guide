#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const LOCAL_FUNCTION_HEALTH_URL =
	'http://127.0.0.1:42821/functions/v1/authenticated-discogs-request'
const EXPECTED_ALLOW_HEADERS =
	'authorization, x-client-info, apikey, content-type'
const EXPECTED_EXPOSE_HEADERS = 'Retry-After, X-Request-ID'

export function isHealthyFunctionResponse(response) {
	if (response?.status !== 200 || typeof response.headers?.get !== 'function') {
		return false
	}
	const origin = response.headers.get('Access-Control-Allow-Origin')
	try {
		// The local Supabase gateway may normalize function preflights to `*`.
		// Edge tests separately enforce the function's configured production origin.
		if (origin !== '*' && (!origin || new URL(origin).origin !== origin)) {
			return false
		}
	} catch {
		return false
	}
	return (
		response.headers.get('Access-Control-Allow-Headers') ===
			EXPECTED_ALLOW_HEADERS &&
		response.headers.get('Access-Control-Expose-Headers') ===
			EXPECTED_EXPOSE_HEADERS
	)
}

export async function waitForFunctionRuntime({
	attempts = 30,
	fetchFn = fetch,
	intervalMs = 250,
	url = LOCAL_FUNCTION_HEALTH_URL
} = {}) {
	let lastStatus = null
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetchFn(url, {
				method: 'OPTIONS',
				signal: AbortSignal.timeout(1500)
			})
			lastStatus = response.status
			if (isHealthyFunctionResponse(response)) return response.status
		} catch {
			lastStatus = null
		}
		if (attempt < attempts) await delay(intervalMs)
	}

	const detail =
		lastStatus === null ? 'no response' : 'last HTTP status ' + lastStatus
	throw new Error('Local Edge Functions runtime is unhealthy (' + detail + ').')
}

export async function monitorFunctionRuntime({
	fetchFn = fetch,
	intervalMs = 2000,
	maxConsecutiveFailures = 3,
	shouldStop = () => false,
	url = LOCAL_FUNCTION_HEALTH_URL
} = {}) {
	let consecutiveFailures = 0
	let lastStatus

	while (!shouldStop()) {
		try {
			const response = await fetchFn(url, {
				method: 'OPTIONS',
				signal: AbortSignal.timeout(1500)
			})
			lastStatus = response.status
			consecutiveFailures = isHealthyFunctionResponse(response)
				? 0
				: consecutiveFailures + 1
		} catch {
			lastStatus = null
			consecutiveFailures += 1
		}

		if (consecutiveFailures >= maxConsecutiveFailures) {
			const detail =
				lastStatus === null ? 'no response' : 'last HTTP status ' + lastStatus
			throw new Error(
				'Local Edge Functions runtime lost health after ' +
					consecutiveFailures +
					' consecutive checks (' +
					detail +
					').'
			)
		}

		if (!shouldStop()) await delay(intervalMs)
	}
}

function runSupabaseStart() {
	const status = spawnSync('supabase', ['status', '-o', 'json'], {
		stdio: 'ignore'
	})
	if (status.status === 0) {
		console.log('✓ Supabase local stack already running')
		return
	}

	console.log('Starting Supabase local stack...')
	const result = spawnSync('supabase', ['start'], {
		env: process.env,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			'Supabase failed to start (status ' +
				(result.status ?? 1) +
				'). Run supabase start directly for diagnostic output.'
		)
	}
	console.log('✓ Supabase local stack started')
}

export function spawnService(name, command, args) {
	const child = spawn(command, args, {
		env: process.env,
		stdio: 'inherit'
	})
	return { child, name }
}

export function waitForServiceSettlement(service) {
	if (service.child.exitCode !== null || service.child.signalCode !== null) {
		return Promise.resolve({
			code: service.child.exitCode,
			event: 'exit',
			name: service.name,
			signal: service.child.signalCode
		})
	}
	return new Promise((resolveSettlement) => {
		let settled = false
		const settle = (result) => {
			if (settled) return
			settled = true
			resolveSettlement({ name: service.name, ...result })
		}
		service.child.once('error', (error) =>
			settle({ code: null, error, event: 'error', signal: null })
		)
		service.child.once('exit', (code, signal) =>
			settle({ code, event: 'exit', signal })
		)
		service.child.once('close', (code, signal) =>
			settle({ code, event: 'close', signal })
		)
	})
}

export function createServiceStopper(services) {
	let stopping = false
	return (signal = 'SIGTERM') => {
		if (stopping) return false
		stopping = true
		for (const { child } of services) {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill(signal)
			}
		}
		return true
	}
}

async function supervise({ withNuxt }) {
	runSupabaseStart()

	const services = [
		spawnService('Edge Functions', 'supabase', [
			'functions',
			'serve',
			'--no-verify-jwt'
		])
	]
	let shuttingDown = false
	const stopServices = createServiceStopper(services)
	const stopChildren = (signal = 'SIGTERM') => {
		if (stopServices(signal)) shuttingDown = true
	}

	process.once('SIGINT', () => stopChildren('SIGINT'))
	process.once('SIGTERM', () => stopChildren('SIGTERM'))

	const functionsExit = waitForServiceSettlement(services[0])
	try {
		await Promise.race([
			waitForFunctionRuntime(),
			functionsExit.then(({ code, error, signal }) => {
				throw new Error(
					'Edge Functions failed before becoming healthy (' +
						(error?.message ?? signal ?? code ?? 'unknown') +
						').'
				)
			})
		])
		console.log('✓ Edge Functions healthy at ' + LOCAL_FUNCTION_HEALTH_URL)

		if (withNuxt) {
			services.push(spawnService('Nuxt', 'npm', ['run', 'dev']))
			console.log('✓ Crate Guide available at http://localhost:3000')
		} else {
			console.log('Press Ctrl+C to stop the supervised function server.')
		}

		const healthMonitorExit = monitorFunctionRuntime({
			shouldStop: () => shuttingDown
		}).then(
			() => ({ code: 0, name: 'Edge Functions health monitor' }),
			(error) => ({ code: 1, error, name: 'Edge Functions health monitor' })
		)
		const exit = await Promise.race([
			...services.map(waitForServiceSettlement),
			healthMonitorExit
		])
		if (!shuttingDown) {
			if (exit.error) console.error(exit.error.message)
			else {
				console.error(
					exit.name +
						' exited unexpectedly (' +
						(exit.signal ?? exit.code ?? 'unknown') +
						').'
				)
			}
			stopChildren()
			process.exitCode = exit.code || 1
		}
	} finally {
		stopChildren()
	}
}

async function main() {
	const args = new Set(process.argv.slice(2))
	const withNuxt = args.delete('--with-nuxt')
	const healthCheckOnly = args.delete('--health-check-only')

	if (args.size > 0 || (withNuxt && healthCheckOnly)) {
		console.error(
			'Usage: node scripts/dev-start.mjs [--with-nuxt | --health-check-only]'
		)
		process.exitCode = 2
		return
	}

	if (healthCheckOnly) {
		const status = await waitForFunctionRuntime({ attempts: 1 })
		console.log('✓ Edge Functions healthy (HTTP ' + status + ')')
		return
	}

	await supervise({ withNuxt })
}

const isMain =
	process.argv[1] &&
	resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (isMain) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exitCode = 1
	})
}
