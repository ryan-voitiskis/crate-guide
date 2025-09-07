<script setup lang="ts">
import { Pencil, PencilOff } from 'lucide-vue-next'
import { z } from 'zod'

const records = useRecordsStore()
const recordDetails = useRecordDetailsStore()

const dialogOpen = computed({
	get: () => !!recordDetails.selectedRecordId,
	set: (value: boolean) => {
		if (!value) recordDetails.closeRecord()
	}
})

const recordSchema = z.object({
	title: z.string().min(1, 'Title is required').trim(),
	year: z.string().refine(
		(val) => {
			if (val === '') return true
			const num = Number(val)
			return (
				Number.isInteger(num) &&
				num >= 1877 &&
				num <= new Date().getFullYear() + 5
			)
		},
		(val) => ({
			message:
				val === ''
					? ''
					: `Year must be between 1877 and ${new Date().getFullYear() + 5}`
		})
	),
	cover: z.union([
		z.literal(''),
		z
			.string()
			.url('Must be a valid URL')
			.regex(
				/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i,
				'Must be an image URL (jpg, png, gif, webp)'
			)
	])
})

type RecordFormData = z.infer<typeof recordSchema>

const formErrors = ref<z.ZodFormattedError<RecordFormData> | null>(null)

// Form data computed
const formData = computed(() => ({
	title: recordDetails.recordForm.title,
	year: recordDetails.recordForm.year,
	cover: recordDetails.recordForm.cover
}))

// Validation result computed
const validationResult = computed(() => recordSchema.safeParse(formData.value))

// Validation logic
watchEffect(() => {
	formErrors.value = validationResult.value.success
		? null
		: validationResult.value.error.format()
})

const hasFieldError = (field: keyof RecordFormData) =>
	formErrors.value?.[field]?._errors?.length

function validateField() {
	formErrors.value = validationResult.value.success
		? null
		: validationResult.value.error.format()
}

function handleSave() {
	if (!validationResult.value.success) {
		formErrors.value = validationResult.value.error.format()
		return
	}

	recordDetails.saveRecord()
}
</script>

<template>
	<!-- Main Dialog -->
	<Dialog v-model:open="dialogOpen">
		<DialogContent
			class="max-h-[90dvh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] p-0"
		>
			<DialogHeader class="p-6 pb-0">
				<div>
					<div>
						<DialogTitle>Record Details</DialogTitle>
						<DialogDescription v-if="recordDetails.selectedRecord">
							{{ recordDetails.selectedRecord.title }}
						</DialogDescription>
					</div>
					<Button
						@click="recordDetails.toggleEditMode()"
						:variant="recordDetails.isEditMode ? 'secondary' : 'outline'"
						size="sm"
						class="mt-2"
					>
						<PencilOff v-if="recordDetails.isEditMode" class="mr-2 size-4" />
						<Pencil v-else class="mr-2 size-4" />
						{{ recordDetails.isEditMode ? 'Cancel Edit' : 'Edit Record' }}
					</Button>
				</div>
			</DialogHeader>

			<div class="space-y-6 overflow-y-auto px-6 py-4" tabindex="-1">
				<!-- Record Details Section -->
				<div class="grid gap-6 md:grid-cols-3">
					<!-- Cover Image -->
					<div class="space-y-2">
						<Label>Cover</Label>
						<div
							class="bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg"
						>
							<img
								v-if="recordDetails.selectedRecord?.cover"
								:src="recordDetails.selectedRecord.cover"
								:alt="recordDetails.selectedRecord?.title"
								class="h-full w-full object-cover"
							/>
							<span v-else class="text-muted-foreground text-sm">No cover</span>
						</div>
						<FormItem v-if="recordDetails.isEditMode">
							<Input
								v-model="recordDetails.recordForm.cover"
								@blur="validateField()"
								name="cover"
								placeholder="Cover URL"
								:class="[
									'text-xs',
									{ 'border-destructive': hasFieldError('cover') }
								]"
							/>
							<p
								v-if="formErrors?.cover?._errors?.length"
								class="text-destructive text-sm"
							>
								{{ formErrors.cover._errors[0] }}
							</p>
						</FormItem>
					</div>

					<!-- Record Info -->
					<div class="space-y-4 text-sm md:col-span-2">
						<!-- Title -->
						<div class="space-y-2">
							<Label>Title</Label>
							<FormItem v-if="recordDetails.isEditMode">
								<Input
									v-model="recordDetails.recordForm.title"
									@blur="validateField()"
									name="title"
									placeholder="Record title"
									:class="{ 'border-destructive': hasFieldError('title') }"
								/>
								<p
									v-if="formErrors?.title?._errors?.length"
									class="text-destructive text-sm"
								>
									{{ formErrors.title._errors[0] }}
								</p>
							</FormItem>
							<div v-else>
								{{ recordDetails.selectedRecord?.title }}
							</div>
						</div>

						<!-- Year -->
						<div class="space-y-2">
							<Label class="font-medium">Year</Label>
							<FormItem v-if="recordDetails.isEditMode">
								<Input
									v-model="recordDetails.recordForm.year"
									@blur="validateField()"
									name="year"
									type="text"
									placeholder="Release year"
									:class="[
										'w-32',
										{ 'border-destructive': hasFieldError('year') }
									]"
								/>
								<p
									v-if="formErrors?.year?._errors?.length"
									class="text-destructive text-sm"
								>
									{{ formErrors.year._errors[0] }}
								</p>
							</FormItem>
							<p v-else class="text-muted-foreground">
								{{ recordDetails.selectedRecord?.year || 'Unknown' }}
							</p>
						</div>
					</div>

					<!-- Artists -->
					<TableRecordArtists />

					<!-- Labels -->
					<div class="col-span-3 space-y-2">
						<Label>
							Labels ({{ recordDetails.selectedRecord?.labels.length || 0 }})
						</Label>
						<div class="space-y-1">
							<div
								v-for="label in recordDetails.selectedRecord?.labels"
								:key="label.name"
								class="bg-muted rounded p-2 text-sm"
							>
								{{ label.name }}
								<span v-if="label.catno" class="text-muted-foreground">
									- {{ label.catno }}
								</span>
							</div>
						</div>
					</div>
				</div>

				<SectionRecordTracks />
			</div>

			<!-- Dialog Footer (only shown in edit mode) -->
			<DialogFooter v-if="recordDetails.isEditMode" class="p-6 pt-0">
				<Button @click="recordDetails.cancelEdit()" variant="secondary">
					Cancel
				</Button>
				<Button
					@click="handleSave()"
					:disabled="!recordDetails.canSave"
					:loading="records.isUpdatingRecord"
				>
					Save Changes
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<AlertUnsavedRecordChanges />
	<AlertConfirmDeleteTrack />
	<DialogTrackEdit />
</template>
