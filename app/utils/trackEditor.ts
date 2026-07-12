import { z } from 'zod'
import type { DiscogsArtistDb } from '../../shared/types/discogs'
import { isDiscogsArtistDb } from '../../shared/types/discogs'
import type { Track } from '../../shared/types/supabase'
import { mmssToMs, msToMMSS, parseBPM } from './formatting'
import { createKeyComposite, parseKeyComposite } from './keyFunctions'
import {
	BPM_ERROR_MESSAGE,
	DURATION_ERROR_MESSAGE,
	KEY_ERROR_MESSAGE,
	POSITION_ERROR_MESSAGE,
	isValidBPM,
	isValidDurationFormat,
	isValidKeyComposite,
	isValidTrackPosition
} from './track-validation'

export const trackEditorSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	position: z.string().refine(isValidTrackPosition, POSITION_ERROR_MESSAGE),
	duration: z.string().refine(isValidDurationFormat, DURATION_ERROR_MESSAGE),
	bpm: z.string().refine(isValidBPM, BPM_ERROR_MESSAGE),
	keyComposite: z.string().refine(isValidKeyComposite, KEY_ERROR_MESSAGE),
	genres: z.array(z.string()),
	rpm: z.union([z.number(), z.null()]),
	playable: z.boolean(),
	time_signature_upper: z.union([z.number(), z.null()]),
	time_signature_lower: z.union([z.number(), z.null()])
})

export type TrackEditorFormValues = z.infer<typeof trackEditorSchema>

export type TrackEditorPayload = Pick<
	Track,
	| 'title'
	| 'artists'
	| 'extraartists'
	| 'position'
	| 'duration'
	| 'bpm'
	| 'rpm'
	| 'key'
	| 'mode'
	| 'genres'
	| 'time_signature_upper'
	| 'time_signature_lower'
	| 'playable'
>

export function createTrackEditorInitialValues(): TrackEditorFormValues {
	return {
		title: '',
		position: '',
		duration: '',
		bpm: '',
		keyComposite: 'none',
		genres: [],
		rpm: null,
		playable: true,
		time_signature_upper: null,
		time_signature_lower: null
	}
}

export function trackToEditorValues(track: Track): TrackEditorFormValues {
	return {
		title: track.title || '',
		position: track.position || '',
		duration: msToMMSS(track.duration),
		bpm: track.bpm?.toString() || '',
		keyComposite: createKeyComposite(track.key, track.mode),
		genres: [...(track.genres || [])],
		rpm: track.rpm ?? null,
		playable: track.playable ?? true,
		time_signature_upper: track.time_signature_upper ?? null,
		time_signature_lower: track.time_signature_lower ?? null
	}
}

function filterArtists(artists: readonly unknown[]): DiscogsArtistDb[] {
	return artists.filter(isDiscogsArtistDb)
}

export function buildTrackEditorPayload(
	values: TrackEditorFormValues,
	artists: readonly unknown[],
	extraartists: readonly unknown[]
): TrackEditorPayload {
	const keyData = parseKeyComposite(values.keyComposite)

	return {
		title: values.title.trim(),
		artists: filterArtists(artists),
		extraartists: filterArtists(extraartists),
		position: values.position.trim() || null,
		duration: mmssToMs(values.duration),
		bpm: parseBPM(values.bpm),
		rpm: values.rpm ?? null,
		key: keyData.key,
		mode: keyData.mode,
		genres: [...values.genres],
		time_signature_upper: values.time_signature_upper ?? null,
		time_signature_lower: values.time_signature_lower ?? null,
		playable: values.playable ?? true
	}
}

function completeTrackEditorValues(
	values: Partial<TrackEditorFormValues>
): TrackEditorFormValues {
	const initialValues = createTrackEditorInitialValues()

	return {
		title: values.title ?? initialValues.title,
		position: values.position ?? initialValues.position,
		duration: values.duration ?? initialValues.duration,
		bpm: values.bpm ?? initialValues.bpm,
		keyComposite: values.keyComposite ?? initialValues.keyComposite,
		genres: values.genres ?? initialValues.genres,
		rpm: values.rpm ?? initialValues.rpm,
		playable: values.playable ?? initialValues.playable,
		time_signature_upper:
			values.time_signature_upper ?? initialValues.time_signature_upper,
		time_signature_lower:
			values.time_signature_lower ?? initialValues.time_signature_lower
	}
}

export function hasTrackEditorChanges(
	track: Track,
	values: Partial<TrackEditorFormValues>,
	artists: readonly unknown[],
	extraartists: readonly unknown[]
): boolean {
	const current = buildTrackEditorPayload(
		trackToEditorValues(track),
		track.artists,
		track.extraartists
	)
	const edited = buildTrackEditorPayload(
		completeTrackEditorValues(values),
		artists,
		extraartists
	)

	return JSON.stringify(current) !== JSON.stringify(edited)
}
