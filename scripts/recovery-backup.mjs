#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import {
	assertPrivateDirectory,
	assertRestoreContainer,
	coverFile,
	downloadCover,
	sha256,
	sqlLiteral,
	vaultRestoreSql,
	verifyFiles
} from './recovery-core.mjs'
import { createR2Storage, validateReceipt } from './recovery-storage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(
	readFileSync(resolve(root, 'deployment/recovery.json'))
)
const supabase =
	process.env.RECOVERY_SUPABASE_CLI ||
	resolve(root, 'node_modules/.bin/supabase')
const wrangler =
	process.env.RECOVERY_WRANGLER_CLI ||
	resolve(root, 'node_modules/.bin/wrangler')
const schemas = 'public,auth,storage,supabase_migrations'
const platformQuery = `SELECT
 (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.extname) FROM (SELECT extname,extversion,n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace) e) AS extensions,
 (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM (SELECT id,name,description,decrypted_secret,created_at,updated_at FROM vault.decrypted_secrets) v) AS vault,
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version) FROM auth.schema_migrations m) AS auth_migrations,
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM storage.migrations m) AS storage_migrations,
 (SELECT jsonb_agg(to_jsonb(j) ORDER BY j.jobid) FROM cron.job j) AS cron_jobs,
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.version) FROM (SELECT version,name,md5(statements::text) AS statements_md5 FROM supabase_migrations.schema_migrations) m) AS migrations;`
const snapshotQuery = `SELECT json_build_object(
 'counts',(SELECT json_object_agg(n,c) FROM (
  SELECT 'users' n,count(*) c FROM auth.users UNION ALL SELECT 'records',count(*) FROM public.records
  UNION ALL SELECT 'tracks',count(*) FROM public.tracks UNION ALL SELECT 'crates',count(*) FROM public.crates
  UNION ALL SELECT 'sets',count(*) FROM public.sets UNION ALL SELECT 'migrations',count(*) FROM supabase_migrations.schema_migrations) c),
 'covers',(SELECT coalesce(json_agg(json_build_object('path',name,'size',metadata->>'size','etag',metadata->>'eTag') ORDER BY name),'[]') FROM storage.objects WHERE bucket_id='record-covers'),
 'missingCovers',(SELECT count(*) FROM public.records r WHERE r.cover_storage_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='record-covers' AND o.name=r.cover_storage_path)),
 'invalidTrackOwners',(SELECT count(*) FROM public.tracks t LEFT JOIN public.records r ON r.id=t.record_id WHERE r.id IS NULL OR r.user_id<>t.user_id),
 'invalidRecordOwners',(SELECT count(*) FROM public.records r LEFT JOIN auth.users u ON u.id=r.user_id WHERE u.id IS NULL),
 'invalidCrateMembers',(SELECT count(*) FROM public.crates c CROSS JOIN LATERAL unnest(c.records) member LEFT JOIN public.records r ON r.id=member WHERE r.id IS NULL OR r.user_id<>c.user_id),
 'migrationInventory',(SELECT json_agg(json_build_object('version',version,'name',name,'statements_md5',md5(statements::text)) ORDER BY version) FROM supabase_migrations.schema_migrations)
);`

function run(
	binary,
	args,
	{ input, env = process.env, timeout = 300_000 } = {}
) {
	const result = spawnSync(binary, args, {
		cwd: root,
		encoding: 'utf8',
		shell: false,
		input,
		env,
		timeout,
		maxBuffer: 32 * 1024 * 1024
	})
	// Database errors can contain row values. Never echo child output here.
	if (result.error || result.status !== 0)
		throw new Error(
			`${binary.split('/').at(-1)} failed; private output suppressed.`
		)
	return result.stdout
}

function writeJson(path, value) {
	writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
}

function sourceQuery(sql) {
	return JSON.parse(
		run(supabase, [
			'--agent',
			'no',
			'db',
			'query',
			'--linked',
			'--project-ref',
			config.projectRef,
			'--output',
			'json',
			`BEGIN READ ONLY; ${sql} COMMIT;`
		])
	)[0]
}

function dump(directory, filename, flags) {
	run(supabase, [
		'--agent',
		'no',
		'db',
		'dump',
		'--linked',
		'--project-ref',
		config.projectRef,
		...flags,
		'--file',
		resolve(directory, filename)
	])
}

