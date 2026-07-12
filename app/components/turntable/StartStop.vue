<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
}>()

const session = useSessionStore()

function toggle() {
	session.togglePlaying(props.deckIndex)
}
</script>

<template>
	<button
		class="flex h-[38px] w-16 items-center justify-center rounded-[1px] border-2 border-black/75 bg-[#e7e2d6] p-0 shadow-[0_1px_0_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.86)] transition-[filter] hover:brightness-105 active:brightness-95"
		@click="toggle"
	>
		<span
			class="text-[6px] leading-none font-medium tracking-wide whitespace-nowrap text-[#3f3b34] select-none [text-shadow:0_1px_0_rgba(255,255,255,0.55)]"
		>
			START &bull; STOP
		</span>
	</button>
</template>
