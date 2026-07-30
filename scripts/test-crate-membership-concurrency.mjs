import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const databaseUrl =
	process.env.SUPABASE_DB_URL ??
	'postgresql://postgres:postgres@127.0.0.1:42822/postgres'
const psqlBin = resolvePsqlBin()
const sessionTimeoutMs = 10_000
const blockingObservationMs = 300

function resolvePsqlBin() {
	if (process.env.PSQL_BIN) return process.env.PSQL_BIN

	const homebrewPsql = '/opt/homebrew/opt/libpq/bin/psql'
	return existsSync(homebrewPsql) ? homebrewPsql : 'psql'
}

function psqlArgs() {
	return [
		'--no-psqlrc',
		'--no-align',
		'--tuples-only',
		'--quiet',
		'--set',
		'ON_ERROR_STOP=1',
		databaseUrl
	]
}

function runAdminSql(sql) {
	const result = spawnSync(psqlBin, psqlArgs(), {
		encoding: 'utf8',
		input: sql
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(`Local database command failed:\n${result.stderr.trim()}`)
	}
	return result.stdout.trim()
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

class PsqlSession {
	constructor(label) {
		this.label = label
		this.stdout = ''
		this.stderr = ''
		this.exit = null
		this.outputWaiters = []
		this.exitWaiters = []
		this.child = spawn(psqlBin, psqlArgs(), {
			stdio: ['pipe', 'pipe', 'pipe']
		})
		this.child.stdout.setEncoding('utf8')
		this.child.stderr.setEncoding('utf8')
		this.child.stdout.on('data', (chunk) => {
			this.stdout += chunk
			this.resolveOutputWaiters()
		})
		this.child.stderr.on('data', (chunk) => {
			this.stderr += chunk
		})
		this.child.on('error', (error) => {
			this.stderr += `${error.message}\n`
		})
		this.child.on('exit', (code, signal) => {
			this.exit = { code, signal }
			this.rejectOutputWaiters()
			for (const waiter of this.exitWaiters.splice(0)) {
				clearTimeout(waiter.timeout)
				waiter.resolve(this.exit)
			}
		})
	}

	send(sql, { end = false } = {}) {
		if (this.exit) throw new Error(`${this.label} already exited`)
		if (end) this.child.stdin.end(`${sql}\n`)
		else this.child.stdin.write(`${sql}\n`)
	}

	resolveOutputWaiters() {
		for (const waiter of [...this.outputWaiters]) {
			if (!this.stdout.includes(waiter.marker)) continue
			clearTimeout(waiter.timeout)
			this.outputWaiters.splice(this.outputWaiters.indexOf(waiter), 1)
			waiter.resolve()
		}
	}

	rejectOutputWaiters() {
		for (const waiter of this.outputWaiters.splice(0)) {
			clearTimeout(waiter.timeout)
			waiter.reject(
				new Error(
					`${this.label} exited before ${waiter.marker}:\n${this.stderr.trim()}`
				)
			)
		}
	}

	waitForOutput(marker, timeoutMs = sessionTimeoutMs) {
		if (this.stdout.includes(marker)) return Promise.resolve()
		if (this.exit) {
			return Promise.reject(
				new Error(
					`${this.label} exited before ${marker}:\n${this.stderr.trim()}`
				)
			)
		}

		return new Promise((resolve, reject) => {
			const waiter = { marker, resolve, reject, timeout: null }
			waiter.timeout = setTimeout(() => {
				this.outputWaiters.splice(this.outputWaiters.indexOf(waiter), 1)
				reject(new Error(`${this.label} timed out waiting for ${marker}`))
			}, timeoutMs)
			this.outputWaiters.push(waiter)
		})
	}

	waitForExit(timeoutMs = sessionTimeoutMs) {
		if (this.exit) return Promise.resolve(this.exit)
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject, timeout: null }
			waiter.timeout = setTimeout(() => {
				this.exitWaiters.splice(this.exitWaiters.indexOf(waiter), 1)
				reject(new Error(`${this.label} did not exit`))
			}, timeoutMs)
			this.exitWaiters.push(waiter)
		})
	}

	async terminate() {
		if (this.exit) return
		this.child.kill('SIGTERM')
		await this.waitForExit(2_000).catch(() => undefined)
	}
}

function fixtureSql(userId, recordId, crateId) {
	return `
		DELETE FROM auth.users WHERE id = '${userId}';
		INSERT INTO auth.users (id) VALUES ('${userId}');
		INSERT INTO public.records (id, user_id, title, artists, labels)
		VALUES ('${recordId}', '${userId}', 'Concurrency fixture', '[]', '[]');
		INSERT INTO public.crates (id, user_id, name, records)
		VALUES ('${crateId}', '${userId}', 'Concurrency crate', '{}');
	`
}

function authenticatedTransactionSql(userId) {
	return `
		BEGIN;
		SET LOCAL statement_timeout = '${sessionTimeoutMs}ms';
		SET LOCAL ROLE authenticated;
		SELECT set_config('request.jwt.claim.sub', '${userId}', true);
	`
}

function assertBlocked(session, forbiddenMarker, message) {
	assert.equal(session.exit, null, `${message}: session exited early`)
	assert.equal(
		session.stdout.includes(forbiddenMarker),
		false,
		`${message}: operation crossed the uncommitted record boundary`
	)
}

