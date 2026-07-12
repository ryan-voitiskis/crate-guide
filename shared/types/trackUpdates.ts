import type { Track } from './supabase'

export type TrackUpdateInput = Partial<
	Omit<Track, 'id' | 'record_id' | 'created_at' | 'updated_at'>
>

export type TrackUpdatePreconditions = {
	bpmMustBeNull?: boolean
	keyModeMustBeNull?: boolean
}

export type TrackBatchUpdate = {
	id: string
	updates: TrackUpdateInput
	preconditions?: TrackUpdatePreconditions
}

export type TrackBatchUpdateResult = {
	id: string
	success: boolean
	track: Track | null
	error: string | null
}
