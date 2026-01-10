<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { crateSchema } from '~/utils/schemas/crate'

const props = defineProps<{
	open: boolean
	crate?: Crate | null
}>()

const emit = defineEmits<{
	'update:open': [value: boolean]
	saved: [crate: Crate]
}>()

const cratesStore = useCratesStore()

const isEditing = computed(() => !!props.crate)
const dialogTitle = computed(() =>
	isEditing.value ? 'Edit Crate' : 'Create Crate'
)

const validationSchema = toTypedSchema(crateSchema)

const form = useForm({
	validationSchema,
	initialValues: {
		name: '',
		description: ''
	}
})

const { handleSubmit, setValues, errors, resetForm, meta } = form
const [nameValue] = form.defineField('name')
const [descriptionValue] = form.defineField('description')

const colorValue = ref<string | null>(null)
const isSubmitting = ref(false)
const showValidationErrors = ref(false)

const descriptionLength = computed(() => descriptionValue.value?.length || 0)

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen) {
			if (props.crate) {
				setValues({
					name: props.crate.name,
					description: props.crate.description || ''
				})
				colorValue.value = props.crate.color
			} else {
				resetForm()
				colorValue.value = null
			}
			showValidationErrors.value = false
		}
	},
	{ immediate: true }
)

const submitCrate = handleSubmit(async (values) => {
	isSubmitting.value = true

	try {
		const crateData = {
			name: values.name.trim(),
			description: values.description?.trim() || null,
			color: colorValue.value
		}

		let result: Crate | null = null

		if (isEditing.value && props.crate) {
			result = await cratesStore.updateCrate(props.crate.id, crateData)
		} else {
			result = await cratesStore.createCrate({
				...crateData,
				records: []
			})
		}

		if (result) {
			emit('saved', result)
			emit('update:open', false)
		}
	} finally {
		isSubmitting.value = false
	}
})

function saveCrate() {
	showValidationErrors.value = true
	submitCrate()
}

function handleCancel() {
	emit('update:open', false)
}
</script>

<template>
	<Dialog :open="open" @update:open="emit('update:open', $event)">
		<DialogContent class="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>{{ dialogTitle }}</DialogTitle>
				<DialogDescription>
					{{
						isEditing
							? 'Update your crate details'
							: 'Create a new crate to organize records'
					}}
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="name">
						Name
						<span class="text-primary -ml-0.5">*</span>
					</Label>
					<FormItem>
						<Input
							id="name"
							v-model="nameValue"
							name="name"
							placeholder="My Crate"
							maxlength="50"
							:class="{
								'border-destructive': !!errors.name && showValidationErrors
							}"
						/>
						<p
							v-if="errors.name && showValidationErrors"
							class="text-destructive text-sm"
						>
							{{ errors.name }}
						</p>
					</FormItem>
				</div>

				<div class="space-y-2">
					<Label for="description">Description</Label>
					<FormItem>
						<Textarea
							id="description"
							v-model="descriptionValue"
							name="description"
							placeholder="Keep it short - a few words about this crate"
							maxlength="100"
							rows="2"
							:class="{
								'border-destructive':
									!!errors.description && showValidationErrors
							}"
						/>
						<div class="flex justify-between">
							<p
								v-if="errors.description && showValidationErrors"
								class="text-destructive text-sm"
							>
								{{ errors.description }}
							</p>
							<span class="text-muted-foreground ml-auto text-xs">
								{{ descriptionLength }}/100
							</span>
						</div>
					</FormItem>
				</div>

				<div class="space-y-2">
					<Label>Color</Label>
					<ColorPicker v-model="colorValue" />
				</div>
			</div>

			<DialogFooter class="gap-2">
				<Button variant="secondary" @click="handleCancel">Cancel</Button>
				<Button @click="saveCrate" :loading="isSubmitting">
					{{ isEditing ? 'Save' : 'Create' }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