async function withRestore(directory, action) {
	const runId = randomUUID()
	const name = `crate-guide-recovery-${runId}`
	const password = resolve(directory, 'restore-password')
	writeFileSync(password, randomBytes(32).toString('hex'), {
		mode: 0o600,
		flag: 'wx'
	})
	let created = false
	const inspect = () => JSON.parse(run('docker', ['inspect', name]))[0]
	const sql = (input) => {
		assertRestoreContainer(inspect(), runId)
		return run(
			'docker',
			[
				'exec',
				'-i',
				name,
				'psql',
				'-U',
				'supabase_admin',
				'-d',
				'postgres',
				'--no-psqlrc',
				'--set',
				'ON_ERROR_STOP=1',
				'--single-transaction',
				'-At'
			],
			{ input }
		)
	}
	try {
		run('docker', [
			'create',
			'--name',
			name,
			'--network',
			'none',
			'--no-healthcheck',
			'--label',
			`guide.crate.recovery=${runId}`,
			'--mount',
			`type=bind,source=${password},target=/run/secrets/postgres-password,readonly`,
			'--env',
			'POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password',
			config.restoreImage,
			'postgres',
			'-D',
			'/etc/postgresql',
			'-c',
			'cron.launch_active_jobs=off',
			'-c',
			'listen_addresses='
		])
		created = true
		assertRestoreContainer(inspect(), runId)
		run('docker', ['start', name])
		let ready = false
		for (let attempt = 0; attempt < 90; attempt++) {
			const status = spawnSync(
				'docker',
				['exec', name, 'pg_isready', '-U', 'supabase_admin'],
				{ stdio: 'ignore' }
			)
			// Wait for entrypoint migrations as well as the transient bootstrap server.
			const logs = run('docker', ['logs', name])
			if (
				status.status === 0 &&
				logs.includes('PostgreSQL init process complete')
			) {
				ready = true
				break
			}
			await delay(500)
		}
		if (!ready) throw new Error('Isolated database did not become ready.')
		sql(
			'DROP SCHEMA auth CASCADE; DROP SCHEMA storage CASCADE; CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog; CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;'
		)
		for (const file of ['roles.sql', 'schema.sql', 'data.sql'])
			sql(readFileSync(resolve(directory, file), 'utf8'))
		const platform = JSON.parse(
			readFileSync(resolve(directory, 'platform-private.json'))
		)[0]
		for (const [table, records] of [
			['auth.schema_migrations', platform.auth_migrations],
			['storage.migrations', platform.storage_migrations]
		]) {
			if (records?.length)
				sql(
					`INSERT INTO ${table} SELECT * FROM json_populate_recordset(null::${table},${sqlLiteral(JSON.stringify(records))});`
				)
		}
		if (
			platform.extensions.find((e) => e.extname === 'supabase_vault')
				?.extversion !== '0.3.1'
		)
			throw new Error('Unsupported Vault recovery format.')
		if ((platform.vault || []).length) sql(vaultRestoreSql(platform.vault))
		const vaultHashes = JSON.parse(
			sql(
				"SELECT coalesce(json_agg(json_build_object('id',id,'sha256',encode(extensions.digest(decrypted_secret,'sha256'),'hex'))),'[]') FROM vault.decrypted_secrets;"
			).trim()
		)
		if (
			!(platform.vault || []).every(
				(v) =>
					vaultHashes.find((h) => h.id === v.id)?.sha256 ===
					sha256(v.decrypted_secret)
			)
		)
			throw new Error('Vault restore mismatch.')
		const snapshot = JSON.parse(sql(snapshotQuery).trim())
		if (
			snapshot.missingCovers ||
			snapshot.invalidTrackOwners ||
			snapshot.invalidRecordOwners ||
			snapshot.invalidCrateMembers
		)
			throw new Error('Restored relationship or cover inventory check failed.')
		if (!isDeepStrictEqual(snapshot.migrationInventory, platform.migrations))
			throw new Error('Migration inventory mismatch.')
		const unsafe = JSON.parse(
			sql(
				"SELECT json_build_object('cron',(SELECT count(*) FROM cron.job),'network',current_setting('listen_addresses'),'scheduler',current_setting('cron.launch_active_jobs')); "
			).trim()
		)
		if (unsafe.cron || unsafe.network || unsafe.scheduler !== 'off')
			throw new Error('Restore isolation check failed.')
		return await action({ snapshot, sql, name })
	} finally {
		if (created) {
			assertRestoreContainer(inspect(), runId)
			run('docker', ['rm', '--force', '--volumes', name])
		}
		rmSync(password, { force: true })
	}
}

