<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	compact?: boolean
}>()

const session = useSessionStore()
const user = useUserStore()

const deck = computed(() => session.decks[props.deckIndex])
const pitchRange = computed(() => user.profile?.turntable_pitch_range ?? 8)
const fullFaderHeight = 226
const fullTravelStartPercent = 12
const fullTravelEndPercent = 88
const fullPitchLegendLabels = [
	'-8',
	undefined,
	'6',
	undefined,
	'4',
	undefined,
	'2',
	undefined,
	undefined,
	undefined,
	'2',
	undefined,
	'4',
	undefined,
	'6',
	undefined,
	'+8'
] as const
const fullPitchMarks = fullPitchLegendLabels.map((label, index) => ({
	top:
		fullTravelStartPercent +
		((fullTravelEndPercent - fullTravelStartPercent) * index) /
			(fullPitchLegendLabels.length - 1),
	label,
	major: index % 2 === 0
}))
const faderValue = computed(() =>
	Math.max(
		-100,
		Math.min(
			100,
			deck.value?.faderSliding
				? (deck.value.faderPosition ?? 0)
				: (deck.value?.pitch ?? 0)
		)
	)
)
const faderRatio = computed(() => (faderValue.value + 100) / 200)
const formattedPitch = computed(
	() =>
		(deck.value?.pitch !== undefined
			? (deck.value.pitch > 0 ? '+' : '') +
				((deck.value.pitch / 100) * pitchRange.value).toFixed(1)
			: '0.0') + '%'
)
const compactHandleWidth = 56
const fullInputRef = ref<HTMLInputElement | null>(null)
let activeFullPitchPointerId: number | null = null
let suppressFullNativeInput = false

function getCenteredPosition(ratio: number, handleSize: number) {
	const offset = handleSize / 2 - ratio * handleSize
	const operator = offset < 0 ? '-' : '+'
	return `calc(${ratio * 100}% ${operator} ${Math.abs(offset)}px)`
}

const fullHandleStyle = computed(() => ({
	top: `${fullTravelStartPercent + faderRatio.value * (fullTravelEndPercent - fullTravelStartPercent)}%`
}))
const compactHandleStyle = computed(() => {
	const ratio = 1 - faderRatio.value
	return {
		left: getCenteredPosition(ratio, compactHandleWidth)
	}
})
const zeroLightClass = computed(() =>
	Math.abs(faderValue.value) < 1
		? 'bg-emerald-400 opacity-95 shadow-[0_0_8px_rgba(34,197,94,0.75),inset_0_1px_1px_rgba(255,255,255,0.75)]'
		: 'bg-emerald-950/80 opacity-70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
)
const legendTextClass = 'text-[#c9c6bd]'
const legendMarkClass = 'bg-[#c9c6bd]'
const brushedScaleGrainClass =
	'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.16)_0%,transparent_18%,rgba(0,0,0,0.18)_37%,transparent_56%,rgba(255,255,255,0.13)_73%,rgba(0,0,0,0.12)_100%),linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_34%,rgba(0,0,0,0.24)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-90 mix-blend-soft-light [background-size:100%_100%,100%_100%,100%_100%]'
const brushedRailGrainClass =
	'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.14)_0%,transparent_20%,rgba(0,0,0,0.22)_43%,transparent_62%,rgba(255,255,255,0.11)_78%,rgba(0,0,0,0.14)_100%),linear-gradient(180deg,rgba(255,255,255,0.09)_0%,transparent_32%,rgba(0,0,0,0.28)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-95 mix-blend-soft-light [background-size:100%_100%,100%_100%,100%_100%]'

const valueClass = computed(() => {
	if (props.compact) return 'text-zinc-700 dark:text-amber-200'
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'silver' ? 'text-[#333]' : 'text-zinc-100'
})

const faderTrackClass = computed(() => {
	if (props.compact) {
		return 'bg-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),inset_0_-1px_0_rgba(0,0,0,0.18)] dark:bg-zinc-700 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]'
	}
	const theme = user.profile?.turntable_theme ?? 'silver'
	return theme === 'silver'
		? 'bg-[linear-gradient(90deg,#b7b8bf_0%,#9698a1_48%,#787b84_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.45),inset_-1px_0_0_rgba(0,0,0,0.35)]'
		: 'bg-[linear-gradient(90deg,#343437_0%,#1d1d20_48%,#0d0d0f_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.08),inset_-1px_0_0_rgba(0,0,0,0.65)]'
})

function handlePitchInput(event: Event) {
	const value = (event.target as HTMLInputElement).valueAsNumber
	session.setPitch(props.deckIndex, value)
}

function handleFullPitchInput(event: Event) {
	if (suppressFullNativeInput) {
		;(event.target as HTMLInputElement).value = String(faderValue.value)
		return
	}

	handlePitchInput(event)
}

