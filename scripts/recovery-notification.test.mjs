import assert from 'node:assert/strict'
import test from 'node:test'
import {
	recoveryRunIsFresh,
	updateRecoveryNotification
} from './recovery-notification.mjs'

const runUrl = 'https://github.com/ryan-voitiskis/crate-guide/actions/runs/1'
const existing = {
	number: 1,
	title: '[recovery] Production backup needs attention',
	body: '<!-- crate-guide-recovery-health-v1 -->',
	user: { login: 'github-actions[bot]' },
	html_url: 'https://github.com/ryan-voitiskis/crate-guide/issues/1'
}
const response = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	})

test('watchdog uses a successful main run start rather than a recent finish timestamp', () => {
	const now = new Date('2026-10-24T06:00:00Z')
	const run = {
		conclusion: 'success',
		head_branch: 'main',
		run_started_at: '2026-10-24T04:00:00Z'
	}
	assert.equal(recoveryRunIsFresh([run], now), true)
	for (const runs of [
		[],
		[{ ...run, conclusion: 'failure' }],
		[{ ...run, head_branch: 'feature' }],
		[
			{
				...run,
				run_started_at: '2026-10-22T00:00:00Z',
				updated_at: now.toISOString()
			}
		],
		[{ ...run, run_started_at: '2026-10-25T00:00:00Z' }]
	])
		assert.equal(recoveryRunIsFresh(runs, now), false)
})

test('a failure creates one generic public alert assigned to the owner without publishing private diagnostics', async () => {
	const calls = []
	const result = await updateRecoveryNotification({
		status: 'failure',
		token: 'test-token',
		runUrl,
		fetchFn: async (url, options) => {
			calls.push({ url, options })
			return response(calls.length === 1 ? [] : existing)
		}
	})
	assert.equal(result.action, 'opened')
	assert.equal(calls.length, 2)
	const body = JSON.parse(calls[1].options.body)
	assert.deepEqual(body.assignees, ['ryan-voitiskis'])
	assert.ok(body.body.includes(runUrl))
	assert.ok(!body.body.includes('test-token'))
	assert.equal(calls[1].options.redirect, 'error')
})

test('unchanged failures stay quiet and recovery closes only the bot-owned health issue', async () => {
	for (const status of ['failure', 'stale', 'success']) {
		const calls = []
		const result = await updateRecoveryNotification({
			status,
			token: 'test-token',
			runUrl,
			fetchFn: async (url, options) => {
				calls.push({ url, options })
				return response(calls.length === 1 ? [existing] : existing)
			}
		})
		assert.equal(result.action, status === 'success' ? 'closed' : 'unchanged')
		assert.equal(calls.length, status === 'success' ? 2 : 1)
		if (status === 'success')
			assert.deepEqual(JSON.parse(calls[1].options.body), {
				state: 'closed',
				state_reason: 'completed'
			})
	}
	let calls = 0
	await updateRecoveryNotification({
		status: 'failure',
		token: 'test-token',
		runUrl,
		fetchFn: async () =>
			response(
				++calls === 1
					? [{ ...existing, user: { login: 'someone-else' } }]
					: existing
			)
	})
	assert.equal(calls, 2)
})

test('API failure and an unexpected destination fail without echoing private response contents', async () => {
	await assert.rejects(
		updateRecoveryNotification({
			status: 'failure',
			token: 'test-token',
			runUrl,
			fetchFn: async () => response({ private: 'never echo' }, 403)
		}),
		(error) =>
			error.message.includes('HTTP 403') &&
			!error.message.includes('never echo')
	)
	await assert.rejects(
		updateRecoveryNotification({
			status: 'failure',
			token: 'test-token',
			runUrl: 'https://example.invalid/leak'
		}),
		/Invalid/
	)
})
