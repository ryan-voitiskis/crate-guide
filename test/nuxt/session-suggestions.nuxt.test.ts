import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CardTrackSuggestion from '~/components/session/CardTrackSuggestion.vue'
import type { ScoredTrack } from '../../shared/types/session'

const factories = vi.hoisted(() => ({
	records: vi.fn(),
	session: vi.fn(),
	user: vi.fn()
}))

mockNuxtImport('useRecordsStore', () => factories.records)
mockNuxtImport('useSessionStore', () => factories.session)
mockNuxtImport('useUserStore', () => factories.user)

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
		...overrides
	}
}

describe('session suggestion presentation', () => {
	beforeEach(() => {
		factories.records.mockReturnValue({
			getRecordById: vi.fn(() => ({ cover: null, labels: [] }))
		})
		factories.session.mockReturnValue({ handleSuggestionClick })
		factories.user.mockReturnValue({ currentKeyFormat: 'traditional' })
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
