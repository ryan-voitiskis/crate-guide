import type { ExternalRecordWithTracksInput } from '~~/shared/types/library'
import {
	decodeLibraryRecord,
	decodeLibraryTrack
} from './browser/browserLibraryCodecs'

const VALIDATION_RECORD_ID = 'external-import-record'

/** Applies the same strict domain codec before any adapter starts persistence. */
export function validateExternalRecordWithTracksInput(
	input: ExternalRecordWithTracksInput
): ExternalRecordWithTracksInput {
	if (
		input.record.discogs_id === null ||
		!Number.isSafeInteger(input.record.discogs_id) ||
		input.record.discogs_id <= 0 ||
		input.record.discogs_id > 2_147_483_647
	) {
		throw new Error(
			'An external import requires a positive Discogs release ID.'
		)
	}

	const {
		id: _id,
		created_at: _createdAt,
		updated_at: _updatedAt,
		...record
	} = decodeLibraryRecord({
		...input.record,
		id: VALIDATION_RECORD_ID,
		created_at: null,
		updated_at: null
	})
	if (record.cover.kind !== 'none' && record.cover.kind !== 'external') {
		throw new Error('External imports cannot contain managed cover references.')
	}
	const tracks = input.tracks.map((track, index) => {
		const {
			id: _trackId,
			record_id: _recordId,
			beatport_data: _beatportData,
			audio_features: _audioFeatures,
			created_at: _trackCreatedAt,
			updated_at: _trackUpdatedAt,
			...validated
		} = decodeLibraryTrack({
			...track,
			id: `external-import-track-${index}`,
			record_id: VALIDATION_RECORD_ID,
			beatport_data: null,
			audio_features: null,
			created_at: null,
			updated_at: null
		})
		return validated
	})

	return { record: { ...record, cover: record.cover }, tracks }
}
