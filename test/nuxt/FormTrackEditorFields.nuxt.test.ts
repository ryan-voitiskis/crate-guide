import {
	type Component,
	type PropType,
	type Ref,
	defineComponent,
	h,
	nextTick,
	ref
} from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { toTypedSchema } from '@vee-validate/zod'
import { DOMWrapper, type VueWrapper, flushPromises } from '@vue/test-utils'
import { useForm } from 'vee-validate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FormTrackEditorFields from '~/components/tracks/FormTrackEditorFields.vue'
import {
	type TrackEditorFormValues,
	createTrackEditorInitialValues,
	trackEditorSchema
} from '~/utils/trackEditor'
import type { DiscogsArtistDb } from '~~/shared/types/discogs'
import type { KeyFormat } from '~~/shared/types/supabase'

const wrappers = new Set<VueWrapper>()
const FIELD_NAMES = [
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

type HarnessState = {
	form: ReturnType<typeof useForm<TrackEditorFormValues>>
	artists: Ref<DiscogsArtistDb[]>
	extraartists: Ref<DiscogsArtistDb[]>
	keyFormat: Ref<KeyFormat>
	showValidationErrors: Ref<boolean>
}

function createHarness(options?: {
	artists?: DiscogsArtistDb[]
	extraartists?: DiscogsArtistDb[]
	keyFormat?: KeyFormat
	showValidationErrors?: boolean
}) {
	const state = {} as HarnessState
	const Harness = defineComponent({
		name: 'TrackEditorFieldsHarness',
		setup() {
			const form = useForm<TrackEditorFormValues>({
				validationSchema: toTypedSchema(trackEditorSchema),
				initialValues: createTrackEditorInitialValues()
			})
			vi.spyOn(form, 'defineField')

			const artists = ref(options?.artists ?? [])
			const extraartists = ref(options?.extraartists ?? [])
			const keyFormat = ref<KeyFormat>(options?.keyFormat ?? 'key')
			const showValidationErrors = ref(options?.showValidationErrors ?? false)
			Object.assign(state, {
				form,
				artists,
				extraartists,
				keyFormat,
				showValidationErrors
			})

			return () =>
				h(FormTrackEditorFields, {
					artists: artists.value,
					extraartists: extraartists.value,
					keyFormat: keyFormat.value,
					showValidationErrors: showValidationErrors.value,
					'onUpdate:artists': (value: DiscogsArtistDb[]) => {
						artists.value = value
					},
					'onUpdate:extraartists': (value: DiscogsArtistDb[]) => {
						extraartists.value = value
					}
				})
		}
	})

	return { Harness, state }
}

const ArtistTableStub = defineComponent({
	name: 'TableArtistsEditable',
	props: {
		modelValue: {
			type: Array as PropType<DiscogsArtistDb[]>,
			required: true
		},
		label: { type: String, required: true }
	},
	emits: {
		'update:modelValue': (_value: DiscogsArtistDb[]) => true
	},
	setup(props, { emit }) {
		return () =>
			h(
				'button',
				{
					type: 'button',
					'data-testid': `update-${props.label.toLowerCase().replaceAll(' ', '-')}`,
					onClick: () =>
						emit('update:modelValue', [...props.modelValue].reverse())
				},
				props.label
			)
	}
})

const SelectStub = defineComponent({
	name: 'Select',
	setup(_props, { slots }) {
		return () => h('div', slots.default?.())
	}
})

const SelectTriggerStub = defineComponent({
	name: 'SelectTrigger',
	setup(_props, { slots }) {
		return () =>
			h('button', { type: 'button', role: 'combobox' }, slots.default?.())
	}
})

const SelectValueStub = defineComponent({
	name: 'SelectValue',
	setup() {
		return () => h('span')
	}
})

const SelectContentStub = defineComponent({
	name: 'SelectContent',
	setup(_props, { slots }) {
		return () => h('div', slots.default?.())
	}
})

const SelectItemStub = defineComponent({
	name: 'SelectItem',
	props: { value: { type: [String, Number], default: null } },
	setup(_props, { slots }) {
		return () => h('div', { role: 'option' }, slots.default?.())
	}
})

const selectStubs = {
	Select: SelectStub,
	SelectTrigger: SelectTriggerStub,
	SelectValue: SelectValueStub,
	SelectContent: SelectContentStub,
	SelectItem: SelectItemStub
}

async function settle() {
	await nextTick()
	await flushPromises()
	await nextTick()
}

async function mountHarness(
	options?: Parameters<typeof createHarness>[0],
	stubArtists = true,
	additionalStubs: Record<string, Component> = {}
) {
	const harness = createHarness(options)
	const wrapper = await mountSuspended(harness.Harness, {
		global: {
			stubs: {
				...(stubArtists ? { TableArtistsEditable: ArtistTableStub } : {}),
				...additionalStubs
			}
		}
	})
	wrappers.add(wrapper)
	await settle()
	return { ...harness, wrapper }
}

describe('FormTrackEditorFields', () => {
	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		vi.restoreAllMocks()
		document.body.innerHTML = ''
	})

	it('registers every field exactly once and updates the parent form context', async () => {
		const { state, wrapper } = await mountHarness()
		const defineField = vi.mocked(state.form.defineField)

		expect(defineField.mock.calls.map(([field]) => field)).toEqual(FIELD_NAMES)
		expect(new Set(defineField.mock.calls.map(([field]) => field)).size).toBe(
			FIELD_NAMES.length
		)

		const nextValues: TrackEditorFormValues = {
			title: 'Updated title',
			position: 'B2',
			duration: '4:12',
			bpm: '132.5',
			keyComposite: '100',
			genres: ['Techno', 'Electro'],
			rpm: 45,
			playable: false,
			time_signature_upper: 7,
			time_signature_lower: 8
		}

		for (const [index, fieldName] of FIELD_NAMES.entries()) {
			const fieldRef = defineField.mock.results[index]?.value[0]
			expect(fieldRef).toBeDefined()
			fieldRef!.value = nextValues[fieldName]
		}
		await settle()

		expect(state.form.values).toEqual(nextValues)
		expect(state.form.meta.value.dirty).toBe(true)
		expect(wrapper.find('form').exists()).toBe(false)
		expect(wrapper.emitted('submit')).toBeUndefined()

		state.form.resetForm()
		await settle()
		expect(state.form.values).toEqual(createTrackEditorInitialValues())
		expect(state.form.meta.value.dirty).toBe(false)
	})

	it('shows validation feedback only when requested by the parent', async () => {
		const { state, wrapper } = await mountHarness()
		state.form.setFieldError('title', 'Title is required')
		await settle()

		expect(wrapper.text()).not.toContain('Title is required')
		expect(wrapper.get('input[name="title"]').classes()).not.toContain(
			'border-destructive'
		)

		state.showValidationErrors.value = true
		await settle()
		expect(wrapper.text()).toContain('Title is required')
		expect(wrapper.get('input[name="title"]').classes()).toContain(
			'border-destructive'
		)
	})

	it.each([
		{
			keyFormat: 'key' as const,
			first: 'C Minor',
			last: 'B Major'
		},
		{
			keyFormat: 'camelot' as const,
			first: '1A',
			last: '12B'
		}
	])(
		'renders all $keyFormat key options',
		async ({ keyFormat, first, last }) => {
			const { wrapper } = await mountHarness({ keyFormat }, true, selectStubs)
			const keyLabel = wrapper
				.findAll('label')
				.find((label) => label.text().trim() === 'Key')
			expect(keyLabel).toBeDefined()
			const keyField = new DOMWrapper(keyLabel!.element.parentElement!)
			const options = keyField
				.findAll('[role="option"]')
				.map((option) => option.text().trim())
			expect(options).toHaveLength(25)
			expect(options[0]).toBe('Not specified')
			expect(options[1]).toBe(first)
			expect(options[24]).toBe(last)
		}
	)

	it('updates both artist models in order without mutating their inputs', async () => {
		const artists: DiscogsArtistDb[] = [
			{ discogs_id: 1, name: 'First', role: null },
			{ discogs_id: 2, name: 'Second', role: 'Remix' }
		]
		const extraartists: DiscogsArtistDb[] = [
			{ name: 'Vocalist', role: 'Vocals' },
			{ name: 'Engineer', role: 'Mastered By' }
		]
		const artistsBefore = structuredClone(artists)
		const extraartistsBefore = structuredClone(extraartists)
		const { state, wrapper } = await mountHarness({ artists, extraartists })

		await wrapper.get('[data-testid="update-artists"]').trigger('click')
		await wrapper.get('[data-testid="update-extra-artists"]').trigger('click')
		await settle()

		expect(state.artists.value.map(({ name }) => name)).toEqual([
			'Second',
			'First'
		])
		expect(state.extraartists.value.map(({ name }) => name)).toEqual([
			'Engineer',
			'Vocalist'
		])
		expect(artists).toEqual(artistsBefore)
		expect(extraartists).toEqual(extraartistsBefore)
	})
})
