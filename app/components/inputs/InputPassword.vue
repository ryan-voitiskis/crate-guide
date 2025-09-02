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
			class="text-muted-foreground/70 hover:text-muted-foreground absolute top-0 right-0 h-full cursor-pointer px-3 py-2 transition-colors hover:bg-transparent"
			:aria-label="showPassword ? 'Hide password' : 'Show password'"
			@click.prevent="showPassword = !showPassword"
		>
			<IconEyeOff v-if="showPassword" class="w-5" />
			<IconEye v-else class="w-5" />
		</button>
	</div>
</template>
