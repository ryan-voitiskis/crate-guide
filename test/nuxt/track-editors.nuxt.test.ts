import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogTrackEdit from '~/components/records/DialogTrackEdit.vue'
import DialogTrackDetails from '~/components/tracks/DialogTrackDetails.vue'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTrackEditStore } from '~/stores/trackEditStore'
import { useTracksStore } from '~/stores/tracksStore'
import type { DatabaseRecord, Track } from '~~/shared/types/supabase'

const wrappers = new Set<VueWrapper>()

function getBody() {
	return new DOMWrapper(document.body)
}

function getButton(text: string) {
	const button = getBody()
		.findAll('button')
		.find((candidate) => candidate.text().trim() === text)
	expect(button).toBeDefined()
	return button!
}

async function settleDialog() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

function createEditorFixture() {
	const record = createMockRecord({
		id: 'record-1',
		title: 'Editor Test Record',
		cover: null
	})
	const track = createMockTrack({
		id: 'track-1',
		record_id: record.id,
		title: 'Original Track',
		position: 'A1',
		duration: 180000,
		bpm: 128,
		rpm: 33,
		key: 0,
		mode: 0,
		genres: ['House'],
		time_signature_upper: 4,
		time_signature_lower: 4,
		artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
		extraartists: [{ name: 'Guest Artist', role: 'Vocals' }]
	})

	return { record, track }
}

function createEditorPinia(options: {
	record: DatabaseRecord
	track: Track
	mode: 'add' | 'edit' | 'details'
}) {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: (actionName, store) =>
			!(store.$id === 'trackEdit' && actionName === 'openAddTrackDialog'),
		initialState: {
			tracks: { tracks: [options.track] },
			records: { records: [options.record] },
			trackEdit: {
				editingTrackId: options.mode === 'edit' ? options.track.id : null
			},
			recordDetails: { selectedRecordId: options.record.id }
		}
	})
	const tracks = useTracksStore(pinia as Pinia)
	const records = useRecordsStore(pinia as Pinia)
	const trackEdit = useTrackEditStore(pinia as Pinia)
	if (options.mode === 'add') trackEdit.openAddTrackDialog()

	vi.mocked(tracks.getTrackById).mockImplementation((id) =>
		id === options.track.id ? options.track : undefined
	)
	vi.mocked(records.getRecordById).mockImplementation((id) =>
		id === options.record.id ? options.record : undefined
	)

	return { pinia, tracks, trackEdit }
}