async function capture(directory) {
	if (run('git', ['status', '--porcelain']).trim())
		throw new Error('Capture requires a committed, clean recovery checkout.')
	const token = process.env.SUPABASE_ACCESS_TOKEN
	if (!token)
		throw new Error(
			'Provide an authorized Supabase Management token through the environment.'
		)
	const project = JSON.parse(
		run(supabase, ['--agent', 'no', 'projects', 'list', '--output', 'json'])
	).find((p) => p.id === config.projectRef)
	if (
		project?.organization_id !== config.organizationId ||
		project.status !== 'ACTIVE_HEALTHY' ||
		!project.database?.version?.startsWith('17.')
	)
		throw new Error(
			'Unexpected production project, database version or organization.'
		)
	const startedAt = new Date().toISOString()
	const readResources = async () => {
		const resources = {}
		for (const resource of [
			'config/auth',
			'functions',
			'secrets',
			'pgsodium'
		]) {
			const response = await fetch(
				`https://api.supabase.com/v1/projects/${config.projectRef}/${resource}`,
				{
					headers: { Authorization: `Bearer ${token}` },
					redirect: 'error',
					signal: AbortSignal.timeout(30_000)
				}
			)
			if (!response.ok)
				throw new Error(`Management export failed: HTTP ${response.status}.`)
			resources[resource] = await response.json()
		}
		return resources
	}
	const resources = await readResources()
	if (!/^[a-f0-9]{64}$/i.test(resources.pgsodium?.root_key || ''))
		throw new Error('Production encryption root key was not exported.')
	const platform = sourceQuery(platformQuery)
	writeJson(resolve(directory, 'platform-private.json'), [platform])
	dump(directory, 'roles.sql', ['--role-only'])
	dump(directory, 'schema.sql', ['--schema', schemas])
	const dataStartedAt = new Date().toISOString()
	dump(directory, 'data.sql', [
		'--schema',
		schemas,
		'--data-only',
		'--use-copy'
	])
	const dataEndedAt = new Date().toISOString()
	dump(directory, 'schema-after.sql', ['--schema', schemas])
	if (
		sha256(readFileSync(resolve(directory, 'schema.sql'))) !==
		sha256(readFileSync(resolve(directory, 'schema-after.sql')))
	)
		throw new Error('Schema changed during capture.')
	if (!isDeepStrictEqual(sourceQuery(platformQuery), platform))
		throw new Error(
			'Platform settings, Vault, or migrations changed during capture.'
		)
	if (!isDeepStrictEqual(await readResources(), resources))
		throw new Error('Production configuration changed during capture.')
	for (const [resource, value] of Object.entries(resources))
		writeJson(
			resolve(directory, resource.replaceAll('/', '-') + '.json'),
			value
		)
	const suppliedSecrets = JSON.parse(
		readFileSync(
			process.env.RECOVERY_EDGE_SECRETS_FILE ||
				resolve(directory, 'edge-secret-input-required.json')
		)
	)
	const candidates = [
		...Object.values(suppliedSecrets),
		...(platform.vault || []).map((v) => v.decrypted_secret),
		resources['config/auth'].site_url
	]
	const edgeSecrets = {}
	for (const secret of resources.secrets.filter(
		(s) => !s.name.startsWith('SUPABASE_')
	)) {
		const value = candidates.find(
			(candidate) =>
				typeof candidate === 'string' && sha256(candidate) === secret.value
		)
		if (value === undefined)
			throw new Error(
				'A production Edge secret value is unavailable or differs from its digest.'
			)
		edgeSecrets[secret.name] = value
	}
	writeJson(resolve(directory, 'edge-private.json'), edgeSecrets)
	const apiKeys = JSON.parse(
		run(supabase, [
			'--agent',
			'no',
			'projects',
			'api-keys',
			'--project-ref',
			config.projectRef,
			'--reveal',
			'--output',
			'json'
		])
	)
	const apiKey = apiKeys.find((k) => k.name === 'service_role')?.api_key
	if (!apiKey) throw new Error('Storage read credential unavailable.')
	mkdirSync(resolve(directory, 'covers'), { mode: 0o700 })
	const covers = []
	const snapshot = await withRestore(directory, async ({ snapshot }) => {
		for (const object of snapshot.covers) {
			const result = await downloadCover({
				apiUrl: `https://${config.projectRef}.supabase.co`,
				apiKey,
				path: object.path,
				expectedSize: object.size,
				expectedEtag: object.etag
			})
			const file = coverFile(object.path)
			writeFileSync(resolve(directory, file), result.bytes, { mode: 0o600 })
			covers.push({
				path: object.path,
				file,
				size: result.size,
				sha256: result.sha256
			})
		}
		return snapshot
	})
	const files = {}
	for (const filename of readdirSync(directory).filter((f) =>
		/\.(sql|json)$/.test(f)
	)) {
		const bytes = readFileSync(resolve(directory, filename))
		files[filename] = { size: bytes.length, sha256: sha256(bytes) }
	}
	for (const cover of covers)
		files[cover.file] = { size: cover.size, sha256: cover.sha256 }
	writeJson(resolve(directory, 'manifest.json'), {
		formatVersion: 1,
		projectRef: config.projectRef,
		startedAt,
		dataStartedAt,
		dataEndedAt,
		endedAt: new Date().toISOString(),
		sourceRevision: run('git', ['rev-parse', 'HEAD']).trim(),
		supabaseVersion: run(supabase, ['--version']).trim(),
		counts: snapshot.counts,
		covers,
		files,
		recoveryLimits: [
			'Provider-managed API/JWT keys must be reissued for a replacement project.',
			'OAuth callback URLs, source-project URLs in Vault and cron require deliberate rebinding before enabling outbound integrations.',
			'Database and cover capture are separate operations; missing or changed referenced objects fail capture.'
		]
	})
	console.log(
		'Capture and isolated database validation completed. Scheduling is not activated.'
	)
}

