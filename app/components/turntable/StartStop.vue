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
		class="flex h-7 w-10 items-center justify-center border-2 border-zinc-700 bg-zinc-300 p-0 transition-all hover:bg-zinc-200 active:scale-95"
		@click="toggle"
	>
		<span
			class="text-[5px] leading-tight font-medium tracking-wide text-zinc-700 select-none"
		>
			START
			<br />
			&bull; STOP
		</span>
	</button>
</template>
