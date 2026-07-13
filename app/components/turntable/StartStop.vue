<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
}>()

const session = useSessionStore()
const deck = computed(() => session.decks[props.deckIndex])
const isPlaying = computed(() => deck.value?.isPlaying ?? false)

function toggle() {
	session.togglePlaying(props.deckIndex)
}
</script>

<template>
	<TurntableButtonMetal
		variant="start-stop"
		:data-testid="`deck-${deckIndex}-start-stop`"
		:aria-label="isPlaying ? 'Stop turntable' : 'Start turntable'"
		:aria-pressed="isPlaying"
		@click="toggle"
	>
		<span
			class="text-[7px] leading-none font-medium tracking-[0.04em] whitespace-nowrap text-[#33312d] select-none [text-shadow:0_1px_0_rgba(255,255,255,0.65)]"
		>
			start &bull; stop
		</span>
	</TurntableButtonMetal>
</template>
