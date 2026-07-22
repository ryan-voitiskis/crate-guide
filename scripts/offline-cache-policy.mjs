import policy from '../shared/config/offlineCachePolicy.json' with { type: 'json' }

const SUPABASE_SERVICE_PATH =
	/(?:^|\/)\b(?:auth|functions|graphql|realtime|rest|storage)\/v1(?:\/|$)/i
const SOURCE_MAP_EXTENSION = '.map'

function deny(reason, detail) {
	return Object.freeze({
		cache: 'deny',
		detail,
		reason
	})
}

function allow(reason, detail) {
	return Object.freeze({
		cache: 'allow',
		detail,
		reason
	})
}

function normalizeOrigin(value) {
	try {
		const url = new URL(value)
		if (
			(url.protocol !== 'https:' && url.protocol !== 'http:') ||
			url.origin !== value
		)
			return null
		return url.origin
	} catch {
		return null
	}
}

function parseCandidateUrl(value, applicationOrigin) {
	if (typeof value !== 'string' || !value) return null
	try {
		return new URL(value, applicationOrigin)
	} catch {
		return null
	}
}

function hasPercentEncodedPath(value) {
	const pathAndOrigin = value.split(/[?#]/u, 1)[0]
	return /%[0-9a-f]{2}/iu.test(pathAndOrigin)
}

function hostMatchesSuffix(hostname, suffixes) {
	const normalized = hostname.toLowerCase().replace(/\.$/, '')
	return suffixes.some(
		(suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
	)
}

function pathMatchesPrefix(pathname, prefixes) {
	const normalized = pathname.toLowerCase()
	return prefixes.some((prefix) => {
		const expected = prefix.toLowerCase()
		if (expected.endsWith('/')) return normalized.startsWith(expected)
		return normalized === expected || normalized.startsWith(`${expected}/`)
	})
}

function pathHasExtension(pathname, extensions) {
	const normalized = pathname.toLowerCase()
	return extensions.some((extension) => normalized.endsWith(extension))
}

function getHeader(headers, name) {
	if (!headers) return null
	if (typeof headers.get === 'function') return headers.get(name)
	const entry = Object.entries(headers).find(
		([headerName]) => headerName.toLowerCase() === name.toLowerCase()
	)
	if (!entry) return null
	return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1])
}

function parseCacheControlDirectives(value) {
	const directives = []
	let current = ''
	let escaped = false
	let quoted = false

	for (const character of value) {
		if (character === '"' && !escaped) quoted = !quoted
		if (character === ',' && !quoted) {
			directives.push(current)
			current = ''
			escaped = false
			continue
		}
		current += character
		escaped = character === '\\' && !escaped
		if (character !== '\\') escaped = false
	}
	directives.push(current)

	return directives
		.map((directive) => directive.trim().split('=', 1)[0].trim().toLowerCase())
		.filter(Boolean)
}

function isHashedToken(value, expectedLength) {
	return value.length === expectedLength && /^[A-Za-z0-9_-]+$/.test(value)
}

function hasBuildHash(filename, expectedLength) {
	const extensionIndex = filename.lastIndexOf('.')
	if (extensionIndex <= 0) return false
	const basename = filename.slice(0, extensionIndex)
	const dotTokens = basename.split('.')
	const hyphenSuffix = basename.slice(basename.lastIndexOf('-') + 1)
	return [...dotTokens, hyphenSuffix].some((token) =>
		isHashedToken(token, expectedLength)
	)
}

function isImmutableBuildAsset(url, cachePolicy) {
	const prefix = cachePolicy.immutableBuild.pathPrefix
	if (!url.pathname.startsWith(prefix)) return false
	const relativePath = url.pathname.slice(prefix.length)
	if (!relativePath || relativePath.includes('/')) return false
	if (!pathHasExtension(relativePath, cachePolicy.immutableBuild.extensions))
		return false
	return hasBuildHash(relativePath, cachePolicy.immutableBuild.hashTokenLength)
}

function validateStringList(value, path, allowEmptyEntry = false) {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some(
			(entry) =>
				typeof entry !== 'string' || (!allowEmptyEntry && entry.length === 0)
		)
	) {
		throw new TypeError(`${path} must be a non-empty string array.`)
	}
}

