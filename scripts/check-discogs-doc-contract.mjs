import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DOCUMENT_PATHS = ['README.md', 'docs/discogs-integration.md']
const OBSOLETE_CREDENTIAL_RPCS = [
	'get_discogs_credentials',
	'set_discogs_request_credentials',
	'set_discogs_access_credentials'
]

const REQUIRED_CONTRACTS = Object.freeze({
	'README.md': [
		['request-token function', /`get-discogs-request-token`/],
		['access-token function', /`get-discogs-access-token`/],
		['authenticated dispatcher', /`authenticated-discogs-request`/],
		['user cover cleanup', /`cleanup-record-covers`/],
		['service cover cleanup', /`cleanup-orphaned-record-covers`/],
		['account deletion', /`delete-account`/],
		['source gateway setting', /verify_jwt\s*=\s*false/],
		['handler-owned authentication', /handlers?\s+(?:still\s+)?authenticat/i],
		['hosted evidence boundary', /verify[^.\n]+hosted environment/i]
	],
	'docs/discogs-integration.md': [
		['request-token function', /`get-discogs-request-token`/],
		['access-token function', /`get-discogs-access-token`/],
		['authenticated dispatcher', /`authenticated-discogs-request`/],
		['credential ownership', /verified user ID/i],
		['authorization header transport', /`Authorization` header/],
		['quota-bound transport', /quota-bound transport/],
		[
			'quota acquired immediately before dispatch',
			/immediately before (?:performing one )?fetch/i
		],
		['resumable identity code', /`discogs_identity_pending`/],
		['credential-free resume payload', /`\{ "resume": true \}`/],
		['user cover cleanup', /`cleanup-record-covers`/],
		['cleanup path ownership', /without (?:sending|accepting) a path/i],
		['service cover cleanup', /`cleanup-orphaned-record-covers`/],
		['source gateway setting', /verify_jwt\s*=\s*false/],
		['handler-owned authentication', /handlers?\s+(?:still\s+)?authenticat/i],
		['hosted evidence boundary', /hosted[^.\n]+(?:verify|verification)/i]
	]
})

export function findDiscogsDocumentationDiagnostics(root = process.cwd()) {
	const diagnostics = []

	for (const documentPath of DOCUMENT_PATHS) {
		let contents
		try {
			contents = readFileSync(resolve(root, documentPath), 'utf8')
		} catch {
			diagnostics.push(`${documentPath}: could not read current documentation`)
			continue
		}

		if (contents.trim().length === 0) {
			diagnostics.push(`${documentPath}: documentation must not be empty`)
		}

		for (const rpcName of OBSOLETE_CREDENTIAL_RPCS) {
			if (contents.includes(rpcName)) {
				diagnostics.push(
					`${documentPath}: remove obsolete credential RPC ${rpcName}`
				)
			}
		}

		if (
			/\bno\s+direct\b[^\n.]{0,80}\bhandler\s+tests?\b/i.test(contents) ||
			/\bdirect\b[^\n.]{0,40}\bhandler\s+tests?\b[^\n.]{0,30}\b(?:absent|missing|unavailable)\b/i.test(
				contents
			)
		) {
			diagnostics.push(
				`${documentPath}: direct Edge handler tests are implemented`
			)
		}

		for (const [contractName, pattern] of REQUIRED_CONTRACTS[documentPath]) {
			if (!pattern.test(contents)) {
				diagnostics.push(
					`${documentPath}: missing current ${contractName} contract`
				)
			}
		}
	}

	return diagnostics
}

function run() {
	const diagnostics = findDiscogsDocumentationDiagnostics()
	if (diagnostics.length) {
		for (const diagnostic of diagnostics) console.error(diagnostic)
		process.exitCode = 1
	} else {
		console.log('Discogs documentation contract passed.')
	}
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) run()
