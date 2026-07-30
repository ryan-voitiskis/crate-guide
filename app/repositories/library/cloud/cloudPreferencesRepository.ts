import type { Database } from '~~/shared/types/database'
import { decodeLibraryPreferences } from '../codecs/supabaseLibraryCodecs'
import type { PreferencesRepository } from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

const PREFERENCE_COLUMNS =
	'id, key_format, list_layout, selected_crate, turntable_pitch_range, turntable_theme, ui_theme'

export function createCloudPreferencesRepository(
	state: CloudRepositoryState
): PreferencesRepository {
	const { dependencies } = state

	return {
		async read(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('profiles')
					.select(PREFERENCE_COLUMNS)
					.eq('id', captured.userId)
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(captured, decodeLibraryPreferences(data), {
					expectedRevision: captured.startedRevision
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		async update(context, patch) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('profiles')
					.update(patch as Database['public']['Tables']['profiles']['Update'])
					.eq('id', captured.userId)
					.select(PREFERENCE_COLUMNS)
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(
					captured,
					decodeLibraryPreferences(
						data as Database['public']['Tables']['profiles']['Row']
					),
					{ mutated: true }
				)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		}
	}
}