function isScopedAbsolutePathPrefix(value) {
	if (
		typeof value !== 'string' ||
		value === '/' ||
		!value.startsWith('/') ||
		!value.endsWith('/') ||
		/[?#%\\]/u.test(value)
	)
		return false

	const segments = value.slice(1, -1).split('/')
	return (
		segments.length > 0 &&
		segments.every(
			(segment) =>
				segment !== '' &&
				segment !== '.' &&
				segment !== '..' &&
				/^[A-Za-z0-9._~-]+$/u.test(segment)
		)
	)
}

function hasSafeExtensionTokens(extensions) {
	return extensions.every((extension) => /^\.[a-z0-9]+$/u.test(extension))
}

export function assertOfflineCachePolicy(cachePolicy) {
	if (!cachePolicy || cachePolicy.version !== 1) {
		throw new TypeError('Offline cache policy version 1 is required.')
	}
	if (
		!cachePolicy.immutableBuild ||
		!isScopedAbsolutePathPrefix(cachePolicy.immutableBuild.pathPrefix) ||
		!Number.isSafeInteger(cachePolicy.immutableBuild.hashTokenLength) ||
		cachePolicy.immutableBuild.hashTokenLength < 8 ||
		cachePolicy.immutableBuild.hashTokenLength > 64
	) {
		throw new TypeError(
			'immutableBuild.pathPrefix and hashTokenLength are required.'
		)
	}
	for (const [path, value] of [
		['immutableBuild.extensions', cachePolicy.immutableBuild.extensions],
		['publicStaticPaths', cachePolicy.publicStaticPaths],
		['allowedDestinations', cachePolicy.allowedDestinations],
		['providerHostSuffixes', cachePolicy.providerHostSuffixes],
		['supabaseHostSuffixes', cachePolicy.supabaseHostSuffixes],
		['authPathPrefixes', cachePolicy.authPathPrefixes],
		['dynamicPathPrefixes', cachePolicy.dynamicPathPrefixes],
		['archiveExtensions', cachePolicy.archiveExtensions],
		['downloadPathPrefixes', cachePolicy.downloadPathPrefixes],
		['sensitiveQueryKeys', cachePolicy.sensitiveQueryKeys]
	]) {
		validateStringList(value, path, path === 'allowedDestinations')
	}
	if (!hasSafeExtensionTokens(cachePolicy.immutableBuild.extensions)) {
		throw new TypeError(
			'immutableBuild.extensions must contain dot-prefixed lowercase tokens.'
		)
	}
	return cachePolicy
}

assertOfflineCachePolicy(policy)

/**
 * Classify one future precache/runtime-cache candidate without performing I/O.
 * Only immutable, first-party static assets are allowed. Every other request is
 * an explicit deny so a later manifest auditor can fail closed.
 */
export function classifyOfflineCacheCandidate(input, cachePolicy = policy) {
	assertOfflineCachePolicy(cachePolicy)
	if (!input || typeof input !== 'object') return deny('invalid-input')

	const applicationOrigin = normalizeOrigin(input.applicationOrigin)
	if (!applicationOrigin) return deny('invalid-application-origin')
	const url = parseCandidateUrl(input.url, applicationOrigin)
	if (!url) return deny('invalid-url')
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return deny('unsupported-scheme', url.protocol)
	}
	if (url.username || url.password) return deny('url-credentials')
	if (hasPercentEncodedPath(input.url)) return deny('encoded-path')

	const method = String(input.method ?? 'GET').toUpperCase()
	if (method !== 'GET') return deny('unsafe-method', method)
	if (
		input.hasAuthorization === true ||
		getHeader(input.requestHeaders, 'authorization')
	) {
		return deny('authorization-bearing-request')
	}
	if (input.containsUserData === true) return deny('user-data')
	if (input.isDownload === true) return deny('archive-or-download')
	if (
		input.responseStatus !== undefined &&
		(!Number.isSafeInteger(input.responseStatus) ||
			input.responseStatus < 200 ||
			input.responseStatus >= 300)
	) {
		return deny('non-success-response', String(input.responseStatus))
	}

	const contentDisposition = getHeader(
		input.responseHeaders,
		'content-disposition'
	)
	if (
		contentDisposition &&
		/(?:^|;)\s*attachment(?:;|$)/i.test(contentDisposition)
	) {
		return deny('downloadable-response')
	}
	if (getHeader(input.responseHeaders, 'set-cookie')) {
		return deny('personalized-response', 'set-cookie')
	}
	const cacheControl = getHeader(input.responseHeaders, 'cache-control')
	if (
		cacheControl &&
		parseCacheControlDirectives(cacheControl).some((directive) =>
			['private', 'no-store'].includes(directive)
		)
	) {
		return deny('private-response', cacheControl)
	}

	if (url.hash) return deny('url-fragment')
	const sensitiveQueryKeys = new Set(
		cachePolicy.sensitiveQueryKeys.map((key) => key.toLowerCase())
	)
	for (const key of url.searchParams.keys()) {
		if (sensitiveQueryKeys.has(key.toLowerCase())) {
			return deny('sensitive-query', key.toLowerCase())
		}
	}
	if (url.search) return deny('dynamic-query')

	if (SUPABASE_SERVICE_PATH.test(url.pathname)) {
		return deny('supabase-service', url.pathname)
	}
	if (pathMatchesPrefix(url.pathname, cachePolicy.authPathPrefixes)) {
		return deny('auth-or-oauth-route', url.pathname)
	}
	if (
		pathMatchesPrefix(url.pathname, cachePolicy.downloadPathPrefixes) ||
		pathHasExtension(url.pathname, cachePolicy.archiveExtensions)
	) {
		return deny('archive-or-download', url.pathname)
	}

	if (hostMatchesSuffix(url.hostname, cachePolicy.supabaseHostSuffixes)) {
		return deny('supabase-origin', url.hostname)
	}
	if (hostMatchesSuffix(url.hostname, cachePolicy.providerHostSuffixes)) {
		return deny('provider-origin', url.hostname)
	}
	if (url.origin !== applicationOrigin) {
		return deny(
			input.destination === 'image' ? 'external-image' : 'external-origin',
			url.origin
		)
	}

	const destination = String(input.destination ?? '')
	if (!cachePolicy.allowedDestinations.includes(destination)) {
		return deny('unsupported-destination', destination)
	}
	if (input.mode === 'navigate' || destination === 'document') {
		return deny('navigation-or-document')
	}
	if (pathMatchesPrefix(url.pathname, cachePolicy.dynamicPathPrefixes)) {
		return deny('dynamic-first-party-route', url.pathname)
	}
	if (url.pathname.toLowerCase().endsWith(SOURCE_MAP_EXTENSION)) {
		return deny('source-map', url.pathname)
	}

	if (cachePolicy.publicStaticPaths.includes(url.pathname)) {
		return allow('public-static-asset', url.pathname)
	}
	if (url.pathname.startsWith(cachePolicy.immutableBuild.pathPrefix)) {
		return isImmutableBuildAsset(url, cachePolicy)
			? allow('immutable-build-asset', url.pathname)
			: deny('unhashed-or-unsupported-build-asset', url.pathname)
	}
	return deny('unknown-first-party-request', url.pathname)
}

export function assertOfflineCacheCandidate(input, cachePolicy = policy) {
	const result = classifyOfflineCacheCandidate(input, cachePolicy)
	if (result.cache !== 'allow') {
		throw new Error(
			`Offline cache candidate rejected: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`
		)
	}
	return result
}

export const offlineCachePolicy = policy
