import type { Track } from './supabase'

export type TrackUpdateInput = Partial<
	Omit<Track, 'id' | 'record_id' | 'created_at' | 'updated_at'>
>

export type TrackUpdatePreconditions = {
	bpmMustBeNull?: boolean
	keyModeMustBeNull?: boolean
}

export type TrackEnrichmentUpdateInput = Pick<
	TrackUpdateInput,
	'bpm' | 'key' | 'mode' | 'audio_features'
>

export type TrackBatchUpdate = {
	id: string
	expectedUpdatedAt: string
	updates: TrackEnrichmentUpdateInput
	preconditions?: TrackUpdatePreconditions
}

export type TrackBatchOperationIdentity = {
	operationId: string
	ordinal: number
	requestHash: string
}

export type TrackBatchIssueCode =
	| 'account_replaced'
	| 'duplicate_track_id'
	| 'invalid_audio_features'
	| 'invalid_item'
	| 'invalid_response'
	| 'not_found'
	| 'prior_chunk_unknown'
	| 'receipt_capacity'
	| 'request_unknown'
	| 'stale_revision'
	| 'update_rejected'

export type TrackBatchIssue = {
	code: TrackBatchIssueCode
	message: string
}

type TrackBatchUpdateResultBase = {
	id: string
	operation: TrackBatchOperationIdentity | null
}

export type TrackBatchUpdateResult =
	| (TrackBatchUpdateResultBase & {
			status: 'updated'
			success: true
			track: Track
			issue: null
			error: null
	  })
	| (TrackBatchUpdateResultBase & {
			status: 'stale' | 'not_found' | 'invalid' | 'unknown' | 'unattempted'
			success: false
			track: null
			issue: TrackBatchIssue
			error: string
	  })

export type TrackBatchUpdateOutcome = {
	results: TrackBatchUpdateResult[]
	cancelled: boolean
	requiresReview: boolean
}
