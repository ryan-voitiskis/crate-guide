import {
	postgresTimestampMicroseconds,
	sortCreatedAtDescIdDesc
} from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import type { Database } from '~~/shared/types/database'
import { decodeLibraryCrateRow } from '../codecs/supabaseLibraryCodecs'
import type { CratesRepository } from '../contracts'
import type { CloudRepositoryState } from './cloudRepositoryState'

type CrateRow = Database['public']['Tables']['crates']['Row']

function decodeOwnedCrate(value: unknown, userId: string, expectedId?: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null
	}
	const candidate = value as Record<string, unknown>
	const nullableStringsAreValid = ['description', 'color'].every(
		(field) => candidate[field] === null || typeof candidate[field] === 'string'
	)
	const createdAtIsValid =
		candidate.created_at === null || typeof candidate.created_at === 'string'
	const updatedAtIsValid =
		candidate.updated_at === null ||
		(typeof candidate.updated_at === 'string' &&
			postgresTimestampMicroseconds(candidate.updated_at) !== null)
	if (
		typeof candidate.id !== 'string' ||
		candidate.id !== (expectedId ?? candidate.id) ||
		typeof candidate.name !== 'string' ||
		candidate.user_id !== userId ||
		!nullableStringsAreValid ||
		!createdAtIsValid ||
		!updatedAtIsValid ||
		!Array.isArray(candidate.records) ||
		!candidate.records.every((recordId) => typeof recordId === 'string')
	) {
		return null
	}
	const row = candidate as CrateRow
	return decodeLibraryCrateRow(row)
}

export function createCloudCratesRepository(
	state: CloudRepositoryState
): CratesRepository {
	const { dependencies } = state

	return {
		async list(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const rows = await fetchAllSupabasePages(async (cursor, pageSize) => {
					let query = dependencies.supabase
						.from('crates')
						.select('*')
						.eq('user_id', captured.userId)
						.order('id', { ascending: false })
					if (cursor !== null) query = query.lt('id', cursor)
					return await query.limit(pageSize)
				})
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				const decoded = rows.map((row) =>
					decodeOwnedCrate(row, captured.userId)
				)
				if (decoded.some((crate) => crate === null)) {
					return { status: 'conflict', reason: 'integrity' }
				}
				return state.complete(
					captured,
					sortCreatedAtDescIdDesc(
						decoded.flatMap((crate) => (crate ? [crate.row] : []))
					)
				)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		async create(context, input) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('crates')
					.insert({ ...input, user_id: captured.userId })
					.select()
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				const decoded = decodeOwnedCrate(data, captured.userId)
				if (!decoded) return { status: 'conflict', reason: 'integrity' }
				return state.complete(captured, decoded.row, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async updateMetadata(context, { id, updates }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase
					.from('crates')
					.update(updates)
					.eq('id', id)
					.eq('user_id', captured.userId)
					.select()
					.single()
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				const decoded = decodeOwnedCrate(data, captured.userId, id)
				if (!decoded) return { status: 'conflict', reason: 'integrity' }
				return state.complete(captured, decoded.row, { mutated: true })
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
				const { error } = await dependencies.supabase
					.from('crates')
					.delete()
					.eq('id', id)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				return state.complete(captured, { id }, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async addRecord(context, { crateId, recordId }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase.rpc(
					'add_record_to_crate',
					{ target_crate_id: crateId, target_record_id: recordId }
				)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				const decoded = decodeOwnedCrate(data, captured.userId, crateId)
				if (!decoded) return { status: 'conflict', reason: 'integrity' }
				return state.complete(captured, decoded.row, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},

		async removeRecord(context, { crateId, recordId }) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const { data, error } = await dependencies.supabase.rpc(
					'remove_record_from_crate',
					{ target_crate_id: crateId, target_record_id: recordId }
				)
				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (error) return state.transportFailure(error)
				const decoded = decodeOwnedCrate(data, captured.userId, crateId)
				if (!decoded) return { status: 'conflict', reason: 'integrity' }
				return state.complete(captured, decoded.row, { mutated: true })
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		}
	}
}
