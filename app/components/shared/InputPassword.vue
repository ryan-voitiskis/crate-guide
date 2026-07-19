<script setup lang="ts">
import type { HTMLAttributes, InputHTMLAttributes } from 'vue'
import { LucideEye, LucideEyeOff } from 'lucide-vue-next'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	autocomplete?: InputHTMLAttributes['autocomplete']
	describedBy?: string
	defaultValue?: string | number
	modelValue?: string | number
	class?: HTMLAttributes['class']
	disabled?: boolean
	id?: string
	name: string
	placeholder?: string
	required?: boolean
}>()

const emit = defineEmits<{
	'update:modelValue': [value: string | number]
}>()

const attrs = useAttrs()
const showPassword = ref(false)
const ariaDescribedBy = computed(() => {
	const descriptions: string[] = []
	const inheritedDescription = attrs['aria-describedby']
	if (typeof inheritedDescription === 'string' && inheritedDescription)
		descriptions.push(inheritedDescription)
	if (props.describedBy) descriptions.push(props.describedBy)
	return descriptions.join(' ')
})
</script>

<template>
	<div class="relative">
		<Input
			v-bind="{ ...attrs, ...props }"
			:type="showPassword ? 'text' : 'password'"
			:aria-describedby="ariaDescribedBy || undefined"
			:class="cn('pr-12', props.class)"
			@update:model-value="emit('update:modelValue', $event)"
		/>
		<button
			type="button"
			class="text-muted-foreground/70 hover:text-muted-foreground focus-visible:ring-ring absolute top-0 right-0 h-full w-11 cursor-pointer rounded-r-md py-2 transition-colors hover:bg-transparent focus-visible:ring-2 focus-visible:outline-none"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click="showPassword = !showPassword"
		>
			<LucideEyeOff v-if="showPassword" class="size-5" />
			<LucideEye v-else class="size-5" />
		</button>
	</div>
</template>
