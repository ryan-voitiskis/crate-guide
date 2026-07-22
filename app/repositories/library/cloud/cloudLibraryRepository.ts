import { sortCreatedAtDescIdDesc } from '~/utils/supabaseOrdering'
import { fetchAllSupabasePages } from '~/utils/supabasePagination'
import type { DecodeIssue } from '~/utils/supabaseRows'
import {
	decodeLibraryCrateRow,
	decodeLibraryPreferences,
	decodeLibraryRecordRow,
	decodeLibrarySavedSetRow,
	decodeLibraryTrackRow
} from '../codecs/supabaseLibraryCodecs'
import type { LibraryRepositoryBundle } from '../contracts'
import { createCloudCoverResolver } from './cloudCoverResolver'
import { createCloudCratesRepository } from './cloudCratesRepository'
import { createCloudPreferencesRepository } from './cloudPreferencesRepository'
import { createCloudRecordsRepository } from './cloudRecordsRepository'
import {
	type CloudLibraryRepositoryDependencies,
	createCloudRepositoryState
} from './cloudRepositoryState'
import { createCloudSavedSetsRepository } from './cloudSavedSetsRepository'
import { createCloudTracksRepository } from './cloudTracksRepository'

export function createCloudLibraryRepository(
	dependencies: CloudLibraryRepositoryDependencies
): LibraryRepositoryBundle {
	const state = createCloudRepositoryState(dependencies)
	const records = createCloudRecordsRepository(state)
	const tracks = createCloudTracksRepository(state)
	const crates = createCloudCratesRepository(state)
	const savedSets = createCloudSavedSetsRepository(state)
	const preferences = createCloudPreferencesRepository(state)
	const coverResolver = createCloudCoverResolver(state)
	const covers = {
		resolve: coverResolver.resolve,
		reset() {
			records.reset()
			coverResolver.reset()
		}
	}

	return {
		id: dependencies.repositoryId,
		async readLibrarySnapshot(context) {
			const captured = await state.capture(context)
			if (!state.isLease(captured)) return captured
			try {
				const [recordRows, trackRows, crateRows, savedSetRows, profileResult] =
					await Promise.all([
						fetchAllSupabasePages(async (cursor, pageSize) => {
							let query = dependencies.supabase
								.from('records')
								.select('*')
								.eq('user_id', captured.userId)
								.order('id', { ascending: false })
							if (cursor !== null) query = query.lt('id', cursor)
							return await query.limit(pageSize)
						}),
						fetchAllSupabasePages(async (cursor, pageSize) => {
							let query = dependencies.supabase
								.from('tracks')
								.select('*')
								.eq('user_id', captured.userId)
								.order('id', { ascending: false })
							if (cursor !== null) query = query.lt('id', cursor)
							return await query.limit(pageSize)
						}),
						fetchAllSupabasePages(async (cursor, pageSize) => {
							let query = dependencies.supabase
								.from('crates')
								.select('*')
								.eq('user_id', captured.userId)
								.order('id', { ascending: false })
							if (cursor !== null) query = query.lt('id', cursor)
							return await query.limit(pageSize)
						}),
						fetchAllSupabasePages(async (cursor, pageSize) => {
							let query = dependencies.supabase
								.from('sets')
								.select('*')
								.eq('user_id', captured.userId)
								.order('id', { ascending: false })
							if (cursor !== null) query = query.lt('id', cursor)
							return await query.limit(pageSize)
						}),
						dependencies.supabase
							.from('profiles')
							.select('*')
							.eq('id', captured.userId)
							.single()
					])

				if (!(await state.isCurrent(captured))) return { status: 'stale' }
				if (state.hasRevisionChanged(captured)) return { status: 'stale' }
				if (profileResult.error) {
					return state.transportFailure(profileResult.error)
				}
				if (!profileResult.data || profileResult.data.id !== captured.userId) {
					return { status: 'conflict', reason: 'integrity' }
				}
				const ownedRows = [
					...recordRows,
					...trackRows,
					...crateRows,
					...savedSetRows
				]
				if (ownedRows.some((row) => row.user_id !== captured.userId)) {
					return { status: 'conflict', reason: 'integrity' }
				}

				const decodedRecords = recordRows.map(decodeLibraryRecordRow)
				const decodedTracks = trackRows.map(decodeLibraryTrackRow)
				const decodedCrates = crateRows.map(decodeLibraryCrateRow)
				const decodedSavedSets = savedSetRows.map(decodeLibrarySavedSetRow)
				const issues: DecodeIssue[] = [
					...decodedRecords.flatMap((decoded) => decoded.issues),
					...decodedTracks.flatMap((decoded) => decoded.issues),
					...decodedCrates.flatMap((decoded) => decoded.issues),
					...decodedSavedSets.flatMap((decoded) => decoded.issues)
				]
				const revision = state.getRevision()
				return state.complete(
					captured,
					{
						records: sortCreatedAtDescIdDesc(
							decodedRecords.map((decoded) => decoded.row)
						),
						tracks: sortCreatedAtDescIdDesc(
							decodedTracks.map((decoded) => decoded.row)
						),
						crates: sortCreatedAtDescIdDesc(
							decodedCrates.map((decoded) => decoded.row)
						),
						savedSets: sortCreatedAtDescIdDesc(
							decodedSavedSets.map((decoded) => decoded.row)
						),
						preferences: decodeLibraryPreferences(profileResult.data),
						repositoryRevision: revision
					},
					{ expectedRevision: captured.startedRevision, issues }
				)
			} catch (error) {
				return (await state.isCurrent(captured))
					? state.transportFailure(error)
					: { status: 'stale' }
			}
		},
		records,
		tracks,
		crates,
		savedSets,
		preferences,
		covers
	}
}
