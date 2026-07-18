import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ImageRecordCover from '~/components/records/ImageRecordCover.vue'

const createSignedUrl = vi.fn().mockResolvedValue({
	data: { signedUrl: 'https://supabase.test.invalid/signed/custom.webp' },
	error: null
})

mockNuxtImport('useSupabaseClient', () => () => ({
	auth: {
		getSession: vi.fn().mockResolvedValue({
			data: { session: null },
			error: null
		}),
		onAuthStateChange: vi.fn(() => ({
			data: { subscription: { unsubscribe: vi.fn() } }
		}))
	},
	storage: {
		from: () => ({ createSignedUrl })
	}
}))

describe('record cover presentation', () => {
	afterEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})

	it('states clearly when artwork is missing', async () => {
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createMockRecord({ cover: null }),
				showLabel: true
			}
		})

		expect(wrapper.text()).toContain('No cover artwork')
		expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
			'No cover artwork'
		)
	})

	it('gives uploaded artwork precedence over the external fallback', async () => {
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createMockRecord({
					cover: 'https://discogs.example/fallback.jpg',
					cover_storage_path: 'user-1/record-1/custom.webp'
				})
			}
		})
		await flushPromises()

		expect(createSignedUrl).toHaveBeenCalledWith(
			'user-1/record-1/custom.webp',
			300
		)
		expect(wrapper.get('img').attributes('src')).toBe(
			'https://supabase.test.invalid/signed/custom.webp'
		)
	})

	it('falls back to the external artwork when private access fails', async () => {
		createSignedUrl.mockResolvedValueOnce({
			data: { signedUrl: '' },
			error: new Error('Access denied')
		})
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createMockRecord({
					cover: 'https://discogs.example/fallback.jpg',
					cover_storage_path: 'user-1/record-1/custom.webp'
				})
			}
		})
		await flushPromises()

		expect(wrapper.get('img').attributes('src')).toBe(
			'https://discogs.example/fallback.jpg'
		)
	})

	it('replaces a failed image with an unavailable state', async () => {
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createMockRecord(),
				showLabel: true
			}
		})
		await flushPromises()

		await wrapper.get('img').trigger('error')
		expect(wrapper.text()).toContain('Cover unavailable')
		expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
			'Cover image unavailable'
		)
	})
})
