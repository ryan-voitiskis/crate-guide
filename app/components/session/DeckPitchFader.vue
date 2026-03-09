<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	compact?: boolean
}>()

const session = useSessionStore()
const user = useUserStore()

const deck = computed(() => session.decks[props.deckIndex])
const pitchRange = computed(() => user.profile?.turntable_pitch_range ?? 8)

// Label color: silver turntable → dark, black turntable → amber,
// no turntable (compact) → theme-aware
const labelClass = computed(() => {
	if (props.compact) return 'text-zinc-700 dark:text-amber-200/80'
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'silver' ? 'text-[#333]' : 'text-amber-200/80'
})

const valueClass = computed(() => {
	if (props.compact) return 'text-zinc-700 dark:text-amber-200'
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'silver' ? 'text-[#333]' : 'text-amber-200'
})

const faderTrackClass = computed(() => {
	if (props.compact) return 'bg-zinc-300 dark:bg-zinc-700'
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'silver' ? 'bg-zinc-400' : 'bg-zinc-800'
})

function handlePitchInput(event: Event) {
	const value = (event.target as HTMLInputElement).valueAsNumber
	session.setPitch(props.deckIndex, value)
}

function resetPitch() {
	session.resetPitch(props.deckIndex)
}
</script>

<template>
	<!-- Full mode: vertical SL-1200 style -->
	<div v-if="!compact" class="flex h-[210px] shrink-0 items-stretch gap-0">
		<!-- Reset button and pitch display stacked on the LEFT -->
		<div class="mr-1 flex flex-col items-center justify-between py-1">
			<!-- Pitch percentage display -->
			<div class="font-mono text-xs tabular-nums" :class="valueClass">
				{{
					deck?.pitch !== undefined
						? (deck.pitch > 0 ? '+' : '') +
							((deck.pitch / 100) * pitchRange).toFixed(1)
						: '0.0'
				}}%
			</div>

			<!-- Reset button - v1 style (round with border) -->
			<div class="flex flex-col items-center gap-1">
				<button
					class="flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-zinc-500 bg-zinc-300 transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
					:disabled="deck?.pitch === 0"
					@click="resetPitch"
				/>
				<span class="text-[11px]" :class="labelClass">reset</span>
			</div>
		</div>

		<!-- Labels and fader container -->
		<div class="relative flex h-full">
			<!-- SVG Legend (Technics SL-1200 style) - positioned to the left of fader -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 250"
				stroke="currentColor"
				:class="['h-full w-6 shrink-0', labelClass]"
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
				<text
					x="7"
					y="18"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					8
				</text>
				<text
					x="7"
					y="44.75"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					6
				</text>
				<text
					x="7"
					y="71.5"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					4
				</text>
				<text
					x="7"
					y="98.25"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					2
				</text>
				<text
					x="7"
					y="151.75"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					2
				</text>
				<text
					x="7"
					y="178.5"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					4
				</text>
				<text
					x="7"
					y="205.25"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					6
				</text>
				<text
					x="0"
					y="232"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					+
				</text>
				<text
					x="7"
					y="232"
					dominant-baseline="central"
					class="fill-current text-[1rem] font-light select-none"
				>
					8
				</text>
			</svg>

			<!-- Fader track -->
			<div class="relative h-full w-10 overflow-hidden" :class="faderTrackClass">
				<!-- Center groove -->
				<div
					class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-zinc-950"
				/>

				<!-- Slider input -->
				<input
					type="range"
					:min="-100"
					:max="100"
					:value="deck?.faderSliding ? deck.faderPosition : (deck?.pitch ?? 0)"
					:disabled="deck?.faderSliding"
					class="pitch-fader pitch-fader-full"
					:class="{ sliding: deck?.faderSliding }"
					@input="handlePitchInput"
				/>
			</div>
		</div>
	</div>

	<!-- Compact mode: horizontal fader with reset button on the right -->
	<div v-else class="flex h-10 shrink-0 items-center gap-2">
		<!-- Pitch percentage display -->
		<div
			class="w-10 shrink-0 text-center font-mono text-xs tabular-nums"
			:class="valueClass"
		>
			{{
				deck?.pitch !== undefined
					? (deck.pitch > 0 ? '+' : '') +
						((deck.pitch / 100) * pitchRange).toFixed(1)
					: '0.0'
			}}%
		</div>

		<!-- Horizontal fader track -->
		<div
			class="relative h-10 flex-1 overflow-hidden"
			:class="faderTrackClass"
		>
			<!-- Center groove (vertical line at center) -->
			<div
				class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-zinc-950"
			/>

			<!-- Slider input (horizontal, inverted for battle mode) -->
			<input
				type="range"
				:min="-100"
				:max="100"
				style="direction: rtl"
				:value="deck?.faderSliding ? deck.faderPosition : (deck?.pitch ?? 0)"
				:disabled="deck?.faderSliding"
				class="pitch-fader-horizontal"
				:class="{ sliding: deck?.faderSliding }"
				@input="handlePitchInput"
			/>
		</div>

		<!-- Reset button -->
		<button
			class="flex h-8 shrink-0 items-center rounded-sm bg-zinc-300 px-2 text-[10px] font-medium text-zinc-700 shadow-md transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			:disabled="deck?.pitch === 0"
			@click="resetPitch"
		>
			reset
		</button>
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
	width: 210px;
	height: 40px;
}

/* Compact horizontal fader (no rotation) */
.pitch-fader-horizontal {
	-webkit-appearance: none;
	appearance: none;
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: transparent;
	cursor: pointer;
	margin: 0;
}

.pitch-fader-horizontal::-webkit-slider-runnable-track {
	width: 100%;
	height: 3px;
	background: transparent;
}

.pitch-fader-horizontal::-moz-range-track {
	width: 100%;
	height: 3px;
	background: transparent;
}

.pitch-fader-horizontal::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 36px;
	height: 40px;
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
	box-shadow: 2px 0 4px rgba(0, 0, 0, 0.4);
}

.pitch-fader-horizontal::-webkit-slider-thumb:active {
	cursor: grabbing;
}

.pitch-fader-horizontal::-moz-range-thumb {
	width: 36px;
	height: 40px;
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
	box-shadow: 2px 0 4px rgba(0, 0, 0, 0.4);
}

.pitch-fader-horizontal::-moz-range-thumb:active {
	cursor: grabbing;
}

.pitch-fader-horizontal:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.pitch-fader-horizontal:disabled::-webkit-slider-thumb {
	cursor: not-allowed;
}

.pitch-fader-horizontal:disabled::-moz-range-thumb {
	cursor: not-allowed;
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
