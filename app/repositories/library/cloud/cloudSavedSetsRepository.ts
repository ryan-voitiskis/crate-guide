import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import type { Json } from '~~/shared/types/database'
import { decodeLibrarySavedSetRow } from '../codecs/supabaseLibraryCodecs'
import type { SavedSetsRepository } from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

export function createCloudSavedSetsRepository(
	state: CloudRepositoryState
): SavedSetsRepository {
	const { dependencies } = state

	return {
		async list(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
					let query = dependencies.supabase
						.from('sets')
						.select('*')
						.eq('user_id', captured.userId)
						.order('id', { ascending: false })
					if (cursor !== null) query = query.lt('id', cursor)
					return await query.limit(pageSize)
				})
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (rows.some((row) => row.user_id !== captured.userId)) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const decoded = rows.map(decodeLibrarySavedSetRow)
				return state.complete(
					captured,
					sortCreatedAtDescIdDesc(decoded.map((item) => item.row)),
					{ issues: decoded.flatMap((item) => item.issues) }
				)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		async save(context, input) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const playedTracks = input.playedTracks.map((entry) => ({ ...entry }))
				const query = input.setId
					? dependencies.supabase
							.from('sets')
							.update({
								...(input.kind === 'manual' ? { name: input.name } : {}),
								played_tracks: playedTracks as unknown as Json
							})
							.eq('id', input.setId)
							.eq('user_id', captured.userId)
					: dependencies.supabase.from('sets').insert({
							user_id: captured.userId,
							name: input.kind === 'manual' ? input.name : null,
							played_tracks: playedTracks as unknown as Json
						})
				const { data, error } = await query.select().single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (
					!data ||
					data.user_id !== captured.userId ||
					(input.setId !== null && data.id !== input.setId)
				) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const decoded = decodeLibrarySavedSetRow(data)
				return state.complete(captured, decoded.row, {
					issues: decoded.issues,
					mutated: true
				})
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async delete(context, { id }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('sets')
					.delete()
					.eq('id', id)
					.eq('user_id', captured.userId)
					.select('id, user_id')
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				if (!data || data.id !== id || data.user_id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(captured, { id }, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		}
	}
}
