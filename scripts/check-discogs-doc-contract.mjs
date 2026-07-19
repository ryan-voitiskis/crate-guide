import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DOCUMENT_PATHS = ['README.md', 'docs/discogs-integration.md']
const OBSOLETE_CREDENTIAL_RPCS = [
	'get_discogs_credentials',
	'set_discogs_request_credentials',
	'set_discogs_access_credentials'
]

function findDiagnostics(root = process.cwd()) {
	const diagnostics = []

	for (const documentPath of DOCUMENT_PATHS) {
		let contents
		try {
			contents = readFileSync(resolve(root, documentPath), 'utf8')
		} catch {
			diagnostics.push(`${documentPath}: could not read current documentation`)
			continue
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
	}

	return diagnostics
}

const diagnostics = findDiagnostics()
if (diagnostics.length) {
	for (const diagnostic of diagnostics) console.error(diagnostic)
	process.exitCode = 1
} else {
	console.log('Discogs documentation contract passed.')
}
