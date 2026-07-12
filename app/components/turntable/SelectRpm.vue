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
		class="relative flex h-4 w-12 items-center rounded-[1px] border-2 border-black/75 bg-[#e7e2d6] p-0 shadow-[0_1px_0_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.82)] transition-[filter] hover:brightness-105 active:brightness-95"
		@click="selectSpeed"
	>
		<span
			class="pl-1.5 text-[9px] leading-none font-medium text-[#3f3b34] select-none [text-shadow:0_1px_0_rgba(255,255,255,0.55)]"
		>
			{{ speed }}
		</span>

		<!-- Indicator light -->
		<div
			class="absolute top-1/2 right-1 h-2 w-2 -translate-y-1/2 rounded-[1px] border border-red-950/50"
			:class="
				isActive
					? 'bg-[radial-gradient(circle_at_35%_30%,#fca5a5_0%,#ef4444_38%,#991b1b_100%)] shadow-[0_0_5px_2px_rgba(239,68,68,0.5),inset_0_1px_0_rgba(255,255,255,0.45)]'
					: 'bg-red-950/55 shadow-[inset_0_1px_1px_rgba(0,0,0,0.65)]'
			"
		/>
	</button>
</template>
