import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CardTrackSuggestion from '~/components/session/CardTrackSuggestion.vue'
import type { ScoredTrack } from '../../shared/types/session'

const factories = vi.hoisted(() => ({
	preferences: vi.fn(),
	records: vi.fn(),
	runtime: vi.fn(),
	session: vi.fn()
}))

mockNuxtImport('useWorkbenchRecordsStore', () => factories.records)
mockNuxtImport('useWorkbenchSessionStore', () => factories.session)
mockNuxtImport('useWorkbenchPreferencesStore', () => factories.preferences)
mockNuxtImport('useWorkbenchRuntime', () => factories.runtime)

const handleSuggestionClick = vi.hoisted(() => vi.fn())
const wrappers = new Set<VueWrapper>()

function createScoredTrack(overrides: Partial<ScoredTrack> = {}): ScoredTrack {
	return {
		...createMockTrack({ bpm: null, key: null, mode: null }),
		score: null,
		scoreBasis: 'none',
		tempoScore: null,
		harmonyScore: null,
		pitchAdjustment: null,
		keyCombination: -1,
		transitionHistory: null,
		historyBonus: 0,
		...overrides
	}
}

describe('session suggestion presentation', () => {
	beforeEach(() => {
		factories.records.mockReturnValue({
			getRecordById: vi.fn(() => ({
				cover: { kind: 'none' },
				labels: []
			}))
		})
		factories.session.mockReturnValue({ handleSuggestionClick })
		factories.preferences.mockReturnValue({ currentKeyFormat: 'key' })
		factories.runtime.mockReturnValue({
			capture: () => ({
				context: { id: 'test-workspace' },
				repositories: {
					covers: { resolve: vi.fn().mockResolvedValue(null) }
				}
			}),
			isCurrent: () => true
		})
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.clearAllMocks()
		document.body.innerHTML = ''
	})

	it('uses an unavailable marker and omits false pitch precision', async () => {
		const track = createScoredTrack({ title: 'Unknown metadata' })
		const wrapper = await mountSuspended(CardTrackSuggestion, {
			props: { track, deckIndex: 0 }
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).not.toContain('0.0%')
		const badge = wrapper.get(
			'[title="Mix compatibility unavailable because BPM and key data are incomplete."]'
		)
		expect(badge.text()).toBe('—')
		expect(badge.classes()).toContain('border-dashed')
		expect(wrapper.get('button').attributes('aria-label')).toContain(
			'Mix compatibility unavailable'
		)
	})

	it('retains a meaningful zero pitch adjustment when BPM is known', async () => {
		const track = createScoredTrack({
			bpm: 120,
			score: 1,
			scoreBasis: 'tempo',
			tempoScore: 1,
			pitchAdjustment: 0
		})
		const wrapper = await mountSuspended(CardTrackSuggestion, {
			props: { track, deckIndex: 0 }
		})
		wrappers.add(wrapper)

		expect(wrapper.text()).toContain('0.0%')
		expect(
			wrapper
				.get('[title="Tempo match 100 out of 100; harmony data unavailable."]')
				.text()
		).toBe('100')
	})

	it('shows how often and how well this pair was played before', async () => {
		const track = createScoredTrack({
			title: 'Loved Pair',
			bpm: 124,
			score: 0.9,
			scoreBasis: 'tempo',
			tempoScore: 0.9,
			pitchAdjustment: 0.01,
			transitionHistory: {
				plays: 3,
				ratedCount: 2,
				ratingSum: 9,
				averageRating: 4.5,
				lastPlayedAt: 1
			},
			historyBonus: 0.06
		})
		const wrapper = await mountSuspended(CardTrackSuggestion, {
			props: { track, deckIndex: 0 }
		})
		wrappers.add(wrapper)

		const history = wrapper.get('[data-testid="suggestion-transition-history"]')
		expect(history.text().replace(/\s+/g, ' ')).toBe('3× · 4.5★')
		expect(history.attributes('title')).toBe('Played after this 3×, avg 4.5★')
		expect(wrapper.get('button').attributes('aria-label')).toBe(
			'Load Loved Pair to deck 1. Tempo match 90 out of 100; harmony data unavailable. Played after this 3×, avg 4.5★.'
		)
		// The badge keeps reporting compatibility only.
		expect(
			wrapper
				.get('[title="Tempo match 90 out of 100; harmony data unavailable."]')
				.text()
		).toBe('90')
	})

	it('shows unrated history without a rating and nothing without history', async () => {
		const unrated = await mountSuspended(CardTrackSuggestion, {
			props: {
				track: createScoredTrack({
					transitionHistory: {
						plays: 2,
						ratedCount: 0,
						ratingSum: 0,
						averageRating: null,
						lastPlayedAt: 1
					}
				}),
				deckIndex: 0
			}
		})
		wrappers.add(unrated)
		const history = unrated.get('[data-testid="suggestion-transition-history"]')
		expect(history.text()).toBe('2×')
		expect(history.attributes('title')).toBe('Played after this 2×, unrated')

		const none = await mountSuspended(CardTrackSuggestion, {
			props: { track: createScoredTrack(), deckIndex: 0 }
		})
		wrappers.add(none)
		expect(
			none.find('[data-testid="suggestion-transition-history"]').exists()
		).toBe(false)
		expect(none.get('button').attributes('aria-label')).not.toContain(
			'Played after'
		)
	})

	it('keeps a genuinely calculated zero score distinct from unavailable', async () => {
		const track = createScoredTrack({
			score: 0,
			scoreBasis: 'harmony',
			harmonyScore: 0
		})
		const wrapper = await mountSuspended(CardTrackSuggestion, {
			props: { track, deckIndex: 1 }
		})
		wrappers.add(wrapper)

		const badge = wrapper.get(
			'[title="Harmonic match 0 out of 100; tempo data unavailable."]'
		)
		expect(badge.text()).toBe('0')
		expect(badge.classes()).not.toContain('border-dashed')

		await wrapper.get('button').trigger('click')
		expect(handleSuggestionClick).toHaveBeenCalledWith(track.id, 1)
	})
})