function assertFinalIntegrity(recordId) {
	const result = runAdminSql(`
		SELECT
			(SELECT count(*) FROM public.records WHERE id = '${recordId}')
			|| '|'
			|| (SELECT count(*) FROM public.crates WHERE '${recordId}' = ANY (records));
	`)
	assert.equal(result, '0|0', 'record deletion left a row or crate reference')
}

async function runAddFirstScenario(activeSessions) {
	const userId = '00000000-0000-0000-0000-000000004701'
	const recordId = '00000000-0000-0000-0000-000000004702'
	const crateId = '00000000-0000-0000-0000-000000004703'
	runAdminSql(fixtureSql(userId, recordId, crateId))

	const addSession = new PsqlSession('add-first add session')
	const deleteSession = new PsqlSession('add-first delete session')
	activeSessions.push(addSession, deleteSession)

	addSession.send(`
		${authenticatedTransactionSql(userId)}
		SELECT id
		FROM public.records
		WHERE id = '${recordId}' AND user_id = '${userId}'
		FOR UPDATE;
		SELECT 'ADD_FIRST_RECORD_LOCKED';
	`)
	await addSession.waitForOutput('ADD_FIRST_RECORD_LOCKED')

	deleteSession.send(
		`
			${authenticatedTransactionSql(userId)}
			SELECT 'ADD_FIRST_DELETE_STARTED';
			SELECT public.remove_record_from_collection('${recordId}');
			SELECT 'ADD_FIRST_DELETE_FINISHED';
			COMMIT;
		`,
		{ end: true }
	)
	await deleteSession.waitForOutput('ADD_FIRST_DELETE_STARTED')
	await delay(blockingObservationMs)
	assertBlocked(
		deleteSession,
		'ADD_FIRST_DELETE_FINISHED',
		'deletion did not wait for the add-side record lock'
	)

	addSession.send(
		`
			SELECT public.add_record_to_crate('${crateId}', '${recordId}') IS NOT NULL;
			SELECT 'ADD_FIRST_ADD_FINISHED';
			COMMIT;
			SELECT 'ADD_FIRST_ADD_COMMITTED';
			\\q
		`,
		{ end: true }
	)
	await addSession.waitForOutput('ADD_FIRST_ADD_COMMITTED')
	const addExit = await addSession.waitForExit()
	assert.equal(addExit.code, 0, addSession.stderr.trim())

	await deleteSession.waitForOutput('ADD_FIRST_DELETE_FINISHED')
	const deleteExit = await deleteSession.waitForExit()
	assert.equal(deleteExit.code, 0, deleteSession.stderr.trim())
	assertFinalIntegrity(recordId)
	runAdminSql(`DELETE FROM auth.users WHERE id = '${userId}';`)
}

async function runDeleteFirstScenario(activeSessions) {
	const userId = '00000000-0000-0000-0000-000000004711'
	const recordId = '00000000-0000-0000-0000-000000004712'
	const crateId = '00000000-0000-0000-0000-000000004713'
	runAdminSql(fixtureSql(userId, recordId, crateId))

	const deleteSession = new PsqlSession('delete-first delete session')
	const addSession = new PsqlSession('delete-first add session')
	activeSessions.push(deleteSession, addSession)

	deleteSession.send(`
		${authenticatedTransactionSql(userId)}
		SELECT public.remove_record_from_collection('${recordId}');
		SELECT 'DELETE_FIRST_DELETE_PENDING';
	`)
	await deleteSession.waitForOutput('DELETE_FIRST_DELETE_PENDING')

	addSession.send(
		`
			${authenticatedTransactionSql(userId)}
			SELECT 'DELETE_FIRST_ADD_STARTED';
			SELECT public.add_record_to_crate('${crateId}', '${recordId}');
			SELECT 'DELETE_FIRST_ADD_FINISHED';
			COMMIT;
		`,
		{ end: true }
	)
	await addSession.waitForOutput('DELETE_FIRST_ADD_STARTED')
	await delay(blockingObservationMs)
	assertBlocked(
		addSession,
		'DELETE_FIRST_ADD_FINISHED',
		'add did not wait for the uncommitted record deletion'
	)

	deleteSession.send(
		`
			COMMIT;
			SELECT 'DELETE_FIRST_DELETE_COMMITTED';
			\\q
		`,
		{ end: true }
	)
	await deleteSession.waitForOutput('DELETE_FIRST_DELETE_COMMITTED')
	const deleteExit = await deleteSession.waitForExit()
	assert.equal(deleteExit.code, 0, deleteSession.stderr.trim())

	const addExit = await addSession.waitForExit()
	assert.notEqual(addExit.code, 0, 'add unexpectedly succeeded after deletion')
	assert.match(addSession.stderr, /Record not found/)
	assertFinalIntegrity(recordId)
	runAdminSql(`DELETE FROM auth.users WHERE id = '${userId}';`)
}

async function main() {
	const activeSessions = []
	try {
		runAdminSql('SELECT 1;')
		await runAddFirstScenario(activeSessions)
		await runDeleteFirstScenario(activeSessions)
		console.log('Crate membership concurrency proof passed.')
	} finally {
		await Promise.allSettled(
			activeSessions.map((session) => session.terminate())
		)
		runAdminSql(`
			DELETE FROM auth.users
			WHERE id IN (
				'00000000-0000-0000-0000-000000004701',
				'00000000-0000-0000-0000-000000004711'
			);
		`)
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
