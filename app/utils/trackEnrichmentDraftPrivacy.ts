import {
	TRACK_ENRICHMENT_DRAFT_MAX_DECISIONS,
	TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS,
	TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES,
	TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES,
	TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION
} from '~/types/trackEnrichmentDraft'

export type TrackEnrichmentDraftPrivacyIssue = {
	code:
		| 'absolute-path'
		| 'cyclic-value'
		| 'forbidden-field'
		| 'non-json-value'
		| 'scan-limit'
	path: string
}

const MAX_PRIVACY_ISSUES = 100
const MAX_SCAN_DEPTH = 64
// This is an explicit upper bound for every node in the largest schema-valid
// v2 shape, not an arbitrary traversal allowance: 640 nodes per observation
// includes bounded source Evidence (tag genres, analyzer estimates and both
// warning collections), 22 covers the largest current decision (including
// evidence-only bindings), and 10 covers an outcome. The byte budget below
// remains the tighter bound for realistic drafts.
const MAX_SCAN_NODES =
	64 +
	TRACK_ENRICHMENT_DRAFT_MAX_OBSERVATIONS *
		(512 + TRACK_ENRICHMENT_DRAFT_MAX_WARNINGS_PER_OBSERVATION) +
	TRACK_ENRICHMENT_DRAFT_MAX_DECISIONS * 22 +
	TRACK_ENRICHMENT_DRAFT_MAX_OUTCOMES * 10
const MAX_RELATIVE_PATH_BYTES = 4096
const MAX_RELATIVE_PATH_SEGMENTS = 64
const MAX_RELATIVE_PATH_SEGMENT_BYTES = 255
const CONTROL_CHARACTERS = /\p{Cc}/u
const TEXT_ENCODER = new TextEncoder()

const FORBIDDEN_NORMALIZED_FIELDS = new Set([
	'audio',
	'audiobytes',
	'audiobuffer',
	'binary',
	'blob',
	'bloburl',
	'bytes',
	'dialog',
	'directoryhandle',
	'file',
	'filehandle',
	'inflight',
	'isapplying',
	'location',
	'objecturl',
	'parseroutput',
	'parserresult',
	'path',
	'promise',
	'rawaudio',
	'rawxml',
	'record',
	'records',
	'row',
	'rows',
	'track',
	'tracks',
	'worker',
	'xml',
	'xmltext'
])

function normalizeFieldName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isForbiddenField(value: string): boolean {
	const normalized = normalizeFieldName(value)
	return (
		FORBIDDEN_NORMALIZED_FIELDS.has(normalized) ||
		/(?:file|directory)handle$/.test(normalized) ||
		/(?:object|blob)url$/.test(normalized) ||
		/^raw(?:xml|audio|bytes|content)/.test(normalized)
	)
}

function decodePathLikeValue(value: string): string {
	let decoded = value
	for (let attempts = 0; attempts < 2; attempts++) {
		try {
			const next = decodeURIComponent(decoded)
			if (next === decoded) break
			decoded = next
		} catch {
			break
		}
	}
	return decoded
}

