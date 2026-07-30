import type {
	TrackEvidenceSourceKey,
	TrackEvidenceSourceMatch
} from '../../shared/types/audioFeatures'

export type TrackEvidenceObservationIdentityInput = {
	observedAt: string
	match: TrackEvidenceSourceMatch
	data: unknown
}

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		const serialized = JSON.stringify(value)
		if (serialized === undefined) {
			throw new TypeError('Track Evidence identity input must be JSON.')
		}
		return serialized
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalize(item)).join(',')}]`
	}
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
		.join(',')}}`
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
	const digest = await subtle.digest(
		'SHA-256',
		new TextEncoder().encode(canonical)
	)
	const hex = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
	return `te2:${source}:${hex}`
}
