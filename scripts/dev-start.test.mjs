import assert from 'node:assert/strict'
import test from 'node:test'
import {
	isHealthyFunctionStatus,
	monitorFunctionRuntime,
	waitForFunctionRuntime
} from './dev-start.mjs'

test('accepts reachable function responses and rejects gateway failures', () => {
	assert.equal(isHealthyFunctionStatus(200), true)
	assert.equal(isHealthyFunctionStatus(401), true)
	assert.equal(isHealthyFunctionStatus(499), true)
	assert.equal(isHealthyFunctionStatus(500), false)
	assert.equal(isHealthyFunctionStatus(503), false)
})

test('retries temporary health failures and returns the healthy status', async () => {
	const statuses = [503, 503, 200]
	const calls = []
	const status = await waitForFunctionRuntime({
		attempts: 3,
		intervalMs: 0,
		fetchFn: async (url, options) => {
			calls.push({ options, url })
			return { status: statuses.shift() }
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
			fetchFn: async () => ({ status: 503 })
		}),
		/last HTTP status 503/
	)
})

test('health monitor only fails after consecutive unhealthy checks', async () => {
	const statuses = [503, 200, 503, 503, 503]

	await assert.rejects(
		monitorFunctionRuntime({
			fetchFn: async () => ({ status: statuses.shift() }),
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
			return { status: 200 }
		},
		intervalMs: 0,
		shouldStop: () => checks === 2
	})

	assert.equal(checks, 2)
})
