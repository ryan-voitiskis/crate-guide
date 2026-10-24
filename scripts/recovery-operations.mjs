#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPrivateDirectory, sha256 } from './recovery-core.mjs'
import { createR2Storage, readSuccessReceipts } from './recovery-storage.mjs'

export function latestFreshRecovery(
	receipts,
	now = new Date(),
	maxAgeHours = 36
) {
	if (
		!Number.isFinite(now.getTime()) ||
		!Number.isFinite(maxAgeHours) ||
		maxAgeHours <= 0
	)
		throw new Error('Invalid recovery freshness policy.')
	const latest = [...receipts].sort((a, b) => b.id.localeCompare(a.id))[0]
	const captured = Date.parse(latest?.dataEndedAt)
	const uploaded = Date.parse(latest?.uploadedAt)
	if (
		!latest ||
		!Number.isFinite(captured) ||
		!Number.isFinite(uploaded) ||
		captured > uploaded ||
		uploaded > now.getTime() + 300_000
	)
		throw new Error('No valid dated recovery capture is available.')
	if (now.getTime() - captured > maxAgeHours * 3_600_000)
		throw new Error(
			`The last verified recovery capture is stale (over ${maxAgeHours} hours).`
		)
	return latest
}

export function downloadVerifiedRecovery(storage, config, receipt, file) {
	storage.get(receipt.object.slice(config.bucket.length + 1), file)
	const bytes = readFileSync(file)
	if (bytes.length !== receipt.bytes || sha256(bytes) !== receipt.sha256)
		throw new Error(
			'Downloaded recovery ciphertext does not match its success receipt.'
		)
}

function main() {
	process.umask(0o077)
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
	const config = JSON.parse(
		readFileSync(resolve(root, 'deployment/recovery.json'))
	)
	const [operation, destination, identity] = process.argv.slice(2)
	if (
		!['check', 'rehearse'].includes(operation) ||
		(operation === 'rehearse' && (!destination || !identity))
	)
		throw new Error(
			'Usage: recovery-operations.mjs check, or rehearse NEW_PRIVATE_DIRECTORY AGE_IDENTITY'
		)
	const credentialFile = process.env.RECOVERY_R2_CREDENTIALS_FILE
	let environment = process.env
	if (credentialFile) {
		const file = assertPrivateDirectory(credentialFile, root)
		if (statSync(file).mode & 0o077)
			throw new Error('Recovery credential file must be private (mode 600).')
		const credentials = JSON.parse(readFileSync(file))
		environment = {
			...process.env,
			RECOVERY_R2_ACCESS_KEY_ID: credentials.RECOVERY_R2_ACCESS_KEY_ID,
			RECOVERY_R2_SECRET_ACCESS_KEY: credentials.RECOVERY_R2_SECRET_ACCESS_KEY
		}
	}
	const storage = createR2Storage(config, { environment })
	const receipt = latestFreshRecovery(readSuccessReceipts(storage, config))
	if (operation === 'check') {
		if (
			storage.head(receipt.object.slice(config.bucket.length + 1))
				.ContentLength !== receipt.bytes
		)
			throw new Error('The latest recovery object is missing or has changed.')
		console.log(
			JSON.stringify({
				status: 'fresh',
				projectRef: config.projectRef,
				dataEndedAt: receipt.dataEndedAt,
				uploadedAt: receipt.uploadedAt
			})
		)
		return
	}
	const directory = assertPrivateDirectory(destination, root)
	if (existsSync(directory))
		throw new Error('Use a new private rehearsal directory.')
	mkdirSync(directory, { mode: 0o700 })
	const archive = resolve(directory, 'readback.tar.gz.age')
	const restored = resolve(directory, 'restore')
	try {
		downloadVerifiedRecovery(storage, config, receipt, archive)
		const result = spawnSync(
			process.execPath,
			[
				resolve(root, 'scripts/recovery-backup.mjs'),
				'restore',
				restored,
				archive,
				resolve(identity)
			],
			{ cwd: root, env: process.env, stdio: 'inherit', timeout: 15 * 60_000 }
		)
		if (result.error || result.status !== 0)
			throw new Error('Independent recovery rehearsal failed.')
		const restoredReceipt = JSON.parse(
			readFileSync(resolve(restored, 'restore-receipt.json'))
		)
		if (restoredReceipt.ciphertextSha256 !== receipt.sha256)
			throw new Error('Rehearsal receipt checksum mismatch.')
		writeFileSync(
			resolve(directory, 'rehearsal-receipt.json'),
			JSON.stringify(
				{
					...restoredReceipt,
					object: receipt.object,
					dataEndedAt: receipt.dataEndedAt
				},
				null,
				2
			) + '\n',
			{ mode: 0o600 }
		)
		console.log(
			'Remote recovery rehearsal passed; plaintext removed and receipt retained.'
		)
	} finally {
		rmSync(restored, { recursive: true, force: true })
		rmSync(archive, { force: true })
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		main()
	} catch (error) {
		console.error(
			error instanceof SyntaxError
				? 'Recovery metadata could not be parsed; private output suppressed.'
				: error.message
		)
		process.exitCode = 1
	}
}
