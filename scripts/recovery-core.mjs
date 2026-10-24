import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, resolve, sep } from 'node:path'

export const sha256 = (value) =>
	createHash('sha256').update(value).digest('hex')

export function assertPrivateDirectory(directory, repository) {
	let ancestor = resolve(directory)
	const tail = []
	while (!existsSync(ancestor)) {
		tail.unshift(basename(ancestor))
		ancestor = dirname(ancestor)
	}
	const target = resolve(realpathSync(ancestor), ...tail)
	const root = existsSync(repository)
		? realpathSync(repository)
		: resolve(repository)
	if (target === root || target.startsWith(root + sep)) {
		throw new Error('Recovery files must be stored outside the repository.')
	}
	for (let parent = target; ; parent = dirname(parent)) {
		if (existsSync(resolve(parent, '.git'))) {
			// A home-directory dotfiles repository can surround private storage.
			// Require that repository to explicitly ignore the destination.
			const ignored = spawnSync(
				'git',
				['-C', parent, 'check-ignore', '--quiet', '--no-index', '--', target],
				{ timeout: 5000, stdio: 'ignore' }
			)
			if (ignored.status !== 0)
				throw new Error(
					'Recovery storage is inside another Git checkout and is not ignored.'
				)
			break
		}
		if (parent === dirname(parent)) break
	}
	return target
}

export function coverFile(path) {
	if (
		typeof path !== 'string' ||
		!path ||
		path.startsWith('/') ||
		path.includes('\\') ||
		path.split('/').some((part) => !part || part === '.' || part === '..') ||
		Array.from(path).some(
			(character) =>
				character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
		)
	) {
		throw new Error('Invalid managed cover path.')
	}
	return `covers/${sha256(path)}.bin`
}

export async function downloadCover({
	apiUrl,
	apiKey,
	path,
	expectedSize,
	expectedEtag,
	fetchFn = fetch
}) {
	coverFile(path)
	const url = new URL(apiUrl)
	if (
		url.origin !== 'https://czlfiwivlgqhqezmywfx.supabase.co' &&
		url.origin !== 'http://127.0.0.1:42821'
	) {
		throw new Error('Unexpected recovery source.')
	}
	const response = await fetchFn(
		`${url.origin}/storage/v1/object/authenticated/record-covers/${path.split('/').map(encodeURIComponent).join('/')}`,
		{
			headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
			redirect: 'error',
			signal: AbortSignal.timeout(60_000)
		}
	)
	if (!response.ok)
		throw new Error(`Cover download failed: HTTP ${response.status}.`)
	const bytes = Buffer.from(await response.arrayBuffer())
	if (
		!bytes.length ||
		(expectedSize != null && bytes.length !== Number(expectedSize))
	) {
		throw new Error('Cover size differs from the database snapshot.')
	}
	const normalizeEtag = (value) =>
		String(value || '')
			.replace(/^W\//, '')
			.replaceAll('"', '')
	const expected = normalizeEtag(expectedEtag)
	const actual = normalizeEtag(response.headers.get('etag'))
	const md5 = createHash('md5').update(bytes).digest('hex')
	if (!expected || (actual !== expected && md5 !== expected)) {
		throw new Error('Cover fingerprint differs from the database snapshot.')
	}
	return { bytes, sha256: sha256(bytes), size: bytes.length }
}

export function verifyFiles(directory, files) {
	if (!files || typeof files !== 'object' || Array.isArray(files)) {
		throw new Error('Invalid recovery file manifest.')
	}
	for (const [path, expected] of Object.entries(files)) {
		if (
			!/^(?:[a-z][a-z0-9-]*\.(?:sql|json)|covers\/[a-f0-9]{64}\.bin)$/.test(
				path
			)
		) {
			throw new Error('Unexpected recovery file path.')
		}
		const bytes = readFileSync(resolve(directory, path))
		if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) {
			throw new Error('Recovery file checksum mismatch.')
		}
	}
}

export function assertRestoreContainer(container, runId) {
	if (
		container?.Config?.Labels?.['guide.crate.recovery'] !== runId ||
		container?.HostConfig?.NetworkMode !== 'none' ||
		Object.keys(container?.HostConfig?.PortBindings ?? {}).length !== 0
	) {
		throw new Error(
			"Restore requires this run's isolated, unexposed container."
		)
	}
}

export const sqlLiteral = (value) =>
	value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`

// Vault 0.3.1 binds ciphertext to the secret UUID. Re-encrypt the saved
// plaintext under the isolated server key while preserving that UUID.
export function vaultRestoreSql(secrets) {
	return secrets
		.map((secret) => {
			const values = [
				secret.id,
				secret.name,
				secret.description,
				secret.decrypted_secret,
				secret.created_at,
				secret.updated_at
			].map(sqlLiteral)
			return `INSERT INTO vault.secrets(id,name,description,secret,created_at,updated_at) VALUES (${values.join(',')});
UPDATE vault.secrets SET secret=encode(vault._crypto_aead_det_encrypt(message:=convert_to(secret,'utf8'),additional:=convert_to(id::text,'utf8'),key_id:=0,context:='pgsodium'::bytea,nonce:=nonce),'base64') WHERE id=${sqlLiteral(secret.id)}::uuid;`
		})
		.join('\n')
}
