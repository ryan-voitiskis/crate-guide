import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
	createServiceStopper,
	isHealthyFunctionResponse,
	monitorFunctionRuntime,
	waitForFunctionRuntime,
	waitForServiceSettlement
} from './dev-start.mjs'

function functionResponse(status = 200, overrides = {}) {
	return {
		status,
		headers: new Headers({
			'Access-Control-Allow-Origin': 'http://localhost:3000',
			'Access-Control-Allow-Headers':
				'authorization, x-client-info, apikey, content-type',
			'Access-Control-Expose-Headers': 'Retry-After, X-Request-ID',
			...overrides
		})
	}
}

test('accepts only the function-specific OPTIONS response', () => {
	assert.equal(isHealthyFunctionResponse(functionResponse()), true)
	assert.equal(isHealthyFunctionResponse(functionResponse(404)), false)
	assert.equal(isHealthyFunctionResponse(functionResponse(405)), false)
	assert.equal(isHealthyFunctionResponse(functionResponse(499)), false)
	assert.equal(
		isHealthyFunctionResponse(
			functionResponse(200, { 'Access-Control-Expose-Headers': 'X-Request-ID' })
		),
		false
	)
	assert.equal(
		isHealthyFunctionResponse(
			functionResponse(200, { 'Access-Control-Allow-Origin': '/relative' })
		),
		false
	)
})

test('retries temporary health failures and returns the healthy status', async () => {
	const statuses = [503, 503, 200]
	const calls = []
	const status = await waitForFunctionRuntime({
		attempts: 3,
		intervalMs: 0,
		fetchFn: async (url, options) => {
			calls.push({ options, url })
			return functionResponse(statuses.shift())
		}
	})

	assert.equal(status, 200)
	assert.equal(calls.length, 3)
	assert.equal(calls[0].options.method, 'OPTIONS')
})

test('fails visibly when the function runtime never becomes healthy', async () => {
	await assert.rejects(
		waitForFunctionRuntime({
			attempts: 2,
			intervalMs: 0,
			fetchFn: async () => functionResponse(503)
		}),
		/last HTTP status 503/
	)
})

test('health monitor only fails after consecutive unhealthy checks', async () => {
	const statuses = [503, 200, 503, 503, 503]

	await assert.rejects(
		monitorFunctionRuntime({
			fetchFn: async () => functionResponse(statuses.shift()),
			intervalMs: 0,
			maxConsecutiveFailures: 3
		}),
		/lost health after 3 consecutive checks \(last HTTP status 503\)/
	)
	assert.equal(statuses.length, 0)
})

test('health monitor exits cleanly when supervision stops', async () => {
	let checks = 0
	await monitorFunctionRuntime({
		fetchFn: async () => {
			checks += 1
			return functionResponse()
		},
		intervalMs: 0,
		shouldStop: () => checks === 2
	})

	assert.equal(checks, 2)
})

function childProcessFixture() {
	const child = new EventEmitter()
	child.exitCode = null
	child.signalCode = null
	child.kills = []
	child.kill = (signal) => {
		child.kills.push(signal)
		return true
	}
	return child
}

test('service settlement resolves once on spawn errors', async () => {
	const child = childProcessFixture()
	const settlement = waitForServiceSettlement({ child, name: 'Nuxt' })
	child.emit('error', new Error('missing executable'))
	child.emit('close', 1, null)

	const result = await settlement
	assert.equal(result.event, 'error')
	assert.equal(result.error.message, 'missing executable')
	assert.equal(result.name, 'Nuxt')
})

test('service settlement normalizes exit and close events', async () => {
	for (const event of ['exit', 'close']) {
		const child = childProcessFixture()
		const settlement = waitForServiceSettlement({ child, name: 'Worker' })
		child.emit(event, 2, null)
		assert.deepEqual(await settlement, {
			code: 2,
			event,
			name: 'Worker',
			signal: null
		})
	}
})

test('service shutdown is idempotent and terminates every live sibling', () => {
	const edge = childProcessFixture()
	const nuxt = childProcessFixture()
	const stop = createServiceStopper([
		{ child: edge, name: 'Edge' },
		{ child: nuxt, name: 'Nuxt' }
	])

	assert.equal(stop('SIGTERM'), true)
	assert.equal(stop('SIGINT'), false)
	assert.deepEqual(edge.kills, ['SIGTERM'])
	assert.deepEqual(nuxt.kills, ['SIGTERM'])
})
