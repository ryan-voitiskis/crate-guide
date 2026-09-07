import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { createTestingPinia } from '@pinia/testing'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import type { Pinia } from 'pinia'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { createMockTrack } from 'test/mocks/fixtures/tracks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DialogTrackEdit from '~/components/records/DialogTrackEdit.vue'
import DialogTrackDetails from '~/components/tracks/DialogTrackDetails.vue'
import { useRecordsStore } from '~/stores/recordsStore'
import { useTrackEditStore } from '~/stores/trackEditStore'
import { useTracksStore } from '~/stores/tracksStore'
import { createTrackEditorInitialValues } from '~/utils/trackEditor'
import type { LibraryRecord, LibraryTrack } from '~~/shared/types/library'

const wrappers = new Set<VueWrapper>()
const COMMON_FIELD_NAMES = [
	'title',
	'position',
	'duration',
	'bpm',
	'keyComposite',
	'genres',
	'rpm',
	'playable',
	'time_signature_upper',
	'time_signature_lower'
] as const

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, reject, resolve }
}

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
	const record = createMockLibraryRecord({
		id: 'record-1',
		title: 'Editor Test Record',
		cover: { kind: 'none' }
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
		artists: [
			{ discogs_id: 1, name: 'Test Artist', role: null },
			{ discogs_id: 2, name: 'Second Artist', role: 'Remix' }
		],
		extraartists: [
			{ name: 'Guest Artist', role: 'Vocals' },
			{ name: 'Engineer', role: 'Mastered By' }
		]
	})

	return { record, track }
}

