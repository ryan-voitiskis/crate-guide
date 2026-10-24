import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import test from 'node:test'
import {
	createR2Storage,
	planRetention,
	retainSuccesses,
	validateReceipt
} from './recovery-storage.mjs'

const config = {
	projectRef: 'czlfiwivlgqhqezmywfx',
	cloudflareAccountId: '2584e96da1501a94e4af53e21f8f018d',
	jurisdiction: 'eu',
	bucket: 'crate-guide-production-backups'
}
const receipt = (index) => {
	const id = `2026-10-${String(index).padStart(2, '0')}T00-00-00-000Z-00000000-0000-0000-0000-000000000000`
	return {
		id,
		projectRef: config.projectRef,
		object: `${config.bucket}/recovery-v1/${id}.tar.gz.age`,
		sha256: 'a'.repeat(64),
		bytes: 1024,
		uploadedAt: '2026-10-24T00:00:00Z'
	}
}

test('retention counts successful sets and never selects the latest 30 for deletion', () => {
	const receipts = Array.from({ length: 31 }, (_, i) => receipt(i + 1))
	const plan = planRetention(receipts, config)
	assert.equal(plan.keep.length, 30)
	assert.deepEqual(plan.remove, [receipts[0]])
	assert.equal(planRetention(receipts.slice(0, 4), config).remove.length, 0)
	assert.throws(() => planRetention(receipts, config, 29))
	assert.throws(() => planRetention([receipts[0], receipts[0]], config))
	assert.throws(() =>
		validateReceipt({ ...receipts[0], projectRef: 'other-project' }, config)
	)
	assert.throws(() =>
		validateReceipt(
			{ ...receipts[0], object: 'another-bucket/private' },
			config
		)
	)
})

test('bucket credentials stay in the environment and the EU endpoint is fixed', () => {
	let observed
	const storage = createR2Storage(config, {
		environment: {
			RECOVERY_R2_ACCESS_KEY_ID: 'private-id',
			RECOVERY_R2_SECRET_ACCESS_KEY: 'private-secret',
			AWS_PROFILE: 'unrelated-account'
		},
		command: (binary, args, options) => {
			observed = { binary, args, options }
			return { status: 0, stdout: '{}' }
		}
	})
	storage.head(
		'recovery-v1/2026-10-24T00-00-00-000Z-00000000-0000-0000-0000-000000000000.tar.gz.age'
	)
	assert.equal(observed.options.env.AWS_SECRET_ACCESS_KEY, 'private-secret')
	assert.equal(observed.options.env.AWS_PROFILE, undefined)
	assert.ok(
		observed.args.includes(
			'https://2584e96da1501a94e4af53e21f8f018d.eu.r2.cloudflarestorage.com'
		)
	)
	assert.ok(!observed.args.join(' ').includes('private-secret'))
	assert.throws(() => storage.remove('unrelated/record-cover.webp'))
	assert.throws(() => createR2Storage(config, { environment: {} }))
})

test('failed retained-object verification prevents every deletion', () => {
	const receipts = Array.from({ length: 31 }, (_, i) => receipt(i + 1))
	const removed = []
	const storage = {
		listSuccesses: () =>
			receipts.map((r) => `recovery-v1/success/${r.id}.json`),
		get: (key, file) =>
			writeFileSync(
				file,
				JSON.stringify(receipts.find((r) => key.includes(r.id)))
			),
		head: () => ({ ContentLength: 0 }),
		remove: (key) => removed.push(key)
	}
	assert.throws(() => retainSuccesses(storage, config), /retention aborted/)
	assert.deepEqual(removed, [])
	storage.head = () => ({ ContentLength: 1024 })
	assert.deepEqual(retainSuccesses(storage, config), { kept: 30, removed: 1 })
	assert.deepEqual(removed, [
		receipts[0].object.slice(config.bucket.length + 1),
		`recovery-v1/success/${receipts[0].id}.json`
	])
})
