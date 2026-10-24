#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const idPattern =
	/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const idBody = idPattern.source.slice(1, -1)
const objectKeyPattern = new RegExp(
	`^recovery-v1/(?:${idBody}\\.tar\\.gz\\.age|success/${idBody}\\.json)$`
)

export function validateReceipt(receipt, config) {
	if (
		!idPattern.test(receipt?.id || '') ||
		receipt.projectRef !== config.projectRef ||
		receipt.object !==
			`${config.bucket}/recovery-v1/${receipt.id}.tar.gz.age` ||
		!/^[a-f0-9]{64}$/.test(receipt.sha256 || '') ||
		!Number.isSafeInteger(receipt.bytes) ||
		receipt.bytes <= 0 ||
		!Number.isFinite(Date.parse(receipt.uploadedAt))
	)
		throw new Error('Invalid successful recovery receipt.')
	return receipt
}

export function planRetention(receipts, config, keep = 30) {
	if (!Number.isSafeInteger(keep) || keep < 30)
		throw new Error('Retain at least 30 successful recovery sets.')
	const sorted = receipts
		.map((r) => validateReceipt(r, config))
		.sort((a, b) => b.id.localeCompare(a.id))
	if (new Set(sorted.map((r) => r.id)).size !== sorted.length)
		throw new Error('Duplicate recovery success receipt.')
	return { keep: sorted.slice(0, keep), remove: sorted.slice(keep) }
}

export function createR2Storage(
	config,
	{ environment = process.env, command = spawnSync } = {}
) {
	if (
		!environment.RECOVERY_R2_ACCESS_KEY_ID ||
		!environment.RECOVERY_R2_SECRET_ACCESS_KEY
	)
		throw new Error(
			'Provide bucket-scoped R2 S3 credentials through the environment.'
		)
	if (
		!/^[a-f0-9]{32}$/.test(config.cloudflareAccountId) ||
		config.jurisdiction !== 'eu' ||
		config.bucket !== 'crate-guide-production-backups'
	)
		throw new Error('Unexpected independent backup destination.')
	const env = {
		...environment,
		AWS_ACCESS_KEY_ID: environment.RECOVERY_R2_ACCESS_KEY_ID,
		AWS_SECRET_ACCESS_KEY: environment.RECOVERY_R2_SECRET_ACCESS_KEY,
		AWS_SESSION_TOKEN: environment.RECOVERY_R2_SESSION_TOKEN || '',
		AWS_CONFIG_FILE: devNull,
		AWS_SHARED_CREDENTIALS_FILE: devNull,
		AWS_EC2_METADATA_DISABLED: 'true',
		AWS_PAGER: '',
		AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
		AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required'
	}
	delete env.AWS_PROFILE
	const execute = (operation, key, args = []) => {
		if (key && !objectKeyPattern.test(key))
			throw new Error('Unexpected recovery object key.')
		const result = command(
			'aws',
			[
				'--endpoint-url',
				`https://${config.cloudflareAccountId}.eu.r2.cloudflarestorage.com`,
				'--region',
				'auto',
				'--output',
				'json',
				's3api',
				operation,
				'--bucket',
				config.bucket,
				...(key ? ['--key', key] : []),
				...args
			],
			{
				env,
				encoding: 'utf8',
				shell: false,
				timeout: 60_000,
				maxBuffer: 16 * 1024 * 1024
			}
		)
		if (result.error || result.status !== 0)
			throw new Error('R2 S3 operation failed; private output suppressed.')
		return result.stdout?.trim() ? JSON.parse(result.stdout) : {}
	}
	return {
		put: (key, file, contentType = 'application/octet-stream') =>
			execute('put-object', key, [
				'--body',
				file,
				'--content-type',
				contentType
			]),
		get: (key, file) => execute('get-object', key, [file]),
		head: (key) => execute('head-object', key),
		remove: (key) => execute('delete-object', key),
		listSuccesses: () =>
			(
				execute('list-objects-v2', null, ['--prefix', 'recovery-v1/success/'])
					.Contents || []
			).map((o) => o.Key)
	}
}

export function retainSuccesses(storage, config) {
	const directory = mkdtempSync(resolve(tmpdir(), 'crate-guide-retention-'))
	try {
		const receipts = storage.listSuccesses().map((key, index) => {
			const file = resolve(directory, `${index}.json`)
			storage.get(key, file)
			const receipt = validateReceipt(JSON.parse(readFileSync(file)), config)
			if (key !== `recovery-v1/success/${receipt.id}.json`)
				throw new Error('Success receipt path mismatch.')
			return receipt
		})
		if (!receipts.length)
			throw new Error('No successful recovery sets found; retention aborted.')
		const plan = planRetention(receipts, config)
		// Check every retained ciphertext before deleting anything older.
		for (const receipt of plan.keep) {
			const metadata = storage.head(
				receipt.object.slice(config.bucket.length + 1)
			)
			if (metadata.ContentLength !== receipt.bytes)
				throw new Error(
					'Retained recovery set is missing or has changed; retention aborted.'
				)
		}
		for (const receipt of plan.remove) {
			storage.remove(receipt.object.slice(config.bucket.length + 1))
			storage.remove(`recovery-v1/success/${receipt.id}.json`)
		}
		return { kept: plan.keep.length, removed: plan.remove.length }
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		process.umask(0o077)
		if (process.argv[2] !== 'retain')
			throw new Error('Usage: recovery-storage.mjs retain')
		const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
		const config = JSON.parse(
			readFileSync(resolve(root, 'deployment/recovery.json'))
		)
		console.log(
			JSON.stringify(retainSuccesses(createR2Storage(config), config))
		)
	} catch (error) {
		console.error(
			error instanceof SyntaxError
				? 'Recovery metadata could not be parsed; private output suppressed.'
				: error.message
		)
		process.exitCode = 1
	}
}
