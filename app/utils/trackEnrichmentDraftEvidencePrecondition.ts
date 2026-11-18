import { TRACK_ENRICHMENT_DRAFT_EVIDENCE_PRECONDITION_VERSION } from '~/types/trackEnrichmentDraft'
import { canonicalJson } from './canonicalJson'
import { sha256TrackEnrichmentDraftValue } from './trackEnrichmentDraftFingerprint'
import { decodeTrackEvidence } from './trackEvidenceCodec'

type CanonicalJson =
	| boolean
	| number
	| string
	| null
	| CanonicalJson[]
	| { [key: string]: CanonicalJson }

// The digest is persisted in draft preconditions; 'token' keeps its
// historical encoding byte-identical.
function canonicalize(value: CanonicalJson): string {
	return canonicalJson(value, { onUndefined: 'token' })
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
