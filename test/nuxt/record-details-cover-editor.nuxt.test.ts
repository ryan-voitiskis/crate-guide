import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DialogRecordDetails from '~/components/records/DialogRecordDetails.vue'
import { useRecordDetailsStore } from '~/stores/recordDetailsStore'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTracksStore } from '~/stores/tracksStore'
import type { DatabaseRecord } from '~~/shared/types/supabase'

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

	succeed(width = 1200, height = 1200) {
		this.naturalWidth = width
		this.naturalHeight = height
		this.onload?.()
	}

	fail() {
		this.onerror?.()
	}
}

const wrappers = new Set<VueWrapper>()
let objectUrlSequence = 0

function getBody() {
	return new DOMWrapper(document.body)
}

function findButton(label: string) {
	const button = getBody()
		.findAll('button')
		.find((candidate) => candidate.text().trim() === label)
	expect(button).toBeDefined()
	return button!
}

function hasImageSource(source: string) {
	return getBody()
		.findAll('img')
		.some((image) => image.attributes('src') === source)
}

function revokedUrls() {
	return vi.mocked(URL.revokeObjectURL).mock.calls.map(([source]) => source)
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountDialog(overrides: Partial<DatabaseRecord> = {}) {
	const record = createMockRecord({
		id: 'record-cover-editor',
		cover: null,
		cover_storage_path: null,
		...overrides
	})
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: true,
		initialState: {
			records: { records: [record] },
			recordDetails: {
				selectedRecordId: record.id,
				isEditMode: true
			},
			tracks: { tracks: [] }
		}
	})
	const records = useRecordsStore(pinia as Pinia)
	const tracks = useTracksStore(pinia as Pinia)
	vi.mocked(records.getRecordById).mockImplementation((id) =>
		id === record.id ? record : undefined
	)
	vi.mocked(tracks.getTracksByRecordId).mockReturnValue([])
	const recordDetails = useRecordDetailsStore(pinia as Pinia)
	recordDetails.selectedRecordId = record.id
	recordDetails.isEditMode = true

	const wrapper = await mountSuspended(DialogRecordDetails, {
		global: { plugins: [pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { recordDetails, wrapper }
}

async function chooseFile(name: string, type = 'image/png') {
	const file = new File(['cover'], name, { type })
	const input = getBody().get('[data-testid="record-cover-file-input"]')
	Object.defineProperty(input.element, 'files', {
		configurable: true,
		value: [file]
	})
	await input.trigger('change')
	await nextTick()

	const image = ControlledImage.instances.at(-1)
	const previewUrl = vi.mocked(URL.createObjectURL).mock.results.at(-1)?.value
	return { file, image, previewUrl }
}

function unmountWrapper(wrapper: VueWrapper) {
	wrapper.unmount()
	wrappers.delete(wrapper)
	document.body.innerHTML = ''
}

describe('record details cover inspection', () => {
	beforeEach(() => {
		ControlledImage.instances = []
		objectUrlSequence = 0
		vi.stubGlobal('Image', ControlledImage)
		vi.spyOn(URL, 'createObjectURL').mockImplementation(
			(file) => `blob:${(file as File).name}:${++objectUrlSequence}`
		)
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it('keeps the newest success when an older inspection finishes later', async () => {
		const { wrapper } = await mountDialog()
		const first = await chooseFile('first.png')
		const second = await chooseFile('second.png')

		second.image?.succeed(1600, 1200)
		await settleDialog()
		expect(hasImageSource(second.previewUrl)).toBe(true)
		expect(revokedUrls()).not.toContain(second.previewUrl)

		first.image?.succeed(1200, 1200)
		await settleDialog()
		expect(hasImageSource(second.previewUrl)).toBe(true)
		expect(
			revokedUrls().filter((url) => url === first.previewUrl)
		).toHaveLength(1)

		unmountWrapper(wrapper)
		expect(
			revokedUrls().filter((url) => url === second.previewUrl)
		).toHaveLength(1)
	})

	it('ignores an older inspection error after the newest file succeeds', async () => {
		await mountDialog()
		const first = await chooseFile('first.png')
		const second = await chooseFile('second.png')

		second.image?.succeed()
		await settleDialog()
		first.image?.fail()
		await settleDialog()

		expect(hasImageSource(second.previewUrl)).toBe(true)
		expect(getBody().text()).not.toContain('The image could not be decoded.')
		expect(
			revokedUrls().filter((url) => url === first.previewUrl)
		).toHaveLength(1)
	})

	it('lets an invalid newer selection invalidate a pending inspection', async () => {
		await mountDialog()
		const first = await chooseFile('first.png')
		const imageCount = ControlledImage.instances.length

		await chooseFile('invalid.gif', 'image/gif')
		expect(ControlledImage.instances).toHaveLength(imageCount)
		expect(getBody().text()).toContain('Choose a JPG, PNG or WebP image.')

		first.image?.succeed()
		await settleDialog()
		expect(getBody().text()).toContain('Choose a JPG, PNG or WebP image.')
		expect(hasImageSource(first.previewUrl)).toBe(false)
		expect(
			revokedUrls().filter((url) => url === first.previewUrl)
		).toHaveLength(1)
	})

	it('invalidates pending inspection when resetting or removing the cover', async () => {
		const resetDialog = await mountDialog()
		const resetInspection = await chooseFile('reset.png')
		await findButton('Cancel Edit').trigger('click')
		resetInspection.image?.succeed()
		await settleDialog()
		expect(hasImageSource(resetInspection.previewUrl)).toBe(false)
		expect(
			revokedUrls().filter((url) => url === resetInspection.previewUrl)
		).toHaveLength(1)
		unmountWrapper(resetDialog.wrapper)

		const removeDialog = await mountDialog({
			cover: 'https://example.com/current.jpg'
		})
		const removeInspection = await chooseFile('remove.png')
		await findButton('Remove cover').trigger('click')
		removeInspection.image?.succeed()
		await settleDialog()
		expect(hasImageSource(removeInspection.previewUrl)).toBe(false)
		expect(
			revokedUrls().filter((url) => url === removeInspection.previewUrl)
		).toHaveLength(1)
		unmountWrapper(removeDialog.wrapper)
	})

	it('invalidates pending inspection when switching to URL mode', async () => {
		await mountDialog()
		const pending = await chooseFile('pending.png')

		await findButton('Image URL').trigger('click')
		pending.image?.succeed()
		await settleDialog()

		expect(getBody().find('#record-cover-url').exists()).toBe(true)
		expect(hasImageSource(pending.previewUrl)).toBe(false)
		expect(
			revokedUrls().filter((url) => url === pending.previewUrl)
		).toHaveLength(1)
	})

	it('invalidates and revokes a pending inspection after unmount', async () => {
		const { wrapper } = await mountDialog()
		const pending = await chooseFile('unmount.png')

		unmountWrapper(wrapper)
		pending.image?.succeed()
		await flushPromises()

		expect(
			revokedUrls().filter((url) => url === pending.previewUrl)
		).toHaveLength(1)
	})

	it('keeps a current success live with dimensions and centered crop', async () => {
		await mountDialog()
		const current = await chooseFile('landscape.png')

		current.image?.succeed(1600, 1200)
		await settleDialog()

		expect(hasImageSource(current.previewUrl)).toBe(true)
		expect(getBody().text()).toContain('Square crop position')
		expect(getBody().text()).toContain('Horizontal')
		expect(
			(getBody().get('input[type="range"]').element as HTMLInputElement).value
		).toBe('50')
		expect(revokedUrls()).not.toContain(current.previewUrl)
	})

	it('reports and revokes a current decode failure exactly once', async () => {
		await mountDialog()
		const current = await chooseFile('broken.png')

		current.image?.fail()
		await settleDialog()

		expect(getBody().text()).toContain('The image could not be decoded.')
		expect(
			revokedUrls().filter((url) => url === current.previewUrl)
		).toHaveLength(1)
	})
})
