import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PORTABILITY_DECISION_PATH = 'docs/decisions/discogs-data-portability.md'
const ACCOUNTLESS_DECISION_PATH = 'docs/decisions/accountless-discogs.md'
const DOCUMENT_PATHS = [
	'README.md',
	'docs/discogs-integration.md',
	PORTABILITY_DECISION_PATH,
	ACCOUNTLESS_DECISION_PATH
]
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
		['hosted evidence boundary', /hosted[^.\n]+(?:verify|verification)/i],
		[
			'portability decision link',
			/\.\/decisions\/discogs-data-portability\.md/
		],
		['accountless decision link', /\.\/decisions\/accountless-discogs\.md/],
		['unresolved decision state', /STOP - unresolved/],
		[
			'no external approval boundary',
			/No provider, legal, or maintainer\s+approval is recorded/i
		],
		[
			'adjacent attribution requirement',
			/`Data provided by Discogs\.` directly next/i
		],
		['exact attribution page', /exact Discogs page containing it/i],
		['six-hour display constraint', /six-hour display/i],
		['necessary-storage constraint', /necessary-storage constraints/i],
		['decision contract check', /`npm run check:discogs-docs`/]
	],
	[PORTABILITY_DECISION_PATH]: [
		['unresolved STOP status', /\*\*Status:\*\* STOP - unresolved/],
		['evidence check date', /\*\*Evidence checked:\*\* 2026-07-22/],
		['API Terms source date', /Last updated 2025-05-27/],
		[
			'official API Terms source',
			/https:\/\/support\.discogs\.com\/hc\/en-us\/articles\/360009334593-API-Terms-of-Use/
		],
		['official developer source', /https:\/\/www\.discogs\.com\/developers\//],
		[
			'official OAuth source',
			/https:\/\/www\.discogs\.com\/developers\/#page:authentication/
		],
		[
			'official collection source',
			/#page:user-collection,header:user-collection-collection-get/
		],
		['official image source', /#page:images/],
		['official CC0 dump source', /https:\/\/www\.discogs\.com\/data\//],
		[
			'official collection CSV source',
			/360007331534-How-Does-The-Collection-Feature-Work/
		],
		['source JSON path boundary', /source endpoint and source JSON path/i],
		['CC0 classification', /\*\*CC0-explicit:\*\*/],
		['Restricted classification', /\*\*Restricted-explicit:\*\*/],
		['Derived classification', /\*\*Derived:\*\*/],
		['User/application classification', /\*\*User\/application:\*\*/],
		['Unknown classification', /\*\*Unknown:\*\*/],
		['Operational classification', /\*\*Operational\/secret:\*\*/],
		[
			'record title matrix classification',
			/`records\.title`\s+\|\s+CC0-explicit: release title/
		],
		['record year matrix entry', /`records\.year` currently/],
		[
			'record artist ID matrix classification',
			/`records\.artists\[\]\.discogs_id`\s+\|\s+Unknown:/
		],
		['label catalogue number matrix entry', /`records\.labels\[\]\.catno`/],
		[
			'label thumbnail matrix classification',
			/`records\.labels\[\]\.thumbnail_url`\s+\|\s+Restricted-explicit: image reference/
		],
		[
			'track listing matrix entry',
			/`tracks\.title`, `\.position`, and `\.duration`/
		],
		[
			'track styles matrix classification',
			/`tracks\.genres\[\]`\s+\|\s+Unknown:/
		],
		['derived RPM matrix entry', /`tracks\.rpm`, computed as `45` or `33`/],
		[
			'release ID matrix classification',
			/`records\.discogs_id`\s+\|\s+Unknown:/
		],
		[
			'release URL matrix classification',
			/`records\.discogs_release_url`\s+\|\s+Unknown:/
		],
		[
			'external cover matrix classification',
			/`records\.cover`, import-card image URL\s+\|\s+Restricted-explicit: release image/
		],
		[
			'managed cover matrix entry',
			/Managed cover bytes plus `cover_storage_path`/
		],
		[
			'Discogs username matrix classification',
			/`profiles\.discogs_username`\s+\|\s+Restricted-explicit: Discogs User Data/
		],
		[
			'Discogs avatar matrix classification',
			/`profiles\.discogs_avatar_url`\s+\|\s+Restricted-explicit: User Image/
		],
		[
			'legacy Discogs UID matrix classification',
			/`profiles\.discogs_uid`\s+\|\s+Unknown; conservatively Restricted/
		],
		['collection Restricted matrix entry', /Restricted-explicit: collection/],
		['mixed collection payload entry', /Collection `basic_information` object/],
		['marketplace response exclusion entry', /`num_for_sale`, `lowest_price`/],
		['set snapshot provenance entry', /`sets\.played_tracks\[\]\.track_title`/],
		[
			'transfer snapshot matrix entry',
			/Session-storage Discogs transfer snapshot/
		],
		[
			'credential exclusion matrix classification',
			/`discogs_credentials`\s+\|\s+Operational\/secret/
		],
		['operational state matrix entry', /Quota buckets, request IDs, errors/],
		['non-Discogs enrichment boundary', /`audio_features`, `beatport_data`/],
		['six-hour display rule', /more than six hours older/i],
		['provider freshness boundary', /`updated_at` is not provider freshness/],
		['necessary-storage rule', /longer than necessary to provide/i],
		[
			'adjacent attribution text',
			/`Data provided by Discogs\.` directly next/i
		],
		['exact attribution link', /exact Discogs page containing that data/i],
		['nofollow prohibition', /Do not add\s+`nofollow`/i],
		[
			'archive Restricted exclusion',
			/exclude OAuth credentials[\s\S]+collection folders\/membership[\s\S]+image URLs/i
		],
		['archive Unknown exclusion', /exclude every Unknown field/i],
		[
			'archive secret restore exclusion',
			/never restore or reconnect a Discogs credential/i
		],
		['restored freshness boundary', /avoid displaying restored provider data/i],
		['provider approval unresolved', /\*\*Provider approval:\*\* unresolved/],
		['legal approval unresolved', /\*\*Legal approval:\*\* unresolved/],
		[
			'maintainer acceptance unresolved',
			/\*\*Maintainer acceptance:\*\* unresolved/
		],
		['archive STOP gate', /\*\*Schema\/archive gate:\*\* STOP/],
		[
			'accountless STOP gate',
			/\*\*Accountless Discogs production gate:\*\* STOP/
		]
	],
	[ACCOUNTLESS_DECISION_PATH]: [
		['unresolved STOP status', /\*\*Status:\*\* STOP - unresolved/],
		['evidence check date', /\*\*Evidence checked:\*\* 2026-07-22/],
		['API Terms source date', /Last updated 2025-05-27/],
		['official API Terms source', /360009334593-API-Terms-of-Use/],
		['official rate-limit source', /#page:home,header:home-rate-limiting/],
		['official OAuth source', /#page:authentication/],
		[
			'official collection source',
			/#page:user-collection,header:user-collection-collection-get/
		],
		['official image source', /#page:images/],
		[
			'official account settings source',
			/360007423833-How-Do-I-Change-My-Account-Settings/
		],
		[
			'official naming policy source',
			/360009207054-Application-Name-and-Description-Policy/
		],
		[
			'official collection CSV source',
			/360007331534-How-Does-The-Collection-Feature-Work/
		],
		['no Crate Guide account boundary', /no Crate Guide account/i],
		[
			'Discogs account requirement',
			/OAuth still requires[\s\S]+Discogs account/i
		],
		['local is not serverless', /optional integration is not serverless/i],
		['local is not backup', /It is not a library backup/],
		['device credential target', /Random device-scoped server credential/],
		['account-held alternative', /Existing account-held connection/],
		['browser-held rejection', /Browser-held consumer secret[\s\S]+Rejected/],
		['public username alternative', /Public-by-username folder-zero import/],
		['CSV alternative', /User-provided Discogs CSV/],
		['manual fallback', /Manual record entry/],
		[
			'high-entropy device proof',
			/high-entropy integration ID and device\s+proof/i
		],
		['keyed verifier digest', /keyed verifier digest server-side/i],
		['server-only provider secrets', /access secret server-side/i],
		[
			'separate integration storage',
			/separate same-origin integration database/i
		],
		['callback binding', /matching pending token and device proof/i],
		['10-minute pending lease', /maximum 10-minute lease/i],
		[
			'endpoint allowlist',
			/fixed operations[\s\S]+Never accept an\s+arbitrary host/i
		],
		['IP device global quotas', /source-IP, device, and global quotas/i],
		['credential expiry', /inactivity and absolute expiry/i],
		['XSS threat', /Same-origin XSS/],
		['enumeration threat', /enumerate integration IDs/i],
		['callback replay threat', /replay callbacks/i],
		['SSRF threat', /SSRF/],
		['orphan threat', /creating an orphan/i],
		[
			'redacted logs contract',
			/Redact[\s\S]+OAuth tokens[\s\S]+authorization headers/i
		],
		[
			'non-expiring provider token contract',
			/access credentials do not expire unless the user revokes/i
		],
		['lost-proof provider route', /Discogs Applications settings/i],
		['eligibility contract', /United States, are at least 18/i],
		['adjacent attribution text', /`Data provided by Discogs\.` directly/i],
		['exact attribution link', /exact Discogs page containing it/i],
		['server-visible privacy boundary', /`server-visible traffic`/],
		['provider approval unresolved', /\*\*Provider approval:\*\* unresolved/],
		['legal approval unresolved', /\*\*Legal approval:\*\* unresolved/],
		[
			'maintainer acceptance unresolved',
			/\*\*Maintainer acceptance:\*\* unresolved/
		],
		['accountless code STOP', /\*\*Accountless schema\/code:\*\* STOP/],
		['production STOP', /\*\*Production enablement:\*\* STOP/]
	]
})

const FORBIDDEN_APPROVAL_CLAIMS = [
	['provider approval claim', /\b(?:Discogs|the provider) has approved\b/i],
	[
		'legal approval claim',
		/\blegal approval (?:has been )?(?:received|granted)\b/i
	],
	[
		'maintainer approval claim',
		/\bmaintainer (?:approval|acceptance) (?:has been )?(?:received|granted|recorded)\b/i
	],
	['approved status claim', /\*\*Status:\*\* (?:APPROVED|ACCEPTED)/i]
]

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

		if (
			documentPath === 'docs/discogs-integration.md' ||
			documentPath === PORTABILITY_DECISION_PATH ||
			documentPath === ACCOUNTLESS_DECISION_PATH
		) {
			for (const [claimName, pattern] of FORBIDDEN_APPROVAL_CLAIMS) {
				if (pattern.test(contents)) {
					diagnostics.push(`${documentPath}: remove unsupported ${claimName}`)
				}
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