async function mountAddOrEditDialog(mode: 'add' | 'edit') {
	const fixture = createEditorFixture()
	const stores = createEditorPinia({ ...fixture, mode })
	const wrapper = await mountSuspended(DialogTrackEdit, {
		global: { plugins: [stores.pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { ...fixture, ...stores, wrapper }
}

async function mountDetailsDialog() {
	const fixture = createEditorFixture()
	const stores = createEditorPinia({ ...fixture, mode: 'details' })
	const wrapper = await mountSuspended(DialogTrackDetails, {
		props: { trackId: fixture.track.id },
		global: { plugins: [stores.pinia] }
	})
	wrappers.add(wrapper)
	await settleDialog()

	return { ...fixture, ...stores, wrapper }
}

async function enterDetailsEditMode() {
	await getButton('Edit Track').trigger('click')
	await settleDialog()
}

async function setCommonEditedFields() {
	const body = getBody()
	await body.get('input[name="title"]').setValue('  Normalized Track  ')
	await body.get('input[name="position"]').setValue(' B2 ')
	await body.get('input[name="duration"]').setValue('3:45')
	await body.get('input[name="bpm"]').setValue('128.5')
	await settleDialog()
}

function unmountWrapper(wrapper: VueWrapper) {
	wrapper.unmount()
	wrappers.delete(wrapper)
	document.body.innerHTML = ''
}

describe('track editor dialogs', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('closes both editors without a warning when non-zero duration is unchanged', async () => {
		const editDialog = await mountAddOrEditDialog('edit')
		expect(getBody().get('[data-slot="dialog-title"]').text()).toBe(
			'Edit Track'
		)

		await getButton('Close').trigger('click')
		await settleDialog()

		expect(editDialog.trackEdit.closeTrackDialog).toHaveBeenCalledOnce()
		expect(getBody().find('[data-slot="alert-dialog-content"]').exists()).toBe(
			false
		)
		unmountWrapper(editDialog.wrapper)

		const detailsDialog = await mountDetailsDialog()
		await enterDetailsEditMode()
		await getButton('Close').trigger('click')
		await settleDialog()

		expect(detailsDialog.wrapper.emitted('close')).toEqual([[]])
		expect(getBody().find('[data-slot="alert-dialog-content"]').exists()).toBe(
			false
		)
	})

	it('warns in both editors when only duration changes', async () => {
		const editDialog = await mountAddOrEditDialog('edit')
		await getBody().get('input[name="duration"]').setValue('3:01')
		await getButton('Close').trigger('click')
		await settleDialog()

		expect(
			getBody().get('[data-slot="alert-dialog-content"]').text()
		).toContain('Unsaved Changes')
		expect(editDialog.trackEdit.closeTrackDialog).not.toHaveBeenCalled()
		unmountWrapper(editDialog.wrapper)

		const detailsDialog = await mountDetailsDialog()
		await enterDetailsEditMode()
		await getBody().get('input[name="duration"]').setValue('3:01')
		await getButton('Close').trigger('click')
		await settleDialog()

		expect(
			getBody().get('[data-slot="alert-dialog-content"]').text()
		).toContain('Unsaved Changes')
		expect(detailsDialog.wrapper.emitted('close')).toBeUndefined()
	})

	it('normalizes the same common update payload in both dialogs', async () => {
		const editDialog = await mountAddOrEditDialog('edit')
		vi.mocked(editDialog.tracks.updateTrack).mockResolvedValue(editDialog.track)
		await setCommonEditedFields()
		await getButton('Update Track').trigger('click')
		await vi.waitFor(() => {
			expect(editDialog.tracks.updateTrack).toHaveBeenCalledOnce()
		})
		const editPayload = vi.mocked(editDialog.tracks.updateTrack).mock
			.calls[0]?.[1]
		unmountWrapper(editDialog.wrapper)

		const detailsDialog = await mountDetailsDialog()
		vi.mocked(detailsDialog.tracks.updateTrack).mockResolvedValue(
			detailsDialog.track
		)
		await enterDetailsEditMode()
		await setCommonEditedFields()
		await getButton('Save Changes').trigger('click')
		await vi.waitFor(() => {
			expect(detailsDialog.tracks.updateTrack).toHaveBeenCalledOnce()
		})
		const detailsPayload = vi.mocked(detailsDialog.tracks.updateTrack).mock
			.calls[0]?.[1]

		expect(editPayload).toEqual(detailsPayload)
		expect(editPayload).toEqual({
			title: 'Normalized Track',
			artists: [{ discogs_id: 1, name: 'Test Artist', role: null }],
			extraartists: [{ name: 'Guest Artist', role: 'Vocals' }],
			position: 'B2',
			duration: 225000,
			bpm: 128.5,
			rpm: 33,
			key: 0,
			mode: 0,
			genres: ['House'],
			time_signature_upper: 4,
			time_signature_lower: 4,
			playable: true
		})
	})

	it('keeps add-only record and legacy fields outside the common payload', async () => {
		const addDialog = await mountAddOrEditDialog('add')
		vi.mocked(addDialog.tracks.createTrack).mockResolvedValue(addDialog.track)
		const body = getBody()

		expect(body.get('[data-slot="dialog-title"]').text()).toBe('Add Track')
		expect(getButton('Add Track').exists()).toBe(true)
		await body.get('input[name="title"]').setValue('  New Track  ')
		await getButton('Add Track').trigger('click')
		await vi.waitFor(() => {
			expect(addDialog.tracks.createTrack).toHaveBeenCalledOnce()
		})

		expect(addDialog.tracks.createTrack).toHaveBeenCalledWith({
			record_id: addDialog.record.id,
			title: 'New Track',
			artists: [],
			extraartists: [],
			position: null,
			duration: null,
			bpm: null,
			rpm: null,
			key: null,
			mode: null,
			genres: [],
			time_signature_upper: null,
			time_signature_lower: null,
			playable: true,
			beatport_data: null
		})
	})

	it('retains the details dialog read-only shell and edit controls', async () => {
		await mountDetailsDialog()
		const body = getBody()

		expect(body.get('[data-slot="dialog-title"]').text()).toBe('Track Details')
		expect(body.text()).toContain('Original Track')
		expect(getButton('Edit Track').exists()).toBe(true)
		expect(
			body
				.findAll('button')
				.some((button) => button.text().trim() === 'Save Changes')
		).toBe(false)

		await enterDetailsEditMode()

		expect(getButton('Cancel Edit').exists()).toBe(true)
		expect(getButton('Save Changes').exists()).toBe(true)
	})
})