function seal(directory) {
	const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json')))
	if (manifest.projectRef !== config.projectRef || manifest.formatVersion !== 1)
		throw new Error('Unexpected recovery manifest.')
	verifyFiles(directory, manifest.files)
	const id =
		new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID()
	const archive = resolve(directory, 'recovery.tar.gz')
	const encrypted = resolve(directory, 'recovery.tar.gz.age')
	const readback = resolve(directory, 'readback.tar.gz.age')
	const transport = process.env.RECOVERY_R2_TRANSPORT || 'wrangler'
	if (!['s3', 'wrangler'].includes(transport))
		throw new Error('Unexpected R2 transport.')
	const storage = transport === 's3' ? createR2Storage(config) : null
	const env = {
		...process.env,
		CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId
	}
	const put = (key, file, contentType) =>
		storage
			? storage.put(key, file, contentType)
			: run(
					wrangler,
					[
						'r2',
						'object',
						'put',
						`${config.bucket}/${key}`,
						'--jurisdiction',
						config.jurisdiction,
						'--remote',
						'--file',
						file,
						'--content-type',
						contentType
					],
					{ env }
				)
	try {
		run('tar', [
			'-czf',
			archive,
			'-C',
			directory,
			'manifest.json',
			...Object.keys(manifest.files)
		])
		run('age', [
			'--encrypt',
			'--recipient',
			config.recipient,
			'--output',
			encrypted,
			archive
		])
		const key = `recovery-v1/${id}.tar.gz.age`
		const object = `${config.bucket}/${key}`
		put(key, encrypted, 'application/octet-stream')
		if (storage) storage.get(key, readback)
		else
			run(
				wrangler,
				[
					'r2',
					'object',
					'get',
					object,
					'--jurisdiction',
					config.jurisdiction,
					'--remote',
					'--file',
					readback
				],
				{ env }
			)
		const checksum = sha256(readFileSync(encrypted))
		if (sha256(readFileSync(readback)) !== checksum)
			throw new Error('Remote ciphertext checksum mismatch.')
		const receipt = {
			id,
			projectRef: config.projectRef,
			object,
			jurisdiction: config.jurisdiction,
			sha256: checksum,
			uploadedAt: new Date().toISOString(),
			bytes: readFileSync(readback).length
		}
		validateReceipt(receipt, config)
		writeJson(resolve(directory, 'upload-receipt.json'), receipt)
		// Only complete data/configuration captures advance successful retention.
		const requiredFiles = [
			'roles.sql',
			'schema.sql',
			'data.sql',
			'platform-private.json',
			'config-auth.json',
			'edge-private.json',
			'pgsodium.json',
			'functions.json',
			'secrets.json'
		]
		if (requiredFiles.every((file) => Object.hasOwn(manifest.files, file)))
			put(
				`recovery-v1/success/${id}.json`,
				resolve(directory, 'upload-receipt.json'),
				'application/json'
			)
		console.log(`Encrypted upload and readback verified: ${id}`)
	} finally {
		rmSync(archive, { force: true })
	}
}

