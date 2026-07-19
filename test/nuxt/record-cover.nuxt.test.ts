import { defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageRecordCover from '~/components/records/ImageRecordCover.vue'
import {
	resetRecordCoverUrlCacheForTests,
	useRecordCover
} from '~/composables/useRecordCover'

const coverMocks = vi.hoisted(() => ({
	currentUserId: 'user-1',
	createSignedUrl: vi.fn(),
	resolveAuthenticatedUserId: vi.fn()
}))

mockNuxtImport('useUserStore', () => () => ({
	resolveAuthenticatedUserId: coverMocks.resolveAuthenticatedUserId
}))

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
		from: () => ({ createSignedUrl: coverMocks.createSignedUrl })
	}
}))

const TwoRecordCovers = defineComponent({
	props: {
		record: { type: Object, required: true }
	},
	setup(props) {
		return () =>
			h('div', [
				h(ImageRecordCover, { record: props.record as DatabaseRecord }),
				h(ImageRecordCover, { record: props.record as DatabaseRecord })
			])
	}
})

describe('record cover presentation', () => {
	beforeEach(() => {
		coverMocks.currentUserId = 'user-1'
		coverMocks.resolveAuthenticatedUserId.mockImplementation(
			async () => coverMocks.currentUserId
		)
		coverMocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: 'https://supabase.test.invalid/signed/custom.webp' },
			error: null
		})
		resetRecordCoverUrlCacheForTests()
	})

	afterEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		vi.useRealTimers()
		resetRecordCoverUrlCacheForTests()
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

		expect(coverMocks.createSignedUrl).toHaveBeenCalledWith(
			'user-1/record-1/custom.webp',
			300
		)
		expect(wrapper.get('img').attributes('src')).toBe(
			'https://supabase.test.invalid/signed/custom.webp'
		)
	})

	it('falls back to the external artwork when private access fails', async () => {
		coverMocks.createSignedUrl.mockResolvedValueOnce({
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

	it('coalesces concurrent cover instances by user identity and storage path', async () => {
		const record = createMockRecord({
			cover_storage_path: 'user-1/record-1/shared.webp'
		})

		const wrapper = await mountSuspended(TwoRecordCovers, {
			props: { record }
		})
		await flushPromises()

		expect(wrapper.findAllComponents(ImageRecordCover)).toHaveLength(2)
		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(1)
	})

	it('reuses successful URLs for 240 seconds and signs again after expiry', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-07-19T00:00:00.000Z'))
		const record = createMockRecord({
			cover_storage_path: 'user-1/record-1/expiring.webp'
		})

		const first = await mountSuspended(ImageRecordCover, { props: { record } })
		await flushPromises()
		first.unmount()

		vi.advanceTimersByTime(239_999)
		const cached = await mountSuspended(ImageRecordCover, { props: { record } })
		await flushPromises()
		cached.unmount()
		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(2)
		await mountSuspended(ImageRecordCover, { props: { record } })
		await flushPromises()
		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(2)
	})

	it('never shares cached URLs across authenticated identities', async () => {
		const record = createMockRecord({
			cover_storage_path: 'shared/record-1/identity.webp'
		})

		const first = await mountSuspended(ImageRecordCover, { props: { record } })
		await flushPromises()
		first.unmount()

		coverMocks.currentUserId = 'user-2'
		await mountSuspended(ImageRecordCover, { props: { record } })
		await flushPromises()

		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(2)
	})

	it('does not cache failures and preserves each external fallback', async () => {
		coverMocks.createSignedUrl.mockResolvedValueOnce({
			data: { signedUrl: '' },
			error: new Error('Access denied')
		})
		const firstRecord = createMockRecord({
			cover: 'https://discogs.example/first.jpg',
			cover_storage_path: 'user-1/record-1/retry.webp'
		})
		const first = await mountSuspended(ImageRecordCover, {
			props: { record: firstRecord }
		})
		await flushPromises()

		expect(first.get('img').attributes('src')).toBe(
			'https://discogs.example/first.jpg'
		)
		first.unmount()

		const secondRecord = createMockRecord({
			cover: 'https://discogs.example/second.jpg',
			cover_storage_path: 'user-1/record-1/retry.webp'
		})
		const second = await mountSuspended(ImageRecordCover, {
			props: { record: secondRecord }
		})
		await flushPromises()

		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(2)
		expect(second.get('img').attributes('src')).toBe(
			'https://supabase.test.invalid/signed/custom.webp'
		)
	})

	it('bounds successful signed URLs to the 500 least-recently-used entries', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date('2026-07-19T00:00:00.000Z'))
		coverMocks.createSignedUrl.mockImplementation(async (path: string) => ({
			data: { signedUrl: `https://supabase.test.invalid/signed/${path}` },
			error: null
		}))
		let getCoverUrl:
			| ReturnType<typeof useRecordCover>['getCoverUrl']
			| undefined
		const ResolverHarness = defineComponent({
			setup() {
				getCoverUrl = useRecordCover().getCoverUrl
				return () => h('div')
			}
		})
		await mountSuspended(ResolverHarness)
		if (!getCoverUrl) throw new Error('Cover resolver did not mount')

		for (let index = 0; index < 500; index++) {
			await getCoverUrl({
				cover: null,
				cover_storage_path: `user-1/record-${index}/cover.webp`
			})
			vi.advanceTimersByTime(1)
		}
		await getCoverUrl({
			cover: null,
			cover_storage_path: 'user-1/record-0/cover.webp'
		})
		vi.advanceTimersByTime(1)
		await getCoverUrl({
			cover: null,
			cover_storage_path: 'user-1/record-500/cover.webp'
		})
		await getCoverUrl({
			cover: null,
			cover_storage_path: 'user-1/record-0/cover.webp'
		})
		await getCoverUrl({
			cover: null,
			cover_storage_path: 'user-1/record-1/cover.webp'
		})

		expect(coverMocks.createSignedUrl).toHaveBeenCalledTimes(502)
	})
})
