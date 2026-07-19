<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import type { TrackEditorFormValues } from '~/utils/trackEditor'
import type { DiscogsArtistDb } from '~~/shared/types/discogs'
import type { KeyFormat } from '~~/shared/types/supabase'

const props = defineProps<{
	keyFormat: KeyFormat
	showValidationErrors: boolean
}>()

const artists = defineModel<DiscogsArtistDb[]>('artists', { required: true })
const extraartists = defineModel<DiscogsArtistDb[]>('extraartists', {
	required: true
})

const form = useFormContext<TrackEditorFormValues>()
const { errors } = form
const [titleValue] = form.defineField('title')
const [positionValue] = form.defineField('position')
const [durationValue] = form.defineField('duration')
const [bpmValue] = form.defineField('bpm')
const [keyCompositeValue] = form.defineField('keyComposite')
const [genresValue] = form.defineField('genres')
const [rpmValue] = form.defineField('rpm')
const [playableValue] = form.defineField('playable')
const [timeSignatureUpperValue] = form.defineField('time_signature_upper')
const [timeSignatureLowerValue] = form.defineField('time_signature_lower')

const keyOptions = computed(() => getKeyOptionsForComposite(props.keyFormat))
</script>

<template>
	<!-- Basic Track Info -->
	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2">
			<Label for="title">
				Title
				<span class="text-primary -ml-0.5">*</span>
			</Label>
			<FormItem>
				<Input
					id="title"
					v-model="titleValue"
					name="title"
					placeholder="Track title"
					:class="{
						'border-destructive': !!errors.title && showValidationErrors
					}"
					required
				/>
				<p
					v-if="errors.title && showValidationErrors"
					class="text-destructive text-sm"
				>
					{{ errors.title }}
				</p>
			</FormItem>
		</div>

		<div class="space-y-2">
			<Label for="position">Position</Label>
			<FormItem>
				<Input
					id="position"
					v-model="positionValue"
					name="position"
					placeholder="A1, B2, etc."
					:class="{
						'border-destructive': !!errors.position && showValidationErrors
					}"
				/>
				<p
					v-if="errors.position && showValidationErrors"
					class="text-destructive text-sm"
				>
					{{ errors.position }}
				</p>
			</FormItem>
		</div>
	</div>

	<!-- Artists Section -->
	<TableArtistsEditable
		v-model="artists"
		:is-edit-mode="true"
		label="Artists"
	/>

	<!-- Extra Artists Section -->
	<TableArtistsEditable
		v-model="extraartists"
		:is-edit-mode="true"
		label="Extra Artists"
	/>

	<!-- Genres -->
	<div class="space-y-2">
		<Label>Genres</Label>
		<TagsInput v-model="genresValue">
			<TagsInputItem
				v-for="(genre, index) in genresValue"
				:key="`genre-${index}`"
				:value="genre"
			>
				<TagsInputItemText>{{ genre }}</TagsInputItemText>
				<TagsInputItemDelete />
			</TagsInputItem>
			<TagsInputInput placeholder="Add genres..." />
		</TagsInput>
	</div>

	<!-- Technical Details -->
	<div class="grid gap-4 md:grid-cols-3">
		<div class="space-y-2">
			<Label for="duration">Duration</Label>
			<FormItem>
				<Input
					id="duration"
					v-model="durationValue"
					name="duration"
					placeholder="3:45"
					:class="{
						'border-destructive': !!errors.duration && showValidationErrors
					}"
				/>
				<p
					v-if="errors.duration && showValidationErrors"
					class="text-destructive text-sm"
				>
					{{ errors.duration }}
				</p>
			</FormItem>
		</div>

		<div class="space-y-2">
			<Label for="bpm">BPM</Label>
			<FormItem>
				<Input
					id="bpm"
					v-model="bpmValue"
					name="bpm"
					placeholder="128.5"
					:class="{
						'border-destructive': !!errors.bpm && showValidationErrors
					}"
				/>
				<p
					v-if="errors.bpm && showValidationErrors"
					class="text-destructive text-sm"
				>
					{{ errors.bpm }}
				</p>
			</FormItem>
		</div>

		<div class="space-y-2">
			<Label for="rpm">RPM</Label>
			<Select v-model="rpmValue">
				<SelectTrigger class="w-full">
					<SelectValue placeholder="Select RPM" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem :value="null">Not specified</SelectItem>
					<SelectItem :value="33">33⅓ RPM</SelectItem>
					<SelectItem :value="45">45 RPM</SelectItem>
				</SelectContent>
			</Select>
		</div>
	</div>

	<!-- Musical Details -->
	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-2">
			<Label for="key">Key</Label>
			<FormItem>
				<Select v-model="keyCompositeValue">
					<SelectTrigger class="w-full">
						<SelectValue placeholder="Select key" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem
							v-for="option in keyOptions"
							:key="option.id"
							:value="option.id"
						>
							{{ option.name }}
						</SelectItem>
					</SelectContent>
				</Select>
				<p
					v-if="errors.keyComposite && showValidationErrors"
					class="text-destructive text-sm"
				>
					{{ errors.keyComposite }}
				</p>
			</FormItem>
		</div>

		<div class="space-y-2">
			<Label>Time Signature</Label>
			<div class="flex gap-2">
				<NumberField
					v-model="timeSignatureUpperValue"
					:min="1"
					:max="16"
					:default-value="4"
					class="w-16"
				>
					<NumberFieldInput placeholder="4" />
				</NumberField>
				<span class="flex items-center">/</span>
				<NumberField
					v-model="timeSignatureLowerValue"
					:min="1"
					:max="16"
					:default-value="4"
					class="w-16"
				>
					<NumberFieldInput placeholder="4" />
				</NumberField>
			</div>
		</div>
	</div>

	<!-- Playable Toggle -->
	<div class="flex items-center space-x-2">
		<Switch id="playable" v-model:checked="playableValue" />
		<Label for="playable">Playable (track is in good condition)</Label>
	</div>
</template>
