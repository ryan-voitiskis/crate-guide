import { type PropType, defineComponent, h } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ImageRecordCover from '~/components/records/ImageRecordCover.vue'
import type { CoverReference, LibraryRecord } from '~~/shared/types/library'

const coverMocks = vi.hoisted(() => {
	const state = {
		context: { id: 'workspace-a' },
		resolve: vi.fn()
	}
	return {
		state,
		runtime: {
			capture: vi.fn(() => ({
				context: state.context,
				repositories: { covers: { resolve: state.resolve } }
			})),
			isCurrent: vi.fn((context) => context === state.context)
		}
	}
})

mockNuxtImport('useWorkbenchRuntime', () => () => coverMocks.runtime)

const TwoRecordCovers = defineComponent({
	props: {
		record: {
			type: Object as PropType<Pick<LibraryRecord, 'cover' | 'title'>>,
			required: true
		}
	},
	setup(props) {
		return () =>
			h('div', [
				h(ImageRecordCover, { record: props.record }),
				h(ImageRecordCover, { record: props.record })
			])
	}
})

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createRecord(cover: CoverReference) {
	return createMockLibraryRecord({ cover })
}

describe('record cover presentation', () => {
	beforeEach(() => {
		coverMocks.state.context = { id: 'workspace-a' }
		coverMocks.state.resolve
			.mockReset()
			.mockImplementation(
				async (_context: unknown, reference: CoverReference) => {
					if (reference.kind === 'external') return reference.url
					if (reference.kind === 'cloud' || reference.kind === 'browser') {
						return reference.fallbackUrl
					}
					return null
				}
			)
		coverMocks.runtime.capture.mockClear()
		coverMocks.runtime.isCurrent.mockClear()
	})

	afterEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
	})

	it('states clearly when artwork is missing', async () => {
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createRecord({ kind: 'none' }),
				showLabel: true
			}
		})

		expect(wrapper.text()).toContain('No cover artwork')
		expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe(
			'No cover artwork'
		)
	})

	it('renders the active repository resolver result', async () => {
		coverMocks.state.resolve.mockResolvedValueOnce(
			'https://assets.example/resolved.webp'
		)
		const record = createRecord({
			kind: 'cloud',
			assetId: 'record-1/custom.webp',
			fallbackUrl: 'https://assets.example/fallback.jpg'
		})
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: { record }
		})
		await flushPromises()

		expect(coverMocks.state.resolve).toHaveBeenCalledWith(
			coverMocks.state.context,
			record.cover
		)
		expect(wrapper.get('img').attributes('src')).toBe(
			'https://assets.example/resolved.webp'
		)
	})

	it('uses the reference fallback when a resolver throws', async () => {
		coverMocks.state.resolve.mockRejectedValueOnce(new Error('Unavailable'))
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createRecord({
					kind: 'browser',
					assetId: 'cover-1',
					fallbackUrl: 'https://assets.example/fallback.jpg'
				})
			}
		})
		await flushPromises()

		expect(wrapper.get('img').attributes('src')).toBe(
			'https://assets.example/fallback.jpg'
		)
	})

	it('replaces a failed image with an unavailable state', async () => {
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createRecord({
					kind: 'external',
					url: 'https://assets.example/cover.jpg'
				}),
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

	it('delegates each mounted cover to the repository boundary', async () => {
		const record = createRecord({
			kind: 'external',
			url: 'https://assets.example/shared.jpg'
		})
		const wrapper = await mountSuspended(TwoRecordCovers, {
			props: { record }
		})
		await flushPromises()

		expect(wrapper.findAllComponents(ImageRecordCover)).toHaveLength(2)
		expect(coverMocks.state.resolve).toHaveBeenCalledTimes(2)
	})

	it('cannot publish a late URL into a recycled cover component', async () => {
		const deferred = createDeferred<string | null>()
		coverMocks.state.resolve.mockReturnValueOnce(deferred.promise)
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createRecord({
					kind: 'cloud',
					assetId: 'slow.webp',
					fallbackUrl: 'https://assets.example/first.jpg'
				})
			}
		})

		await wrapper.setProps({
			record: createRecord({
				kind: 'external',
				url: 'https://assets.example/second.jpg'
			})
		})
		await flushPromises()
		expect(wrapper.get('img').attributes('src')).toBe(
			'https://assets.example/second.jpg'
		)

		deferred.resolve('https://assets.example/late.webp')
		await flushPromises()
		expect(wrapper.get('img').attributes('src')).toBe(
			'https://assets.example/second.jpg'
		)
	})

	it('rejects a resolver result from a replaced workspace', async () => {
		const deferred = createDeferred<string | null>()
		coverMocks.state.resolve.mockReturnValueOnce(deferred.promise)
		const wrapper = await mountSuspended(ImageRecordCover, {
			props: {
				record: createRecord({
					kind: 'cloud',
					assetId: 'workspace-a.webp',
					fallbackUrl: null
				}),
				showLabel: true
			}
		})

		coverMocks.state.context = { id: 'workspace-b' }
		deferred.resolve('https://assets.example/stale.webp')
		await flushPromises()

		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.text()).toContain('No cover artwork')
	})
})
