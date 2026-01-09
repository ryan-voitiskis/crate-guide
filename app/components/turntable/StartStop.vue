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
		class="flex h-14 w-20 items-center justify-center border-[3px] border-zinc-700 bg-zinc-300 p-0 transition-all hover:bg-zinc-200"
		@click="toggle"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 100 100"
			class="h-full w-full"
		>
			<text
				x="50"
				y="55"
				text-anchor="middle"
				dominant-baseline="middle"
				class="select-none fill-zinc-700 text-[18px] font-medium"
			>
				start &bull; stop
			</text>
		</svg>
	</button>
</template>
