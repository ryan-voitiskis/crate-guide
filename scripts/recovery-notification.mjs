#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = 'ryan-voitiskis/crate-guide'
const marker = '<!-- crate-guide-recovery-health-v1 -->'
const title = '[recovery] Production backup needs attention'

export function recoveryRunIsFresh(runs, now = new Date()) {
	const run = runs.find(
		(run) => run.conclusion === 'success' && run.head_branch === 'main'
	)
	const started = Date.parse(run?.run_started_at)
	return (
		Number.isFinite(started) &&
		started <= now.getTime() + 300_000 &&
		now.getTime() - started <= 36 * 3_600_000
	)
}

export async function updateRecoveryNotification({
	status,
	token,
	runUrl,
	fetchFn = fetch
}) {
	if (
		!['success', 'failure', 'stale'].includes(status) ||
		!token ||
		!new RegExp(
			'^https://github\\.com/ryan-voitiskis/crate-guide/actions/runs/[0-9]+$'
		).test(runUrl)
	)
		throw new Error('Invalid recovery notification request.')
	const api = async (path, method = 'GET', body) => {
		const response = await fetchFn(
			`https://api.github.com/repos/${repository}/${path}`,
			{
				method,
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					...(body ? { 'Content-Type': 'application/json' } : {})
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				redirect: 'error',
				signal: AbortSignal.timeout(30_000)
			}
		)
		if (!response.ok)
			throw new Error(
				`Recovery notification API failed: HTTP ${response.status}.`
			)
		return response.json()
	}
	let existing
	for (let page = 1; page <= 10; page++) {
		const issues = await api(
			`issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`
		)
		if (!Array.isArray(issues))
			throw new Error('Invalid recovery notification inventory.')
		existing = issues.find(
			(issue) =>
				!issue.pull_request &&
				issue.user?.login === 'github-actions[bot]' &&
				issue.title === title &&
				issue.body?.includes(marker)
		)
		if (existing || issues.length < 100) break
		if (page === 10)
			throw new Error(
				'Recovery notification inventory exceeded its safe limit.'
			)
	}
	if (status === 'success') {
		if (existing) {
			await api(`issues/${existing.number}`, 'PATCH', {
				state: 'closed',
				state_reason: 'completed'
			})
			return { action: 'closed', issue: existing.html_url }
		}
		return { action: 'unchanged' }
	}
	if (existing) return { action: 'unchanged', issue: existing.html_url }
	const reason =
		status === 'stale'
			? 'No successful main-branch recovery run has started within the last 36 hours.'
			: 'The production recovery workflow failed or was cancelled.'
	const issue = await api('issues', 'POST', {
		title,
		body: `${marker}\nAutomated recovery requires attention. ${reason}\n\n[Open the workflow run](${runUrl}). Review its failed step and the last verified backup before retrying.\n\nThis alert contains no production data or credentials.`,
		assignees: ['ryan-voitiskis']
	})
	return { action: 'opened', issue: issue.html_url }
}

async function main() {
	if (
		process.env.GITHUB_REPOSITORY !== repository ||
		process.env.GITHUB_REF !== 'refs/heads/main'
	)
		throw new Error(
			'Recovery notifications run only on reviewed main in the expected repository.'
		)
	const operation =
		process.argv[2] === 'cancelled' ? 'failure' : process.argv[2]
	if (!['success', 'failure', 'watchdog'].includes(operation))
		throw new Error('Choose success, failure or watchdog.')
	const token = process.env.GITHUB_TOKEN
	const runUrl = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
	let status = operation
	if (operation === 'watchdog') {
		const response = await fetch(
			`https://api.github.com/repos/${repository}/actions/workflows/recovery.yml/runs?branch=main&status=success&per_page=1`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28'
				},
				redirect: 'error',
				signal: AbortSignal.timeout(30_000)
			}
		)
		if (!response.ok)
			throw new Error(`Recovery watchdog API failed: HTTP ${response.status}.`)
		const report = await response.json()
		if (!Array.isArray(report.workflow_runs))
			throw new Error('Invalid recovery workflow inventory.')
		// A fresh older backup must not clear an alert from a newer failed capture.
		// Only the capture workflow's successful completion closes that alert.
		if (recoveryRunIsFresh(report.workflow_runs)) {
			console.log(JSON.stringify({ action: 'fresh' }))
			return
		}
		status = 'stale'
	}
	console.log(
		JSON.stringify(await updateRecoveryNotification({ status, token, runUrl }))
	)
	if (status === 'stale') process.exitCode = 1
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
	main().catch((error) => {
		console.error(
			error instanceof SyntaxError
				? 'Recovery notification metadata could not be parsed.'
				: error.message
		)
		process.exitCode = 1
	})
