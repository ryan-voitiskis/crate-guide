import {
	TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
	type TrackEnrichmentDraftLocalFileIdentity,
	type TrackEnrichmentDraftObservation
} from '~/types/trackEnrichmentDraft'
import { sanitizeTrackEnrichmentDraftRelativePath } from './trackEnrichmentDraftPrivacy'

export type TrackEnrichmentDraftReconnectCandidate = {
	/** Must already be the canonical, slash-separated relative picker path. */
	relativePath: string
	size: number
	lastModified: number
}

export type TrackEnrichmentDraftReconnectEntry =
	| {
			status: 'unchanged'
			storedSourceFingerprint: string
			storedIdentity: TrackEnrichmentDraftLocalFileIdentity
			selectedIdentity: TrackEnrichmentDraftLocalFileIdentity
	  }
	| {
			status: 'changed'
			storedSourceFingerprint: string
			storedIdentity: TrackEnrichmentDraftLocalFileIdentity
			selectedIdentity: TrackEnrichmentDraftLocalFileIdentity
	  }
	| {
			status: 'missing'
			storedSourceFingerprint: string
			storedIdentity: TrackEnrichmentDraftLocalFileIdentity
	  }
	| {
			status: 'new'
			selectedIdentity: TrackEnrichmentDraftLocalFileIdentity
	  }

export type TrackEnrichmentDraftReconnectResult = {
	entries: TrackEnrichmentDraftReconnectEntry[]
	summary: {
		unchanged: number
		changed: number
		missing: number
		new: number
	}
}

export class TrackEnrichmentDraftReconnectError extends Error {
	constructor(
		public readonly code:
			| 'non-local-observation'
			| 'invalid-stored-identity'
			| 'duplicate-stored-path'
			| 'invalid-candidate'
			| 'duplicate-selected-path'
	) {
		super(`Unable to reconcile track enrichment files: ${code}`)
		this.name = 'TrackEnrichmentDraftReconnectError'
	}
}

function hasValidFileNumbers(input: {
	size: number
	lastModified: number
}): boolean {
	return (
		Number.isSafeInteger(input.size) &&
		input.size >= 0 &&
		Number.isSafeInteger(input.lastModified) &&
		input.lastModified >= 0
	)
}

function cloneStoredIdentity(
	identity: TrackEnrichmentDraftLocalFileIdentity
): TrackEnrichmentDraftLocalFileIdentity {
	if (
		identity.version !== TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION ||
		sanitizeTrackEnrichmentDraftRelativePath(identity.relativePath) !==
			identity.relativePath ||
		!hasValidFileNumbers(identity)
	) {
		throw new TrackEnrichmentDraftReconnectError('invalid-stored-identity')
	}
	return {
		version: TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
		relativePath: identity.relativePath,
		size: identity.size,
		lastModified: identity.lastModified
	}
}

function sanitizeCandidate(
	candidate: unknown
): TrackEnrichmentDraftLocalFileIdentity {
	if (
		candidate === null ||
		typeof candidate !== 'object' ||
		Array.isArray(candidate) ||
		typeof (candidate as Record<string, unknown>).relativePath !== 'string' ||
		typeof (candidate as Record<string, unknown>).size !== 'number' ||
		typeof (candidate as Record<string, unknown>).lastModified !== 'number'
	) {
		throw new TrackEnrichmentDraftReconnectError('invalid-candidate')
	}
	const shapedCandidate = candidate as TrackEnrichmentDraftReconnectCandidate
	const relativePath = sanitizeTrackEnrichmentDraftRelativePath(
		shapedCandidate.relativePath
	)
	if (
		!relativePath ||
		relativePath !== shapedCandidate.relativePath ||
		!hasValidFileNumbers(shapedCandidate)
	) {
		throw new TrackEnrichmentDraftReconnectError('invalid-candidate')
	}
	return {
		version: TRACK_ENRICHMENT_DRAFT_LOCAL_IDENTITY_VERSION,
		relativePath,
		size: shapedCandidate.size,
		lastModified: shapedCandidate.lastModified
	}
}

/**
 * Reconciles a reselected folder against persisted local-audio identities.
 * Inputs may originate beside live File objects, but the result contains only
 * bounded plain-data identities and classifications.
 */
export function classifyTrackEnrichmentDraftReconnect(
	storedObservations: readonly TrackEnrichmentDraftObservation[],
	selectedCandidates: readonly TrackEnrichmentDraftReconnectCandidate[]
): TrackEnrichmentDraftReconnectResult {
	const stored = storedObservations
		.map((observation) => {
			if (observation.evidence.kind !== 'localAudio') {
				throw new TrackEnrichmentDraftReconnectError('non-local-observation')
			}
			return {
				ordinal: observation.ordinal,
				sourceFingerprint: observation.sourceFingerprint,
				identity: cloneStoredIdentity(observation.evidence.fileIdentity)
			}
		})
		.sort((left, right) => left.ordinal - right.ordinal)
	const storedByPath = new Map<string, (typeof stored)[number]>()
	for (const item of stored) {
		if (storedByPath.has(item.identity.relativePath)) {
			throw new TrackEnrichmentDraftReconnectError('duplicate-stored-path')
		}
		storedByPath.set(item.identity.relativePath, item)
	}

	const selected = selectedCandidates.map(sanitizeCandidate)
	const selectedByPath = new Map<
		string,
		TrackEnrichmentDraftLocalFileIdentity
	>()
	for (const identity of selected) {
		if (selectedByPath.has(identity.relativePath)) {
			throw new TrackEnrichmentDraftReconnectError('duplicate-selected-path')
		}
		selectedByPath.set(identity.relativePath, identity)
	}

	const entries: TrackEnrichmentDraftReconnectEntry[] = stored.map((item) => {
		const selectedIdentity = selectedByPath.get(item.identity.relativePath)
		if (!selectedIdentity) {
			return {
				status: 'missing',
				storedSourceFingerprint: item.sourceFingerprint,
				storedIdentity: item.identity
			}
		}
		selectedByPath.delete(item.identity.relativePath)
		const status =
			selectedIdentity.size === item.identity.size &&
			selectedIdentity.lastModified === item.identity.lastModified
				? 'unchanged'
				: 'changed'
		return {
			status,
			storedSourceFingerprint: item.sourceFingerprint,
			storedIdentity: item.identity,
			selectedIdentity
		}
	})

	const newIdentities = [...selectedByPath.values()].sort((left, right) =>
		left.relativePath < right.relativePath
			? -1
			: left.relativePath > right.relativePath
				? 1
				: 0
	)
	for (const identity of newIdentities) {
		entries.push({ status: 'new', selectedIdentity: identity })
	}

	const summary = { unchanged: 0, changed: 0, missing: 0, new: 0 }
	for (const entry of entries) summary[entry.status]++
	return { entries, summary }
}
