import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogLoadTrack from '~/components/session/DialogLoadTrack.vue'
import { useSessionStore } from '~/stores/sessionStore'
import type { Crate } from '~~/shared/types/supabase'

const wrappers = new Set<VueWrapper>()

function createCrate(recordId: string): Crate {
	return {
		id: 'crate-1',
		user_id: 'test-user',
		name: 'Listening crate',
		description: null,
		color: null,
		records: [recordId],
		created_at: null,
		updated_at: null
	}
}

function getBody() {
	return new DOMWrapper(document.body)
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountDialog(options: { open?: boolean } = {}) {
	const record = createMockRecord({
		id: 'record-1',
		title: 'Test Record',
		cover: null
	})
	const tracks = Array.from({ length: 6 }, (_, index) =>
		createMockTrack({
			id: `track-${index + 1}`,
			record_id: record.id,
			title: `Test Track ${index + 1}`,
			position: `A${index + 1}`
		})
	)
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true,
		initialState: {
			records: { records: [record] },
			tracks: { tracks },
			crates: { crates: [createCrate(record.id)] },
			session: { loadTrackCrateId: 'crate-1' }
		}
	})
	const wrapper = await mountSuspended(DialogLoadTrack, {
		props: { open: options.open ?? false, deckIndex: 1 },
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)

	return {
		wrapper,
		pinia,
		session: useSessionStore(pinia as Pinia),
		tracks
	}
}

describe('DialogLoadTrack', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('focuses search on open without an extraneous Teleport warning', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		const { wrapper } = await mountDialog()

		await wrapper.setProps({ open: true })
		await settleDialog()

		const search = getBody().get('[data-testid="load-track-search"]')
		expect(document.activeElement).toBe(search.element)
		const teleportWarnings = warn.mock.calls.filter((call) => {
			const message = call.map(String).join(' ')
			return (
				message.includes('Extraneous non-props attributes') &&
				message.toLocaleLowerCase().includes('teleport')
			)
		})
		expect(teleportWarnings).toEqual([])
	})

	it('moves focus from search to the first real track option', async () => {
		const { wrapper } = await mountDialog()
		await wrapper.setProps({ open: true })
		await settleDialog()
		const search = getBody().get('[data-testid="load-track-search"]')

		await search.setValue('Test')
		await settleDialog()
		await search.trigger('keydown', { key: 'ArrowDown' })

		const firstTrack = getBody().get('[data-testid="load-track-option"]')
		expect(document.activeElement).toBe(firstTrack.element)
		expect(firstTrack.attributes('data-track-id')).toBe('track-1')
	})

	it('loads a selected track and clears search and expansion state', async () => {
		const { wrapper, session } = await mountDialog()
		await wrapper.setProps({ open: true })
		await settleDialog()
		const body = getBody()
		const search = body.get('[data-testid="load-track-search"]')

		await search.setValue('Test')
		await settleDialog()
		const showMore = body
			.findAll('button')
			.find((button) => button.text().includes('Show 1 more'))
		expect(showMore).toBeDefined()
		await showMore?.trigger('click')
		expect(body.text()).toContain('Show fewer')

		await body
			.get('[data-testid="load-track-option"][data-track-id="track-6"]')
			.trigger('click')
		await settleDialog()

		expect(session.loadTrack).toHaveBeenCalledWith('track-6', 1, false)
		expect(wrapper.emitted('update:open')).toContainEqual([false])
		expect(
			body.get('[data-testid="load-track-search"]').element
		).toHaveProperty('value', '')
		expect(body.find('[data-testid="load-track-option"]').exists()).toBe(false)
		expect(body.text()).not.toContain('Show fewer')
	})

	it('preserves crate scope while close and reopen clear focused state', async () => {
		const { wrapper, session } = await mountDialog()
		await wrapper.setProps({ open: true })
		await settleDialog()
		const body = getBody()

		await body.get('[data-testid="load-track-record-tile"]').trigger('click')
		expect(body.find('[data-testid="load-track-option"]').exists()).toBe(true)

		const close = body
			.findAll('button')
			.find((button) => button.text().trim() === 'Close')
		expect(close).toBeDefined()
		await close?.trigger('click')
		await wrapper.setProps({ open: false })
		await settleDialog()
		await wrapper.setProps({ open: true })
		await settleDialog()

		expect(session.loadTrackCrateId).toBe('crate-1')
		expect(body.find('[data-testid="load-track-option"]').exists()).toBe(false)
		expect(body.find('[data-testid="load-track-record-tile"]').exists()).toBe(
			true
		)
		expect(
			body.get('[data-testid="load-track-search"]').element
		).toHaveProperty('value', '')
	})
})
