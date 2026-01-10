<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	speed: 33 | 45
}>()

const session = useSessionStore()
const deck = computed(() => session.decks[props.deckIndex])
const isActive = computed(() => deck.value?.rpm === props.speed)

function selectSpeed() {
	session.setRpm(props.deckIndex, props.speed)
}
</script>

<template>
	<button
		class="relative flex h-5 w-12 items-center border-[3px] border-zinc-700 bg-zinc-300 p-0 transition-all hover:bg-zinc-200"
		@click="selectSpeed"
	>
		<!-- Speed label -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 100 100"
			class="h-full w-8"
		>
			<text
				x="50"
				y="55"
				text-anchor="middle"
				dominant-baseline="middle"
				class="fill-zinc-700 text-[42px] font-medium select-none"
			>
				{{ speed }}
			</text>
		</svg>

		<!-- Indicator light -->
		<div
			class="absolute top-1/2 right-1 h-2 w-2 -translate-y-1/2"
			:class="
				isActive
					? 'bg-red-600 shadow-[0_0_4px_2px_rgba(220,38,38,0.5)]'
					: 'bg-zinc-500'
			"
		/>
	</button>
</template>
