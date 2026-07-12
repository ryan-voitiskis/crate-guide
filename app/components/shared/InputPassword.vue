<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { LucideEye, LucideEyeOff } from 'lucide-vue-next'

const props = defineProps<{
	defaultValue?: string | number
	modelValue?: string | number
	class?: HTMLAttributes['class']
	name: string
}>()

const showPassword = ref(false)
</script>

<template>
	<div class="relative">
		<Input v-bind="props" :type="showPassword ? 'text' : 'password'" />
		<button
			class="text-muted-foreground/70 hover:text-muted-foreground absolute top-0 right-0 h-full cursor-pointer px-3 py-2 transition-colors hover:bg-transparent"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click.prevent="showPassword = !showPassword"
		>
			<LucideEyeOff v-if="showPassword" class="size-5" />
			<LucideEye v-else class="size-5" />
		</button>
	</div>
</template>