function containsAbsoluteLocalReference(value: string): boolean {
	const decoded = decodePathLikeValue(value).trim()
	if (!decoded) return false

	if (
		/^(?:[a-z]:[\\/]|\\\\|\/\/|\/|~[^\\/]*[\\/]|[a-z][a-z0-9+.-]*:[\\/]|(?:file|blob|data):)/i.test(
			decoded
		)
	) {
		return true
	}

	return (
		/(?:^|[\s"'(:=])(?:[a-z]:[\\/]|\\\\[^\\]|\/\/|\/(?:[^/\s]+\/)+[^/\s]+|[a-z][a-z0-9+.-]*:[\\/]|(?:file|blob|data):)/i.test(
			decoded
		) || false
	)
}

export function containsUnsafeTrackEnrichmentDraftPath(value: string): boolean {
	return containsAbsoluteLocalReference(value)
}

function escapeJsonPointerSegment(value: string): string {
	return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function isPlainObject(value: object): boolean {
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function encodedBytes(value: string): number {
	return TEXT_ENCODER.encode(value).byteLength
}

/** Returns a lower bound for this value's bytes in JSON serialization. */
function minimumJsonBytes(value: unknown): number {
	if (typeof value === 'string') return encodedBytes(JSON.stringify(value))
	if (value === null) return 4
	if (typeof value === 'boolean') return value ? 4 : 5
	if (typeof value === 'number' && Number.isFinite(value)) {
		return encodedBytes(JSON.stringify(value))
	}
	// A container has at least two bytes, but charging one keeps the estimate a
	// strict lower bound even for invalid runtime values handled by the audit.
	return 1
}

/**
 * Audits any candidate before schema parsing or forward-intent normalization.
 * It reports locations only, so rejected private values are never reflected in
 * logs or UI errors.
 */
export function inspectTrackEnrichmentDraftPrivacy(
	value: unknown
): TrackEnrichmentDraftPrivacyIssue[] {
	const issues: TrackEnrichmentDraftPrivacyIssue[] = []
	const ancestors = new WeakSet<object>()
	let visitedNodes = 0
	let minimumVisitedBytes = 0
	let scanLimitReached = false

	function addIssue(
		code: TrackEnrichmentDraftPrivacyIssue['code'],
		path: string
	) {
		if (issues.length >= MAX_PRIVACY_ISSUES) return
		issues.push({ code, path })
	}

	function visit(current: unknown, path: string, depth: number) {
		if (issues.length >= MAX_PRIVACY_ISSUES || scanLimitReached) return
		visitedNodes++
		minimumVisitedBytes += minimumJsonBytes(current)
		if (
			visitedNodes > MAX_SCAN_NODES ||
			minimumVisitedBytes > TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES ||
			depth > MAX_SCAN_DEPTH
		) {
			scanLimitReached = true
			addIssue('scan-limit', path)
			return
		}

		if (typeof current === 'string') {
			if (containsAbsoluteLocalReference(current)) {
				addIssue('absolute-path', path)
			}
			return
		}
		if (
			current === null ||
			typeof current === 'boolean' ||
			(typeof current === 'number' && Number.isFinite(current))
		) {
			return
		}
		if (typeof current !== 'object') {
			addIssue('non-json-value', path)
			return
		}

		if (ancestors.has(current)) {
			addIssue('cyclic-value', path)
			return
		}
		if (!Array.isArray(current) && !isPlainObject(current)) {
			addIssue('non-json-value', path)
			return
		}

		ancestors.add(current)
		if (Array.isArray(current)) {
			for (let index = 0; index < current.length; index++) {
				visit(current[index], `${path}/${index}`, depth + 1)
			}
		} else {
			for (const [key, nested] of Object.entries(current)) {
				const nestedPath = `${path}/${escapeJsonPointerSegment(key)}`
				// JSON must also serialize the quoted key and a colon. Commas and the
				// closing brace are intentionally omitted to preserve a lower bound.
				minimumVisitedBytes += encodedBytes(JSON.stringify(key)) + 1
				if (minimumVisitedBytes > TRACK_ENRICHMENT_DRAFT_MAX_SERIALIZED_BYTES) {
					scanLimitReached = true
					addIssue('scan-limit', nestedPath)
					break
				}
				if (isForbiddenField(key)) {
					addIssue('forbidden-field', nestedPath)
					continue
				}
				visit(nested, nestedPath, depth + 1)
			}
		}
		ancestors.delete(current)
	}

	visit(value, '', 0)
	return issues
}

function normalizePathInput(input: string): {
	absolute: boolean
	unc: boolean
	value: string
} | null {
	if (!input.trim() || CONTROL_CHARACTERS.test(input)) return null
	let value = decodePathLikeValue(input.trim()).normalize('NFKC')
	let absolute = /^(?:[a-z]:[\\/]|\\\\|\/\/|\/|~[\\/])/i.test(value)
	let unc = /^(?:\\\\|\/\/)/.test(value)
	const uriScheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
	const isWindowsDrive = /^[a-z]:[\\/]/i.test(value)
	if (uriScheme && uriScheme !== 'file' && !isWindowsDrive) return null

	if (/^file:/i.test(value)) {
		try {
			const url = new URL(value)
			if (url.protocol !== 'file:') return null
			const hostname = url.hostname
			value = decodePathLikeValue(url.pathname)
			if (hostname && hostname.toLowerCase() !== 'localhost') {
				value = `//${hostname}${value}`
				unc = true
			}
			absolute = true
		} catch {
			return null
		}
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !isWindowsDrive) return null
	if (/^[a-z]:[^\\/]/i.test(value)) return null
	return { absolute, unc, value }
}

/**
 * Converts supported absolute path forms to a bounded, non-parent relative
 * hint. This is a privacy boundary, not a path resolver.
 */
export function sanitizeTrackEnrichmentDraftRelativePath(
	input: string
): string | null {
	const normalized = normalizePathInput(input)
	if (!normalized) return null

	let value = normalized.value.replace(/\\/g, '/')
	let segments = value.split('/').filter(Boolean)
	if (/^[a-z]:$/i.test(segments[0] ?? '')) {
		segments = segments.slice(1)
		normalized.absolute = true
	}

	if (segments.some((segment) => segment === '..')) return null
	segments = segments.filter((segment) => segment !== '.')

	if (normalized.unc) {
		segments = segments.slice(2)
	} else if (
		normalized.absolute &&
		['users', 'home'].includes(segments[0]?.toLowerCase() ?? '')
	) {
		segments = segments.slice(2)
	} else if (
		normalized.absolute &&
		['volumes', 'mnt', 'media'].includes(segments[0]?.toLowerCase() ?? '')
	) {
		segments = segments.slice(2)
	} else if (normalized.absolute && segments.length > 3) {
		segments = segments.slice(-3)
	}

	if (
		segments.length === 0 ||
		segments.length > MAX_RELATIVE_PATH_SEGMENTS ||
		segments.some(
			(segment) =>
				!segment ||
				CONTROL_CHARACTERS.test(segment) ||
				new TextEncoder().encode(segment).byteLength >
					MAX_RELATIVE_PATH_SEGMENT_BYTES
		)
	) {
		return null
	}

	value = segments.join('/')
	if (
		new TextEncoder().encode(value).byteLength > MAX_RELATIVE_PATH_BYTES ||
		containsAbsoluteLocalReference(value)
	) {
		return null
	}
	return value
}

export function sanitizeTrackEnrichmentDraftLabel(
	input: string
): string | null {
	const path = sanitizeTrackEnrichmentDraftRelativePath(input)
	return path?.split('/').at(-1)?.slice(0, 255) || null
}
