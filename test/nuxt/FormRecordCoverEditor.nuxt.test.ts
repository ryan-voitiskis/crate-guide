import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FormRecordCoverEditor from '~/components/records/FormRecordCoverEditor.vue'
import type { LibraryCoverChange } from '~~/shared/types/library'

class ControlledImage {
	static instances: ControlledImage[] = []

	decoding = ''
	naturalHeight = 0
	naturalWidth = 0
	onerror: (() => void) | null = null
	onload: (() => void) | null = null
	src = ''

	constructor() {
		ControlledImage.instances.push(this)
	}

	succeed(width: number, height: number) {
		this.naturalWidth = width
		this.naturalHeight = height
		this.onload?.()
	}
}

type CoverEditorVm = {
	getChange: () => LibraryCoverChange
	hasPendingChange: () => boolean
	reset: () => void
}

const wrappers = new Set<VueWrapper>()

function editorVm(wrapper: VueWrapper): CoverEditorVm {
	return wrapper.vm as unknown as CoverEditorVm
}

function findButton(wrapper: VueWrapper, label: string) {
	const button = wrapper
		.findAll('button')
		.find((candidate) => candidate.text().trim() === label)
	expect(button).toBeDefined()
	return button!
}

async function mountEditor(
	overrides: Parameters<typeof createMockLibraryRecord>[0] = {}
) {
	const record = createMockLibraryRecord({
		cover: { kind: 'none' },
		...overrides
	})
	const wrapper = await mountSuspended(FormRecordCoverEditor, {
		props: {
			record,
			isEditMode: true,
			modelValue: getCoverFallbackUrl(record.cover) ?? ''
		},
		global: {
			stubs: {
				ImageRecordCover: true
			}
		}
	})
	wrappers.add(wrapper)
	return wrapper
}

describe('FormRecordCoverEditor', () => {
	beforeEach(() => {
		ControlledImage.instances = []
		vi.stubGlobal('Image', ControlledImage)
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover-preview')
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it('exposes inspected upload crop state and resets its preview lifecycle', async () => {
		const wrapper = await mountEditor()
		const file = new File(['cover'], 'landscape.png', { type: 'image/png' })
		const input = wrapper.get('[data-testid="record-cover-file-input"]')
		Object.defineProperty(input.element, 'files', {
			configurable: true,
			value: [file]
		})

		await input.trigger('change')
		ControlledImage.instances.at(-1)?.succeed(1600, 1200)
		await flushPromises()
		await nextTick()

		const cropInput = wrapper.get('input[type="range"]')
		await cropInput.setValue('25')
		expect(editorVm(wrapper).hasPendingChange()).toBe(true)
		expect(editorVm(wrapper).getChange()).toEqual({
			type: 'upload',
			file,
			crop: { positionX: 25, positionY: 50 }
		})

		editorVm(wrapper).reset()
		await nextTick()
		expect(editorVm(wrapper).hasPendingChange()).toBe(false)
		expect(editorVm(wrapper).getChange()).toEqual({ type: 'keep' })
		expect(wrapper.find('input[type="range"]').exists()).toBe(false)
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:cover-preview')
	})

	it('reports storage removal while keeping URL edits in the model contract', async () => {
		const uploadedWrapper = await mountEditor({
			cover: {
				kind: 'cloud',
				assetId: 'user-a/record-1/cover.webp',
				fallbackUrl: 'https://example.com/fallback.jpg'
			}
		})

		await findButton(uploadedWrapper, 'Remove cover').trigger('click')
		expect(editorVm(uploadedWrapper).hasPendingChange()).toBe(true)
		expect(editorVm(uploadedWrapper).getChange()).toEqual({ type: 'remove' })

		const urlWrapper = await mountEditor({
			cover: { kind: 'external', url: 'https://example.com/original.jpg' }
		})
		await findButton(urlWrapper, 'Image URL').trigger('click')
		await urlWrapper
			.get('#record-cover-url')
			.setValue('https://example.com/replacement.jpg')

		expect(urlWrapper.emitted('update:modelValue')?.at(-1)).toEqual([
			'https://example.com/replacement.jpg'
		])
		expect(editorVm(urlWrapper).getChange()).toEqual({ type: 'keep' })

		await findButton(urlWrapper, 'Remove cover').trigger('click')
		expect(urlWrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
	})
})