function setFullPitchFromClientY(clientY: number) {
	const input = fullInputRef.value
	if (!input) return

	const rect = (input.parentElement ?? input).getBoundingClientRect()
	const start = rect.top + (rect.height * fullTravelStartPercent) / 100
	const end = rect.top + (rect.height * fullTravelEndPercent) / 100
	const ratio = Math.max(0, Math.min(1, (clientY - start) / (end - start)))
	session.setPitch(props.deckIndex, ratio * 200 - 100)
}

function handleFullPitchPointerMove(event: PointerEvent) {
	if (event.pointerId !== activeFullPitchPointerId) return

	event.preventDefault()
	setFullPitchFromClientY(event.clientY)
}

function stopFullPitchPointer() {
	activeFullPitchPointerId = null
	window.removeEventListener('pointermove', handleFullPitchPointerMove)
	window.removeEventListener('pointerup', stopFullPitchPointer)
	window.removeEventListener('pointercancel', stopFullPitchPointer)
	window.setTimeout(() => {
		suppressFullNativeInput = false
	}, 0)
}

function handleFullPitchPointerDown(event: PointerEvent) {
	if (deck.value?.faderSliding) return

	event.preventDefault()
	suppressFullNativeInput = true
	activeFullPitchPointerId = event.pointerId
	;(event.currentTarget as HTMLInputElement).focus()
	setFullPitchFromClientY(event.clientY)
	window.addEventListener('pointermove', handleFullPitchPointerMove, {
		passive: false
	})
	window.addEventListener('pointerup', stopFullPitchPointer, { once: true })
	window.addEventListener('pointercancel', stopFullPitchPointer, { once: true })
}

onBeforeUnmount(stopFullPitchPointer)

function resetPitch() {
	session.resetPitch(props.deckIndex)
}
</script>