function createEditorPinia(options: {
	record: LibraryRecord
	track: LibraryTrack
	mode: 'add' | 'edit' | 'details'
}) {
	const pinia = createTestingPinia({
		createSpy: vi.fn,
		stubActions: (_actionName, store) => store.$id !== 'trackEdit',
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

	it('uses the exact shared form field contract in both editors', async () => {
		expect(Object.keys(createTrackEditorInitialValues())).toEqual(
			COMMON_FIELD_NAMES
		)

		const editDialog = await mountAddOrEditDialog('edit')
		expect(
			getBody()
				.findAll('input[name]')
				.map((input) => input.attributes('name'))
		).toEqual(['title', 'position', 'duration', 'bpm'])
		unmountWrapper(editDialog.wrapper)

		await mountDetailsDialog()
		await enterDetailsEditMode()
		expect(
			getBody()
				.findAll('input[name]')
				.map((input) => input.attributes('name'))
		).toEqual(['title', 'position', 'duration', 'bpm'])
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
			position: 'B2',
			duration: 225000,
			bpm: 128.5
		})
	})

	it('preserves each dialog validation visibility policy', async () => {
		const addDialog = await mountAddOrEditDialog('add')
		expect(getBody().text()).not.toContain('Title is required')
		await getButton('Add Track').trigger('click')
		await vi.waitFor(() => {
			expect(getBody().text()).toContain('Title is required')
		})
		unmountWrapper(addDialog.wrapper)

		await mountDetailsDialog()
		await enterDetailsEditMode()
		await getBody().get('input[name="title"]').setValue('')
		await vi.waitFor(() => {
			expect(getBody().text()).toContain('Title is required')
		})
		expect(getButton('Save Changes').attributes('disabled')).toBeDefined()
	})

	it('keeps dirty cancel and discard behavior in both editors', async () => {
		const editDialog = await mountAddOrEditDialog('edit')
		await getBody().get('input[name="duration"]').setValue('3:01')
		await getButton('Cancel').trigger('click')
		await settleDialog()

		expect(getBody().text()).toContain('Unsaved Changes')
		await getButton('Keep Editing').trigger('click')
		await settleDialog()
		expect(getBody().get('input[name="duration"]').element).toHaveProperty(
			'value',
			'3:01'
		)
		await getButton('Cancel').trigger('click')
		await getButton('Discard Changes').trigger('click')
		await settleDialog()
		expect(editDialog.trackEdit.closeTrackDialog).toHaveBeenCalledOnce()
		unmountWrapper(editDialog.wrapper)

		const detailsDialog = await mountDetailsDialog()
		await enterDetailsEditMode()
		await getBody().get('input[name="duration"]').setValue('3:01')
		await getButton('Cancel').trigger('click')
		await settleDialog()
		expect(getBody().text()).toContain('Unsaved Changes')
		await getButton('Discard Changes').trigger('click')
		await settleDialog()

		expect(detailsDialog.wrapper.emitted('close')).toEqual([[]])
		expect(getBody().find('input[name="duration"]').exists()).toBe(false)
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

	it.each(['success', 'failure'] as const)(
		'keeps a newer track edit open when an older submission settles with %s',
		async (outcome) => {
			const editDialog = await mountAddOrEditDialog('edit')
			const replacementTrack = createMockTrack({
				...editDialog.track,
				id: 'track-2',
				title: 'Replacement Track',
				position: 'B1'
			})
			const firstUpdate = createDeferred<LibraryTrack | null>()
			const secondUpdate = createDeferred<LibraryTrack | null>()
			vi.mocked(editDialog.tracks.getTrackById).mockImplementation((id) => {
				if (id === editDialog.track.id) return editDialog.track
				if (id === replacementTrack.id) return replacementTrack
				return undefined
			})
			vi.mocked(editDialog.tracks.updateTrack)
				.mockReturnValueOnce(firstUpdate.promise)
				.mockReturnValueOnce(secondUpdate.promise)

			await getButton('Update Track').trigger('click')
			await vi.waitFor(() => {
				expect(editDialog.tracks.updateTrack).toHaveBeenCalledOnce()
			})
			await getButton('Close').trigger('click')
			await settleDialog()
			editDialog.trackEdit.openEditTrackDialog(replacementTrack.id)
			await settleDialog()

			expect(
				(getBody().get('input[name="title"]').element as HTMLInputElement).value
			).toBe('Replacement Track')
			await getButton('Update Track').trigger('click')
			await vi.waitFor(() => {
				expect(editDialog.tracks.updateTrack).toHaveBeenCalledTimes(2)
			})
			expect(getButton('Update Track').attributes('aria-busy')).toBe('true')

			if (outcome === 'success') firstUpdate.resolve(editDialog.track)
			else firstUpdate.reject(new Error('First track update failed'))
			await settleDialog()

			expect(editDialog.trackEdit.isDialogOpen).toBe(true)
			expect(editDialog.trackEdit.editingTrackId).toBe(replacementTrack.id)
			expect(
				(getBody().get('input[name="title"]').element as HTMLInputElement).value
			).toBe('Replacement Track')
			expect(getButton('Update Track').attributes('aria-busy')).toBe('true')

			secondUpdate.resolve(null)
			await settleDialog()
		}
	)

	it.each(['success', 'failure'] as const)(
		'keeps a newer track-details editor active when an older save settles with %s',
		async (outcome) => {
			const detailsDialog = await mountDetailsDialog()
			const replacementTrack = createMockTrack({
				...detailsDialog.track,
				id: 'track-2',
				title: 'Replacement Details Track',
				position: 'B1'
			})
			const firstUpdate = createDeferred<LibraryTrack | null>()
			const secondUpdate = createDeferred<LibraryTrack | null>()
			vi.mocked(detailsDialog.tracks.getTrackById).mockImplementation((id) => {
				if (id === detailsDialog.track.id) return detailsDialog.track
				if (id === replacementTrack.id) return replacementTrack
				return undefined
			})
			vi.mocked(detailsDialog.tracks.updateTrack)
				.mockReturnValueOnce(firstUpdate.promise)
				.mockReturnValueOnce(secondUpdate.promise)

			await enterDetailsEditMode()
			await vi.waitFor(() => {
				expect(getButton('Save Changes').attributes('disabled')).toBeUndefined()
			})
			await getButton('Save Changes').trigger('click')
			await vi.waitFor(() => {
				expect(detailsDialog.tracks.updateTrack).toHaveBeenCalledOnce()
			})
			await detailsDialog.wrapper.setProps({ trackId: null })
			await settleDialog()
			await detailsDialog.wrapper.setProps({ trackId: replacementTrack.id })
			await settleDialog()
			await enterDetailsEditMode()
			await vi.waitFor(() => {
				expect(getButton('Save Changes').attributes('disabled')).toBeUndefined()
			})

			expect(
				(getBody().get('input[name="title"]').element as HTMLInputElement).value
			).toBe('Replacement Details Track')
			await getButton('Save Changes').trigger('click')
			await vi.waitFor(() => {
				expect(detailsDialog.tracks.updateTrack).toHaveBeenCalledTimes(2)
			})
			expect(getButton('Save Changes').attributes('aria-busy')).toBe('true')

			firstUpdate.resolve(outcome === 'success' ? detailsDialog.track : null)
			await settleDialog()

			expect(getButton('Cancel Edit').exists()).toBe(true)
			expect(
				(getBody().get('input[name="title"]').element as HTMLInputElement).value
			).toBe('Replacement Details Track')
			expect(getButton('Save Changes').attributes('aria-busy')).toBe('true')

			secondUpdate.resolve(null)
			await settleDialog()
		}
	)
	it.each(['edit', 'details'] as const)(
		'saves only changed fields from the immutable %s editor baseline',
		async (surface) => {
			const editor =
				surface === 'edit'
					? await mountAddOrEditDialog('edit')
					: await mountDetailsDialog()
			if (surface === 'details') await enterDetailsEditMode()
			const baselineUpdatedAt = editor.track.updated_at
			editor.track.bpm = 140
			editor.track.updated_at = '2026-09-07T12:00:00.000001Z'
			vi.mocked(editor.tracks.updateTrack).mockResolvedValue(editor.track)
			await getBody().get('input[name="title"]').setValue('Retitled Track')
			await getButton(
				surface === 'edit' ? 'Update Track' : 'Save Changes'
			).trigger('click')
			await vi.waitFor(() =>
				expect(editor.tracks.updateTrack).toHaveBeenCalledOnce()
			)
			const [, patch, options] = vi.mocked(editor.tracks.updateTrack).mock
				.calls[0]!
			expect(patch).toEqual({ title: 'Retitled Track' })
			expect(options).toMatchObject({ expectedUpdatedAt: baselineUpdatedAt })
		}
	)
	it.each(
		(['edit', 'details'] as const).flatMap((surface) =>
			[null, 0, 180, 180999].map((duration) => ({ surface, duration }))
		)
	)(
		'keeps the $surface editor input and the latest $duration millisecond duration through conflict review',
		async ({ surface, duration }) => {
			const editor =
				surface === 'edit'
					? await mountAddOrEditDialog('edit')
					: await mountDetailsDialog()
			if (surface === 'details') await enterDetailsEditMode()
			const saveLabel = surface === 'edit' ? 'Update Track' : 'Save Changes'
			const latest = createMockTrack({
				...editor.track,
				title: 'Title from another editor',
				duration,
				bpm: 140,
				updated_at: '2026-09-07T12:00:00.000001Z'
			})
			vi.mocked(editor.tracks.updateTrack).mockImplementationOnce(
				async (_id, _patch, options) => {
					options?.onConflict?.(latest)
					return null
				}
			)
			await getBody().get('input[name="title"]').setValue('My title')
			await getButton(saveLabel).trigger('click')
			await vi.waitFor(() =>
				expect(getBody().text()).toContain(
					'This track changed while you were editing.'
				)
			)
			expect(getBody().text()).toContain('Title from another editor')
			expect(getBody().text()).toContain('140')
			expect(getBody().get('input[name="title"]').element).toHaveProperty(
				'value',
				'My title'
			)
			expect(getButton(saveLabel).attributes('disabled')).toBeDefined()
			await getButton('Keep my edits and review').trigger('click')
			await settleDialog()
			expect(getBody().get('input[name="title"]').element).toHaveProperty(
				'value',
				'My title'
			)
			expect(getBody().get('input[name="bpm"]').element).toHaveProperty(
				'value',
				'140'
			)
			vi.mocked(editor.tracks.updateTrack).mockResolvedValueOnce({
				...latest,
				title: 'My title'
			})
			await getButton(saveLabel).trigger('click')
			await vi.waitFor(() =>
				expect(editor.tracks.updateTrack).toHaveBeenCalledTimes(2)
			)
			expect(vi.mocked(editor.tracks.updateTrack).mock.calls[1]).toEqual([
				editor.track.id,
				{ title: 'My title' },
				expect.objectContaining({ expectedUpdatedAt: latest.updated_at })
			])
		}
	)
})
