<script setup lang="ts">
import type { HTMLAttributes, InputHTMLAttributes } from 'vue'
import { LucideEye, LucideEyeOff } from 'lucide-vue-next'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	autocomplete?: InputHTMLAttributes['autocomplete']
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
</script>

<template>
	<div class="relative">
		<Input
			v-bind="{ ...attrs, ...props }"
			:type="showPassword ? 'text' : 'password'"
			@update:model-value="emit('update:modelValue', $event)"
		/>
		<button
			type="button"
			class="text-muted-foreground/70 hover:text-muted-foreground absolute top-0 right-0 h-full cursor-pointer px-3 py-2 transition-colors hover:bg-transparent"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click="showPassword = !showPassword"
		>
			<LucideEyeOff v-if="showPassword" class="size-5" />
			<LucideEye v-else class="size-5" />
		</button>
	</div>
</template>
