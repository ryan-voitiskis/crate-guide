import { type MaybeRefOrGetter, ref, toValue } from 'vue'
import { parseKeyComposite } from '~/utils/keyFunctions'
import type {
	LibraryTrack,
	LibraryTrackUpdateInput
} from '~~/shared/types/library'

export type QuickSetField = 'bpm' | 'key'

export const QUICK_SET_CONFLICT_MESSAGE =
	'This track changed elsewhere. The latest saved values are shown; try again.'

/**
 * Writes single BPM or key changes for one track through the library store,
 * carrying the track's current `updated_at` as the version precondition so a
 * stale panel never overwrites another session's edit.
 */
export function useTrackQuickSet(track: MaybeRefOrGetter<LibraryTrack | null>) {
	const tracks = useWorkbenchTracksStore()
	const pending = ref<Record<QuickSetField, boolean>>({
		bpm: false,
		key: false
	})
	const conflict = ref<string | null>(null)

	async function write(
		field: QuickSetField,
		updates: LibraryTrackUpdateInput
	): Promise<LibraryTrack | null> {
		const current = toValue(track)
		if (!current || pending.value[field]) return null
		const trackId = current.id
		pending.value[field] = true
		conflict.value = null
		try {
			const result = await tracks.updateTrack(trackId, updates, {
				silent: true,
				expectedUpdatedAt: current.updated_at,
				onConflict: () => {
					if (toValue(track)?.id === trackId)
						conflict.value = QUICK_SET_CONFLICT_MESSAGE
				}
			})
			return result
		} finally {
			pending.value[field] = false
		}
	}

	function setBpm(bpm: number): Promise<LibraryTrack | null> {
		return write('bpm', { bpm })
	}

	function setKey(composite: string): Promise<LibraryTrack | null> {
		const { key, mode } = parseKeyComposite(composite)
		// Key and mode are only ever written as a pair.
		return write('key', { key, mode })
	}

	function dismissConflict() {
		conflict.value = null
	}

	return { pending, conflict, setBpm, setKey, dismissConflict }
}
