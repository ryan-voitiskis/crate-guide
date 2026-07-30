export const ENFORCED_CONTENT_SECURITY_POLICY =
	"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

export const PERMISSIONS_POLICY = [
	'browsing-topics=()',
	'camera=()',
	'geolocation=()',
	'microphone=()',
	'payment=()',
	'usb=()'
].join(', ')

export const HTML_SECURITY_HEADERS = Object.freeze({
	'content-security-policy': ENFORCED_CONTENT_SECURITY_POLICY,
	'permissions-policy': PERMISSIONS_POLICY,
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY'
})

export const HTTPS_SECURITY_HEADERS = Object.freeze({
	'strict-transport-security': 'max-age=86400'
})

const EXECUTABLE_SCRIPT_TYPES = new Set([
	'',
	'application/ecmascript',
	'application/javascript',
	'importmap',
	'module',
	'text/ecmascript',
	'text/javascript'
])

const SHA256_SOURCE_PATTERN = /^'sha256-[A-Za-z0-9+/]{43}='$/

function parseAttribute(attributes: string, name: string): string | null {
	const pattern =
		'(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))'
	const match = attributes.match(new RegExp(pattern, 'i'))
	return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null
}

export function extractExecutableInlineScripts(html: string): string[] {
	const scripts: string[] = []
	const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi

	for (const match of html.matchAll(scriptPattern)) {
		const attributes = match[1] ?? ''
		if (parseAttribute(attributes, 'src') !== null) continue

		const type = (parseAttribute(attributes, 'type') ?? '').trim().toLowerCase()
		if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue

		scripts.push(match[2] ?? '')
	}

	return scripts
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

export async function createInlineScriptHashes(
	html: string
): Promise<string[]> {
	const hashes = await Promise.all(
		extractExecutableInlineScripts(html).map(async (script) => {
			const digest = await crypto.subtle.digest(
				'SHA-256',
				new TextEncoder().encode(script)
			)
			return "'sha256-" + encodeBase64(new Uint8Array(digest)) + "'"
		})
	)

	return [...new Set(hashes)]
}

function websocketOrigin(origin: string): string {
	const url = new URL(origin)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	return url.origin
}

function assertOrigin(origin: string): string {
	const parsed = new URL(origin)
	if (
		parsed.origin !== origin ||
		(parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
	) {
		throw new Error('Browser security policy requires an HTTP(S) origin')
	}
	return parsed.origin
}

export function buildReportOnlyContentSecurityPolicy(options: {
	supabaseOrigin?: string
	inlineScriptHashes: string[]
}): string {
	const supabaseOrigin = options.supabaseOrigin
		? assertOrigin(options.supabaseOrigin)
		: null
	if (
		options.inlineScriptHashes.length === 0 ||
		options.inlineScriptHashes.some((hash) => !SHA256_SOURCE_PATTERN.test(hash))
	) {
		throw new Error(
			'Browser security policy requires valid inline script hashes'
		)
	}

	const directives = [
		['default-src', "'self'"],
		['base-uri', "'self'"],
		['object-src', "'none'"],
		['frame-ancestors', "'none'"],
		[
			'script-src',
			"'self'",
			"'wasm-unsafe-eval'",
			...options.inlineScriptHashes
		],
		['script-src-attr', "'none'"],
		['style-src', "'self'"],
		// Vue's bounded visual controls use runtime style attributes for positions
		// and user-selected colours; this does not permit inline style elements.
		['style-src-attr', "'unsafe-inline'"],
		[
			'img-src',
			"'self'",
			'blob:',
			'https:',
			'https://i.discogs.com',
			...(supabaseOrigin ? [supabaseOrigin] : [])
		],
		['font-src', "'self'"],
		[
			'connect-src',
			"'self'",
			...(supabaseOrigin
				? [supabaseOrigin, websocketOrigin(supabaseOrigin)]
				: [])
		],
		['worker-src', "'self'"],
		['media-src', "'self'", 'blob:'],
		['manifest-src', "'self'"],
		['frame-src', "'none'"],
		['form-action', "'self'"]
	]

	return directives.map((directive) => directive.join(' ')).join('; ')
}

export async function createBrowserSecurityHeaders(options: {
	contentType?: string | null
	htmlBody?: string | null
	isHttps: boolean
	supabaseOrigin?: string
}): Promise<Record<string, string>> {
	const headers: Record<string, string> = {}
	if (options.isHttps) Object.assign(headers, HTTPS_SECURITY_HEADERS)

	if (!options.contentType?.toLowerCase().startsWith('text/html'))
		return headers

	const inlineScriptHashes = await createInlineScriptHashes(
		options.htmlBody ?? ''
	)
	Object.assign(headers, HTML_SECURITY_HEADERS, {
		'content-security-policy-report-only': buildReportOnlyContentSecurityPolicy(
			{
				inlineScriptHashes,
				supabaseOrigin: options.supabaseOrigin
			}
		)
	})
	return headers
}
