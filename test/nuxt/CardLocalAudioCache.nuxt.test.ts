import { defineComponent } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CardLocalAudioCache from '~/components/settings/CardLocalAudioCache.vue'

const cacheMocks = vi.hoisted(() => ({
	clear: vi.fn(),
	status: vi.fn()
}))

vi.mock('~/utils/localAudioCache', () => ({
	clearLocalAudioAnalysisCache: cacheMocks.clear,
	getLocalAudioCacheStatus: cacheMocks.status
}))

const PassthroughStub = defineComponent({
	template: '<div><slot /></div>'
})
const ButtonStub = defineComponent({
	inheritAttrs: false,
	emits: ['click'],
	template:
		'<button v-bind="$attrs" type="button" @click="$emit(\'click\')"><slot /></button>'
})

let wrapper: VueWrapper | null = null

async function mountCard() {
	wrapper = await mountSuspended(CardLocalAudioCache, {
		global: {
			stubs: {
				AlertDialog: PassthroughStub,
				AlertDialogActionLoading: ButtonStub,
				AlertDialogCancel: ButtonStub,
				AlertDialogContent: PassthroughStub,
				AlertDialogDescription: PassthroughStub,
				AlertDialogFooter: PassthroughStub,
				AlertDialogHeader: PassthroughStub,
				AlertDialogTitle: PassthroughStub,
				Button: ButtonStub
			}
		}
	})
	await flushPromises()
	return wrapper
}

describe('CardLocalAudioCache', () => {
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.clearAllMocks()
	})

	it('labels cached analysis as disposable and separate from the library', async () => {
		cacheMocks.status.mockResolvedValue({
			entryCount: 321,
			lastPrunedAt: 1_753_158_600_000,
			maxEntries: 20_000,
			maxAgeDays: 90,
			databaseName: 'crate-guide-local-audio'
		})

		const card = await mountCard()

		expect(card.text()).toContain('321 cached results')
		expect(card.text()).toContain('This is not your library or a backup')
		expect(card.text()).toContain('Entries older than 90 days')
		expect(card.text()).toContain('20,000 results')
	})

	it('clears only after confirmation and refreshes the empty status', async () => {
		cacheMocks.status
			.mockResolvedValueOnce({
				entryCount: 1,
				lastPrunedAt: null,
				maxEntries: 20_000,
				maxAgeDays: 90,
				databaseName: 'crate-guide-local-audio'
			})
			.mockResolvedValueOnce({
				entryCount: 0,
				lastPrunedAt: null,
				maxEntries: 20_000,
				maxAgeDays: 90,
				databaseName: 'crate-guide-local-audio'
			})
		cacheMocks.clear.mockResolvedValue(undefined)
		const card = await mountCard()

		await card.get('[data-testid="open-clear-audio-cache"]').trigger('click')
		expect(cacheMocks.clear).not.toHaveBeenCalled()
		await card.get('[data-testid="confirm-clear-audio-cache"]').trigger('click')
		await flushPromises()

		expect(cacheMocks.clear).toHaveBeenCalledTimes(1)
		expect(cacheMocks.status).toHaveBeenCalledTimes(2)
		expect(card.text()).toContain('0 cached results')
		expect(card.text()).toContain('Local analysis cache cleared')
	})

	it('shows busy or unavailable cache status without hiding the explanation', async () => {
		cacheMocks.status.mockRejectedValue(
			new Error('Local audio analysis cache is busy')
		)

		const card = await mountCard()

		expect(card.text()).toContain('Cache status unavailable')
		expect(card.text()).toContain('Local audio analysis cache is busy')
		expect(card.text()).toContain('This is not your library or a backup')
	})
})
