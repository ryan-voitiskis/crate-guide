import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { beforeEach, describe, expect, it } from 'vitest'
import {
	createTracksStore,
	resetTracksStoreHarness
} from './tracksStoreTestHarness'

describe('tracksStore queries', () => {
	beforeEach(resetTracksStoreHarness)

	describe('computed properties', () => {
		it('tracksCount returns correct count', () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack(), createMockTrack(), createMockTrack()]

			expect(store.tracksCount).toBe(3)
		})

		it('hasTracks returns false when empty', () => {
			const store = createTracksStore()
			expect(store.hasTracks).toBe(false)
		})

		it('hasTracks returns true when tracks exist', () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack()]

			expect(store.hasTracks).toBe(true)
		})

		it('playableTracks filters out non-playable tracks', () => {
			const store = createTracksStore()
			store.tracks = [
				createMockTrack({ id: 'playable-1', playable: true }),
				createMockTrack({ id: 'non-playable', playable: false }),
				createMockTrack({ id: 'playable-2', playable: true })
			]

			const playable = store.playableTracks
			expect(playable.length).toBe(2)
			expect(playable.map((t) => t.id)).toEqual(['playable-1', 'playable-2'])
		})
	})

	describe('getTrackById', () => {
		it('returns undefined when track not found', () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack({ id: 'track-1' })]

			const result = store.getTrackById('non-existent')

			expect(result).toBeUndefined()
		})

		it('returns track when found', () => {
			const store = createTracksStore()
			const track = createMockTrack({ id: 'track-1', title: 'Found Track' })
			store.tracks = [track]

			const result = store.getTrackById('track-1')

			expect(result?.title).toBe('Found Track')
		})

		it('rebuilds the index after replacement, additions, removals, and reset', () => {
			const store = createTracksStore()
			const original = createMockTrack({ id: 'track-1', title: 'Original' })
			store.tracks = [original]

			expect(store.getTrackById('track-1')?.title).toBe('Original')

			const replacement = createMockTrack({
				id: 'track-1',
				title: 'Replacement'
			})
			store.tracks = [replacement]
			expect(store.getTrackById('track-1')?.title).toBe('Replacement')

			const added = createMockTrack({ id: 'track-2' })
			store.tracks.push(added)
			expect(store.getTrackById('track-2')?.id).toBe(added.id)

			store.tracks.splice(0, 1)
			expect(store.getTrackById('track-1')).toBeUndefined()

			store.clearTracks()
			expect(store.getTrackById('track-2')).toBeUndefined()
		})
	})

	describe('getTracksByRecordId', () => {
		it('returns empty array when no tracks match', () => {
			const store = createTracksStore()
			store.tracks = [createMockTrack({ record_id: 'record-1' })]

			const result = store.getTracksByRecordId('record-2')

			expect(result).toEqual([])
		})

		it('returns all tracks for a record', () => {
			const store = createTracksStore()
			store.tracks = [
				createMockTrack({ id: 'track-1', record_id: 'record-1' }),
				createMockTrack({ id: 'track-2', record_id: 'record-1' }),
				createMockTrack({ id: 'track-3', record_id: 'record-2' })
			]

			const result = store.getTracksByRecordId('record-1')

			expect(result.length).toBe(2)
			expect(result.map((t) => t.id)).toEqual(['track-1', 'track-2'])
		})

		it('rebuilds grouped indexes after replacement, mutation, and reset', () => {
			const store = createTracksStore()
			const first = createMockTrack({
				id: 'track-1',
				record_id: 'record-1'
			})
			const second = createMockTrack({
				id: 'track-2',
				record_id: 'record-1'
			})
			store.tracks = [first, second]

			expect(store.getTracksByRecordId('record-1')).toEqual([first, second])

			const replacement = createMockTrack({
				id: 'track-3',
				record_id: 'record-2'
			})
			store.tracks = [replacement]
			expect(store.getTracksByRecordId('record-1')).toEqual([])
			expect(store.getTracksByRecordId('record-2')).toEqual([replacement])

			const added = createMockTrack({
				id: 'track-4',
				record_id: 'record-2'
			})
			store.tracks.push(added)
			expect(store.getTracksByRecordId('record-2')).toEqual([
				replacement,
				added
			])

			store.tracks.splice(0, 1)
			expect(store.getTracksByRecordId('record-2')).toEqual([added])

			store.clearTracks()
			expect(store.getTracksByRecordId('record-2')).toEqual([])
		})
	})
})