<template>
	<!-- Full mode: vertical SL-1200 style -->
	<div
		v-if="!compact"
		class="relative z-20 flex h-[226px] shrink-0 items-stretch gap-2 overflow-visible"
	>
		<div
			:data-testid="`deck-${deckIndex}-pitch-reset-guide`"
			class="pointer-events-none absolute top-1/2 left-6 z-20 h-[61px] w-[30px] border-t border-l border-zinc-100/75"
		/>

		<!-- Reset button and pitch display stacked on the LEFT -->
		<div
			class="relative z-30 flex w-12 flex-col items-center justify-between py-1"
		>
			<div aria-hidden="true" class="h-3" />

			<!-- Reset button - v1 style (round with border) -->
			<div class="relative flex flex-col items-center gap-1">
				<button
					:data-testid="`deck-${deckIndex}-pitch-reset`"
					aria-label="Reset pitch"
					class="relative z-30 flex h-8 w-8 items-center justify-center rounded-full border-2 border-black/75 bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#d9d9d6_34%,#a8a8a2_68%,#f2f0e8_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-2px_3px_rgba(0,0,0,0.18)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:hover:brightness-100"
					:disabled="deck?.pitch === 0"
					@click="resetPitch"
				/>
				<span class="text-[10px] leading-none font-medium text-zinc-100/85">
					reset
				</span>
				<span
					:data-testid="`deck-${deckIndex}-pitch-value`"
					class="absolute top-[calc(100%+3px)] left-1/2 -translate-x-1/2 font-mono text-[13px] leading-none font-semibold text-[#ff5a4d]/75 tabular-nums [text-shadow:0_0_5px_rgba(248,113,113,0.42),0_0_16px_rgba(127,29,29,0.28)]"
				>
					{{ formattedPitch }}
				</span>
			</div>
		</div>

		<!-- Labels and fader container -->
		<div
			class="relative h-full w-[86px] overflow-visible"
			:data-testid="`deck-${deckIndex}-pitch-module`"
		>
			<div
				class="flex h-full overflow-hidden rounded-[3px] border border-black/75 bg-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.16),inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_8px_12px_rgba(255,255,255,0.04),inset_0_-10px_16px_rgba(0,0,0,0.55)]"
			>
				<div
					class="relative h-full w-[34px] border-r border-black/70 bg-[linear-gradient(90deg,#484238_0%,#332f28_48%,#29251f_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.08)]"
				>
					<div :class="brushedScaleGrainClass" />
					<div
						class="absolute top-[12%] right-0 bottom-[12%] w-px"
						:class="legendMarkClass"
					/>
					<div
						v-for="mark in fullPitchMarks"
						:key="`${mark.top}-${mark.label ?? 'tick'}`"
						class="absolute right-0 -translate-y-1/2"
						:style="{ top: `${mark.top}%` }"
					>
						<span
							v-if="mark.label"
							class="absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] leading-none font-semibold tabular-nums"
							:class="legendTextClass"
						>
							{{ mark.label }}
						</span>
						<span
							class="block"
							:class="[
								legendMarkClass,
								mark.major ? 'h-[5px] w-[7px]' : 'h-[3px] w-[4px]'
							]"
						/>
					</div>
					<div
						class="absolute top-1/2 left-[7px] h-2.5 w-4 -translate-y-1/2 rounded-[1px] border border-black/75 transition-all"
						:class="zeroLightClass"
					/>
				</div>

				<div
					class="relative h-full flex-1 bg-[linear-gradient(90deg,#61584a_0%,#494235_35%,#39352c_52%,#554d40_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.12),inset_-2px_0_4px_rgba(0,0,0,0.58)]"
				>
					<div :class="brushedRailGrainClass" />
					<div
						class="absolute top-4 bottom-4 left-1/2 w-2 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,#11100e_0%,#020202_45%,#090807_68%,#181612_100%)] shadow-[inset_1px_0_2px_rgba(255,255,255,0.16),inset_-1px_0_2px_rgba(0,0,0,0.9)]"
					/>

					<div
						:data-testid="`deck-${deckIndex}-pitch-handle`"
						class="pointer-events-none absolute left-1/2 z-20 h-[42px] w-[calc(100%+1px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] border border-black/35 bg-[linear-gradient(180deg,#e8e1cd_0%,#fff7e6_12%,#a29a84_34%,#8d8674_36%,#f3ead6_37%,#f6edda_50%,#efe4cf_63%,#8f8775_64%,#b3a990_70%,#d8cfba_100%)] shadow-[0_3px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(0,0,0,0.36)]"
						:style="fullHandleStyle"
					>
						<div
							class="absolute inset-x-0 top-[36%] h-px bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.38)_12%,rgba(0,0,0,0.5)_88%,transparent_100%)]"
						/>
						<div
							class="absolute inset-x-0 top-[64%] h-px bg-[linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.32)_12%,rgba(0,0,0,0.44)_88%,transparent_100%)]"
						/>
						<div class="absolute inset-x-0 top-1/2 h-0.5 bg-zinc-950/65" />
						<div class="absolute inset-x-1 top-[46%] h-px bg-white/75" />
					</div>

					<!-- Slider input -->
					<input
						ref="fullInputRef"
						type="range"
						:min="-100"
						:max="100"
						:value="faderValue"
						:disabled="deck?.faderSliding"
						aria-label="Pitch adjustment"
						class="absolute top-1/2 left-1/2 z-10 m-0 h-10 -translate-x-1/2 -translate-y-1/2 -scale-y-100 rotate-90 cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
						:style="{ width: `${fullFaderHeight}px` }"
						@pointerdown="handleFullPitchPointerDown"
						@input="handleFullPitchInput"
					/>
				</div>
			</div>
			<div
				class="absolute -bottom-4 left-1/2 w-full -translate-x-1/2 text-center text-[10px] leading-none font-medium text-zinc-100/85"
			>
				pitch adj.
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
			{{ formattedPitch }}
		</div>

		<!-- Horizontal fader track -->
		<div class="relative h-10 flex-1 overflow-hidden" :class="faderTrackClass">
			<div
				class="absolute inset-x-3 top-1/2 h-2.5 -translate-y-1/2 bg-[linear-gradient(180deg,#050506_0%,#141518_38%,#010102_50%,#141518_62%,#050506_100%)] shadow-[inset_0_2px_3px_rgba(0,0,0,0.72),inset_0_-2px_3px_rgba(0,0,0,0.72)]"
			/>
			<div
				class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-black/80"
			/>

			<div
				class="pointer-events-none absolute top-1/2 z-20 h-[calc(100%+2px)] w-14 -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-zinc-950/30 bg-[linear-gradient(90deg,#e9e9e9_0%,#9a9a9a_30%,#eeeeee_31%,#eeeeee_45%,#181818_45%,#181818_55%,#eeeeee_55%,#eeeeee_69%,#858585_70%,#e9e9e9_100%)] shadow-[2px_0_5px_rgba(0,0,0,0.38),inset_1px_0_0_rgba(255,255,255,0.72),inset_-1px_0_0_rgba(0,0,0,0.28)]"
				:style="compactHandleStyle"
			>
				<div class="absolute top-1 bottom-1 left-2 w-px bg-white/65" />
				<div class="absolute top-1 right-2 bottom-1 w-px bg-black/35" />
			</div>

			<div
				class="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-emerald-950/60 bg-emerald-400 transition-opacity"
				:class="zeroLightClass"
			/>

			<!-- Slider input (horizontal, inverted for battle mode) -->
			<input
				type="range"
				:min="-100"
				:max="100"
				:value="faderValue"
				:disabled="deck?.faderSliding"
				aria-label="Pitch adjustment"
				class="absolute inset-0 z-20 m-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 [direction:rtl] disabled:cursor-not-allowed"
				@input="handlePitchInput"
			/>
		</div>

		<!-- Reset button -->
		<button
			:data-testid="`deck-${deckIndex}-pitch-reset`"
			aria-label="Reset pitch"
			class="flex h-8 shrink-0 items-center rounded-sm bg-zinc-300 px-2 text-[10px] font-medium text-zinc-700 shadow-md transition-all hover:bg-zinc-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			:disabled="deck?.pitch === 0"
			@click="resetPitch"
		>
			reset
		</button>
	</div>
</template>
