import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_TRANSITION_HISTORY } from '~/utils/transitionHistory'
import type { LibrarySavedSet } from '~~/shared/types/library'
import {
	getTransitionHistoryForSavedSets,
	useTransitionHistory
} from '../useTransitionHistory'

const session = reactive({ savedSets: [] as LibrarySavedSet[] })
vi.stubGlobal('useWorkbenchSessionStore', () => session)

function savedSet(id: string, trackIds: string[]): LibrarySavedSet {
	return {
		id,
		name: null,
		created_at: null,
		updated_at: null,
		played_tracks: trackIds.map((trackId, index) => ({
			track_id: trackId,
			time_added: index,
			adjusted_bpm: null,
			transition_rating: index === 0 ? null : 4
		}))
	}
}

describe('useTransitionHistory', () => {
	beforeEach(() => {
		session.savedSets = []
	})

	it('returns the shared empty index without saved sets', () => {
		expect(useTransitionHistory().value).toBe(EMPTY_TRANSITION_HISTORY)
	})

	it('rebuilds only when the saved-set array is replaced', () => {
		const history = useTransitionHistory()
		const otherConsumer = useTransitionHistory()
		session.savedSets = [savedSet('one', ['a', 'b'])]

		const first = history.value
		expect(first.outgoing.get('a')?.get('b')?.averageRating).toBe(4)
		expect(otherConsumer.value).toBe(first)

		session.savedSets = [...session.savedSets, savedSet('two', ['a', 'b'])]
		expect(history.value).not.toBe(first)
		expect(history.value.outgoing.get('a')?.get('b')?.plays).toBe(2)
	})

	it('keys the memo by the raw array behind a reactive proxy', () => {
		session.savedSets = [savedSet('one', ['a', 'b'])]
		const proxied = session.savedSets
		expect(getTransitionHistoryForSavedSets(proxied)).toBe(
			useTransitionHistory().value
		)
	})
})
