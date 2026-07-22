import { describe, expect, it, vi } from 'vitest'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import type { LibrarySnapshot } from '~~/shared/types/library'

const snapshot: LibrarySnapshot = {
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
	},
	repositoryRevision: 0
}

const context = {
	workspaceId: 'demo',
	repositoryId: 'demo-repository',
	activationGeneration: 0,
	repositoryRevision: 0
}

describe('demo library repository', () => {
	it('returns an isolated read snapshot', async () => {
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			snapshot,
			isCurrentContext: () => true
		})

		const outcome = await repository.readLibrarySnapshot(context)
		expect(outcome.status).toBe('success')
		if (outcome.status !== 'success') return
		outcome.value.preferences.key_format = 'camelot'

		const next = await repository.readLibrarySnapshot(context)
		expect(next).toMatchObject({
			status: 'success',
			value: { preferences: { key_format: 'key' } }
		})
	})

	it('rejects every mutation with an explicit read-only outcome', async () => {
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			snapshot,
			isCurrentContext: () => true
		})

		const outcomes = await Promise.all([
			repository.records.removeFromCollection(context, { id: 'record-1' }),
			repository.tracks.delete(context, { id: 'track-1' }),
			repository.crates.delete(context, { id: 'crate-1' }),
			repository.savedSets.delete(context, { id: 'set-1' }),
			repository.preferences.update(context, { key_format: 'camelot' })
		])

		expect(outcomes).toEqual(
			Array.from({ length: 5 }, () => ({
				status: 'unavailable',
				reason: 'read-only'
			}))
		)
	})

	it('drops a stale snapshot without reading or mutating source state', async () => {
		const isCurrentContext = vi.fn(() => false)
		const repository = createDemoLibraryRepository({
			id: 'demo-repository',
			snapshot,
			isCurrentContext
		})

		await expect(repository.readLibrarySnapshot(context)).resolves.toEqual({
			status: 'stale'
		})
		expect(isCurrentContext).toHaveBeenCalledWith(context)
	})
})
