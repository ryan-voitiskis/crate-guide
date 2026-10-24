import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { sha256 } from './recovery-core.mjs'
import {
	downloadVerifiedRecovery,
	latestFreshRecovery
} from './recovery-operations.mjs'

test('freshness uses the actual data capture time, rejects future receipts and incomplete legacy sets', () => {
	const now = new Date('2026-10-24T06:00:00Z')
	const receipt = {
		id: '2026-10-24',
		dataEndedAt: '2026-10-24T04:00:00Z',
		uploadedAt: '2026-10-24T04:10:00Z'
	}
	assert.equal(latestFreshRecovery([receipt], now), receipt)
	for (const receipts of [
		[],
		[{ ...receipt, dataEndedAt: undefined }],
		[{ ...receipt, dataEndedAt: '2026-10-22T00:00:00Z' }],
		[{ ...receipt, dataEndedAt: '2026-10-24T05:00:00Z' }],
		[{ ...receipt, uploadedAt: '2026-10-25T00:00:00Z' }]
	])
		assert.throws(() => latestFreshRecovery(receipts, now))
	assert.throws(() => latestFreshRecovery([receipt], new Date('invalid')))
})

test('a failed latest capture cannot be hidden by an older receipt or re-upload timestamp', () => {
	const now = new Date('2026-10-24T06:00:00Z')
	assert.throws(
		() =>
			latestFreshRecovery(
				[
					{
						id: '2026-10-23',
						dataEndedAt: '2026-10-23T04:00:00Z',
						uploadedAt: '2026-10-23T04:10:00Z'
					},
					{
						id: '2026-10-24',
						dataEndedAt: '2026-10-20T04:00:00Z',
						uploadedAt: '2026-10-24T04:10:00Z'
					}
				],
				now
			),
		/stale/
	)
})

test('rehearsal checks ciphertext length and hash before decryption', () => {
	const directory = mkdtempSync(
		resolve(tmpdir(), 'crate-guide-rehearsal-test-')
	)
	try {
		const config = { bucket: 'crate-guide-production-backups' }
		const receipt = {
			object: `${config.bucket}/recovery-v1/test.tar.gz.age`,
			bytes: 4,
			sha256: sha256('good')
		}
		const file = resolve(directory, 'archive.age')
		const storage = { get: (_key, path) => writeFileSync(path, 'good') }
		assert.doesNotThrow(() =>
			downloadVerifiedRecovery(storage, config, receipt, file)
		)
		storage.get = (_key, path) => writeFileSync(path, 'evil')
		assert.throws(
			() => downloadVerifiedRecovery(storage, config, receipt, file),
			/does not match/
		)
		storage.get = (_key, path) => writeFileSync(path, 'incomplete')
		assert.throws(
			() => downloadVerifiedRecovery(storage, config, receipt, file),
			/does not match/
		)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
})
