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
		class="relative flex h-3 w-10 items-center border-2 border-zinc-700 bg-zinc-300 p-0 transition-all hover:bg-zinc-200 active:scale-95"
		@click="selectSpeed"
	>
		<span
			class="pl-1 text-[8px] font-medium text-zinc-700 select-none"
		>
			{{ speed }}
		</span>

		<!-- Indicator light -->
		<div
			class="absolute top-1/2 right-0.5 h-1.5 w-1.5 -translate-y-1/2"
			:class="
				isActive
					? 'bg-red-600 shadow-[0_0_4px_2px_rgba(220,38,38,0.5)]'
					: 'bg-zinc-500'
			"
		/>
	</button>
</template>
