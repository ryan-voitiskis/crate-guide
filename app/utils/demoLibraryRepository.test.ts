import { describe, expect, it, vi } from 'vitest'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import type { LibraryDataset } from '~~/shared/types/library'

const dataset: LibraryDataset = {
	records: [],
	tracks: [],
	crates: [],
	savedSets: [],
	preferences: {
		ui_theme: 'auto',
		key_format: 'key',
		list_layout: 'cover',
		selected_crate: '',
		turntable_pitch_range: 8,
		turntable_theme: 'silver'
	}
}

const context = {
	workspaceId: 'demo',
	repositoryId: 'demo-repository',
	activationGeneration: 0
}

describe('demo library repository', () => {
	it('returns an isolated observed view', async () => {
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			dataset,
			isCurrentContext: () => true
		})

		const outcome = await repository.readObservedLibraryView(context)
		expect(outcome.status).toBe('success')
		if (outcome.status !== 'success') return
		outcome.value.preferences.key_format = 'camelot'

		const next = await repository.readObservedLibraryView(context)
		expect(next).toMatchObject({
			status: 'success',
			value: { preferences: { key_format: 'key' } }
		})
	})

	it('rejects every mutation with an explicit read-only outcome', async () => {
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			dataset,
			isCurrentContext: () => true
		})

		const outcomes = await Promise.all([
			repository.records.findExistingDiscogsIds(context, [1]),
			repository.records.importExternalWithTracks(context, null as never),
			repository.records.createWithTracks(context, null as never),
			repository.records.update(context, null as never),
			repository.records.updateWithCover(context, null as never),
			repository.records.removeFromCollection(context, { id: 'record-1' }),
			repository.records.drainCoverCleanup(context),
			repository.tracks.create(context, null as never),
			repository.tracks.update(context, null as never),
			repository.tracks.updateBatch(context, []),
			repository.tracks.delete(context, { id: 'track-1' }),
			repository.crates.create(context, null as never),
			repository.crates.updateMetadata(context, null as never),
			repository.crates.delete(context, { id: 'crate-1' }),
			repository.crates.addRecord(context, {
				crateId: 'crate-1',
				recordId: 'record-1'
			}),
			repository.crates.removeRecord(context, {
				crateId: 'crate-1',
				recordId: 'record-1'
			}),
			repository.savedSets.save(context, null as never),
			repository.savedSets.delete(context, { id: 'set-1' }),
			repository.preferences.update(context, { key_format: 'camelot' })
		])

		expect(outcomes).toEqual(
			Array.from({ length: 19 }, () => ({
				status: 'unavailable',
				reason: 'read-only'
			}))
		)
	})

	it('drops a stale observation without reading or mutating source state', async () => {
		const isCurrentContext = vi.fn(() => false)
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			dataset,
			isCurrentContext
		})

		await expect(repository.readObservedLibraryView(context)).resolves.toEqual({
			status: 'stale'
		})
		expect(isCurrentContext).toHaveBeenCalledWith(context)
	})
})
