<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	compact?: boolean
}>()

const session = useSessionStore()
const user = useUserStore()

const deck = computed(() => session.decks[props.deckIndex])
const pitchRange = computed(() => user.profile?.turntable_pitch_range ?? 8)

function handlePitchInput(event: Event) {
	const value = (event.target as HTMLInputElement).valueAsNumber
	session.setPitch(props.deckIndex, value)
}

function resetPitch() {
	session.resetPitch(props.deckIndex)
}
</script>

<template>
	<div
		class="flex shrink-0 items-stretch"
		:class="compact ? 'h-32 gap-1' : 'h-48 gap-0'"
	>
		<!-- Full mode: Reset button and pitch display stacked on the LEFT -->
		<div v-if="!compact" class="flex flex-col items-center justify-between py-1">
			<!-- Pitch percentage display -->
			<div class="font-mono text-xs tabular-nums text-amber-200">
				{{ deck?.pitch !== undefined ? (deck.pitch > 0 ? '+' : '') + ((deck.pitch / 100) * pitchRange).toFixed(1) : '0.0' }}%
			</div>

			<!-- Reset button - v1 style (round with border) -->
			<div class="flex flex-col items-center gap-1">
				<button
					class="flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-zinc-500 bg-zinc-300 transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					@click="resetPitch"
					:disabled="deck?.pitch === 0"
				/>
				<span class="text-[11px] text-amber-200/80">reset</span>
			</div>
		</div>

		<!-- Compact mode: Reset button on the LEFT, rotated 90deg anti-clockwise -->
		<button
			v-if="compact"
			class="flex h-16 w-5 items-center justify-center self-end rounded-sm bg-zinc-300 text-zinc-700 shadow-md transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			@click="resetPitch"
			:disabled="deck?.pitch === 0"
		>
			<span class="text-[8px] font-medium" style="writing-mode: vertical-rl; transform: rotate(180deg)">reset</span>
		</button>

		<!-- Labels and fader container -->
		<div class="relative flex h-full">
			<!-- SVG Legend (Technics SL-1200 style) - positioned to the left of fader -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 250"
				stroke="currentColor"
				class="h-full w-6 shrink-0 text-amber-200/80"
				stroke-width=".5"
				preserveAspectRatio="none"
			>
				<!-- Vertical line -->
				<line stroke-width="1.4" x1="22" y1="15" x2="22" y2="235" />
				<!-- Tick marks -->
				<line stroke-width="6" x1="16" y1="18" x2="22" y2="18" />
				<line stroke-width="6" x1="16" y1="44.75" x2="22" y2="44.75" />
				<line stroke-width="6" x1="16" y1="71.5" x2="22" y2="71.5" />
				<line stroke-width="6" x1="16" y1="98.25" x2="22" y2="98.25" />
				<line stroke-width="6" x1="16" y1="125" x2="22" y2="125" />
				<line stroke-width="6" x1="16" y1="151.75" x2="22" y2="151.75" />
				<line stroke-width="6" x1="16" y1="178.5" x2="22" y2="178.5" />
				<line stroke-width="6" x1="16" y1="205.25" x2="22" y2="205.25" />
				<line stroke-width="6" x1="16" y1="232" x2="22" y2="232" />
				<!-- Small tick at top -->
				<line stroke-width="1.3" x1="1.4" y1="18" x2="5.5" y2="18" />
				<!-- Labels: 8, 6, 4, 2, (center has no label), 2, 4, 6, +8 -->
				<text x="7" y="18" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">8</text>
				<text x="7" y="44.75" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">6</text>
				<text x="7" y="71.5" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">4</text>
				<text x="7" y="98.25" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">2</text>
				<text x="7" y="151.75" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">2</text>
				<text x="7" y="178.5" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">4</text>
				<text x="7" y="205.25" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">6</text>
				<text x="0" y="232" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">+</text>
				<text x="7" y="232" dominant-baseline="central" class="select-none fill-current text-[1rem] font-light">8</text>
			</svg>

			<!-- Fader track -->
			<div class="relative h-full w-10 overflow-hidden bg-zinc-800">
				<!-- Center groove -->
				<div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-zinc-950" />

				<!-- Slider input -->
				<input
					type="range"
					:min="-100"
					:max="100"
					:value="deck?.faderSliding ? deck.faderPosition : deck?.pitch ?? 0"
					@input="handlePitchInput"
					:disabled="deck?.faderSliding"
					class="pitch-fader"
					:class="[
						{ sliding: deck?.faderSliding },
						compact ? 'pitch-fader-compact' : 'pitch-fader-full'
					]"
				/>
			</div>
		</div>
	</div>
</template>

<style scoped>
.pitch-fader {
	-webkit-appearance: none;
	appearance: none;
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%) rotate(90deg) scaleY(-1);
	background: transparent;
	cursor: pointer;
}

.pitch-fader-full {
	width: 192px;
	height: 40px;
}

.pitch-fader-compact {
	width: 128px;
	height: 40px;
}

.pitch-fader.sliding {
	/* Glow effect handled by parent */
}

.pitch-fader::-webkit-slider-runnable-track {
	width: 100%;
	height: 3px;
	background: transparent;
}

.pitch-fader::-moz-range-track {
	width: 100%;
	height: 3px;
	background: transparent;
}

/* V1 Technics SL-1200 style handle - sharp gradient bands, not rounded */
.pitch-fader::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 40px;
	height: 36px;
	background: linear-gradient(
		to right,
		hsl(0, 0%, 87%) 0%,
		hsl(0, 0%, 44%) 33%,
		hsl(0, 0%, 87%) 33%,
		hsl(0, 0%, 87%) 47%,
		hsl(0, 0%, 0%) 47%,
		hsl(0, 0%, 0%) 53%,
		hsl(0, 0%, 87%) 53%,
		hsl(0, 0%, 87%) 67%,
		hsl(0, 0%, 33%) 67%,
		hsl(0, 0%, 87%) 100%
	);
	border: none;
	border-radius: 0;
	cursor: grab;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.pitch-fader::-webkit-slider-thumb:active {
	cursor: grabbing;
}

.pitch-fader::-moz-range-thumb {
	width: 40px;
	height: 36px;
	background: linear-gradient(
		to right,
		hsl(0, 0%, 87%) 0%,
		hsl(0, 0%, 44%) 33%,
		hsl(0, 0%, 87%) 33%,
		hsl(0, 0%, 87%) 47%,
		hsl(0, 0%, 0%) 47%,
		hsl(0, 0%, 0%) 53%,
		hsl(0, 0%, 87%) 53%,
		hsl(0, 0%, 87%) 67%,
		hsl(0, 0%, 33%) 67%,
		hsl(0, 0%, 87%) 100%
	);
	border: none;
	border-radius: 0;
	cursor: grab;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}

.pitch-fader::-moz-range-thumb:active {
	cursor: grabbing;
}

.pitch-fader:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.pitch-fader:disabled::-webkit-slider-thumb {
	cursor: not-allowed;
}

.pitch-fader:disabled::-moz-range-thumb {
	cursor: not-allowed;
}
</style>
