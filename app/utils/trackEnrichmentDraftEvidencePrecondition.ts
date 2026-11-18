import { TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION } from '~/types/trackEnrichmentDraft'
import { sha256TrackEnrichmentDraftValue } from './trackEnrichmentDraftFingerprint'
import { decodeTrackEvidence } from './trackEvidenceCodec'

type CanonicalJson =
	| boolean
	| number
	| string
	| null
	| CanonicalJson[]
	| { [key: string]: CanonicalJson }

function canonicalize(value: CanonicalJson): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(',')}]`
	}
	return `{${Object.entries(value)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
		.join(',')}}`
}

// Persisted track Evidence objects are replaced, never mutated, so a digest is
// stable for the lifetime of the object. Shared by draft projection (autosave)
// and draft hydration (resume).
const fingerprintByEvidenceObject = new WeakMap<
	object,
	Promise<string | null>
>()

/**
 * Produces a bounded digest of the track's current persisted Evidence read
 * model. Invalid, private, or oversized Evidence has no trustworthy
 * fingerprint and therefore fails resume closed as changed.
 */
export function createTrackEnrichmentCurrentEvidenceFingerprint(
	value: unknown
): Promise<string | null> {
	if (value === null || typeof value !== 'object') {
		return computeCurrentEvidenceFingerprint(value)
	}
	const cached = fingerprintByEvidenceObject.get(value)
	if (cached) return cached
	const fingerprint = computeCurrentEvidenceFingerprint(value)
	fingerprintByEvidenceObject.set(value, fingerprint)
	fingerprint.catch(() => {
		if (fingerprintByEvidenceObject.get(value) === fingerprint) {
			fingerprintByEvidenceObject.delete(value)
		}
	})
	return fingerprint
}

async function computeCurrentEvidenceFingerprint(
	value: unknown
): Promise<string | null> {
	let evidence: CanonicalJson
	if (value === null) {
		evidence = null
	} else {
		const decoded = decodeTrackEvidence(value)
		if (!decoded.ok) return null
		evidence = decoded.evidence as CanonicalJson
	}

	return sha256TrackEnrichmentDraftValue(
		`${TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION}\n${canonicalize(evidence)}`
	)
}
