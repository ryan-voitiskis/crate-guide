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
			class="absolute right-0 top-0 h-full cursor-pointer px-3 py-2 text-muted-foreground/70 transition-colors hover:bg-transparent hover:text-muted-foreground"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click.prevent="showPassword = !showPassword"
		>
			<IconEyeOff v-if="showPassword" class="w-5" />
			<IconEye v-else class="w-5" />
		</button>
	</div>
</template>
