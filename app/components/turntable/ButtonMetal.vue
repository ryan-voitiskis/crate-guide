<script setup lang="ts">
defineProps<{
	variant: 'start-stop' | 'speed'
}>()
</script>

<template>
	<button
		type="button"
		class="focus-visible:outline-ring relative isolate flex shrink-0 cursor-pointer items-center justify-center overflow-hidden p-0 transition-[filter,transform] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px"
		:class="
			variant === 'start-stop'
				? 'h-9 w-14 rounded-[2px] border-[0.5px] border-[#11110f] bg-[#292824] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
				: 'h-3.5 w-9 rounded-[1px]'
		"
	>
		<span
			aria-hidden="true"
			class="pointer-events-none absolute overflow-hidden rounded-[1px] border border-[#747168] bg-[linear-gradient(180deg,#f1eee5_0%,#dad6cb_33%,#efede5_54%,#bdb9ae_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(0,0,0,0.24),inset_1px_0_0_rgba(255,255,255,0.3),inset_-1px_0_0_rgba(0,0,0,0.12)]"
			:class="variant === 'start-stop' ? 'inset-[1.5px]' : 'inset-0'"
		>
			<span
				class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 bg-[url(/textures/brushed-metal-009.jpg)] bg-size-[100%_100%] bg-no-repeat opacity-[0.34] mix-blend-multiply"
				:class="variant === 'start-stop' ? 'h-13.5 w-8.5' : 'h-9 w-3.5'"
			/>
			<span
				class="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.42)_0%,transparent_28%,rgba(0,0,0,0.08)_100%)]"
			/>
		</span>

		<span class="relative z-10 flex h-full w-full items-center justify-center">
			<slot />
		</span>
	</button>
</template>
