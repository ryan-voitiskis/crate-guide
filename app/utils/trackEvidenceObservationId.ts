import type {
	TrackEvidenceSourceKey,
	TrackEvidenceSourceMatch
} from '../../shared/types/audioFeatures'
import {
	CanonicalJsonUndefinedError,
	canonicalJson,
	sha256Hex
} from './canonicalJson'

export type TrackEvidenceObservationIdentityInput = {
	observedAt: string
	match: TrackEvidenceSourceMatch
	data: unknown
}

function canonicalize(value: unknown): string {
	try {
		return canonicalJson(value, { onUndefined: 'throw' })
	} catch (error) {
		if (error instanceof CanonicalJsonUndefinedError) {
			throw new TypeError('Track Evidence identity input must be JSON.', {
				cause: error
			})
		}
		throw error
	}
}

export async function createTrackEvidenceObservationId(
	source: TrackEvidenceSourceKey,
	input: TrackEvidenceObservationIdentityInput
): Promise<string> {
	const subtle = globalThis.crypto?.subtle
	if (!subtle) {
		throw new Error('Secure Track Evidence identity is unavailable.')
	}
	const canonical = canonicalize({ source, ...input })
	return `te2:${source}:${await sha256Hex(canonical)}`
}
