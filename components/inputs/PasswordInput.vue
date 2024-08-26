<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

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
			class="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent cursor-pointer text-muted-foreground/70 hover:text-muted-foreground transition-colors"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click.prevent="showPassword = !showPassword"
		>
			<IconEyeOff v-if="showPassword" class="w-5" />
			<IconEye v-else class="w-5" />
		</button>
	</div>
</template>