async function restore(directory, encrypted, identity) {
	const started = Date.now()
	const archive = resolve(directory, 'restore.tar.gz')
	run('age', [
		'--decrypt',
		'--identity',
		resolve(identity),
		'--output',
		archive,
		resolve(encrypted)
	])
	const names = run('tar', ['-tzf', archive]).trim().split('\n')
	const listing = run('tar', ['-tvzf', archive]).trim().split('\n')
	if (
		listing.some((line) => !line.startsWith('-')) ||
		names.some(
			(name) =>
				!/^(?:[a-z][a-z0-9-]*\.(?:sql|json)|covers\/[a-f0-9]{64}\.bin)$/.test(
					name
				)
		) ||
		new Set(names).size !== names.length
	)
		throw new Error('Unexpected archive entry.')
	run('tar', [
		'-xzf',
		archive,
		'-C',
		directory,
		'--no-same-owner',
		'--no-same-permissions'
	])
	rmSync(archive)
	const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json')))
	if (manifest.formatVersion !== 1 || manifest.projectRef !== config.projectRef)
		throw new Error('Unexpected restore source.')
	verifyFiles(directory, manifest.files)
	const snapshot = await withRestore(directory, async ({ snapshot }) => {
		if (!isDeepStrictEqual(snapshot.counts, manifest.counts))
			throw new Error('Restored row counts differ.')
		for (const cover of snapshot.covers) {
			const entry = manifest.covers.find((c) => c.path === cover.path)
			if (
				!entry ||
				entry.file !== coverFile(cover.path) ||
				entry.size !== Number(cover.size) ||
				sha256(readFileSync(resolve(directory, entry.file))) !== entry.sha256
			)
				throw new Error('Cover restore mismatch.')
		}
		return snapshot
	})
	writeJson(resolve(directory, 'restore-receipt.json'), {
		projectRef: config.projectRef,
		restoredAt: new Date().toISOString(),
		seconds: (Date.now() - started) / 1000,
		counts: snapshot.counts,
		verifiedCovers: snapshot.covers.length,
		ciphertextSha256: sha256(readFileSync(resolve(encrypted))),
		network: 'none',
		cron: 'disabled'
	})
	console.log('Restore from encrypted archive passed; isolated target removed.')
}

async function main() {
	process.umask(0o077)
	const [command, path, encrypted, identity] = process.argv.slice(2)
	if (
		!['capture', 'seal', 'restore'].includes(command) ||
		!path ||
		(command === 'restore' && (!encrypted || !identity))
	)
		throw new Error(
			'Usage: recovery-backup.mjs capture|seal DIRECTORY, or restore NEW_DIRECTORY ENCRYPTED_ARCHIVE AGE_IDENTITY'
		)
	const directory = assertPrivateDirectory(path, root)
	if (command === 'seal') {
		if (!existsSync(directory)) throw new Error('Capture directory missing.')
		seal(directory)
	} else {
		mkdirSync(directory, { mode: 0o700 })
		if (command === 'capture') await capture(directory)
		else await restore(directory, encrypted, identity)
	}
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error) => {
		console.error(
			error instanceof SyntaxError
				? 'Recovery metadata could not be parsed; private output suppressed.'
				: error.message
		)
		process.exitCode = 1
	})
}
