<script setup lang="ts">
import {
	getPitchDeltaColour,
	getPitchDeltaHighContrastColour,
	hexToRgba
} from '~/utils/colourInterpolation'

const props = defineProps<{
	deckIndex: number
	compact?: boolean
}>()

const session = useSessionStore()
const user = useUserStore()

const deck = computed(() => session.decks[props.deckIndex])
const pitchRange = computed(() => user.profile?.turntable_pitch_range ?? 8)
const isSilverTurntableTheme = computed(
	() => (user.profile?.turntable_theme ?? 'silver') !== 'black'
)
const fullFaderHeight = 226
const fullTravelStartPercent = 12
const fullTravelEndPercent = 88
const compactTravelStartPercent = 12
const compactTravelEndPercent = 88
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
const compactPitchMarks = fullPitchLegendLabels.map((_, index) => ({
	left:
		compactTravelStartPercent +
		((compactTravelEndPercent - compactTravelStartPercent) * index) /
			(fullPitchLegendLabels.length - 1),
	label: fullPitchLegendLabels[fullPitchLegendLabels.length - 1 - index],
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
const fullInputRef = ref<HTMLInputElement | null>(null)
const compactInputRef = ref<HTMLInputElement | null>(null)
let activeFullPitchPointerId: number | null = null
let activeCompactPitchPointerId: number | null = null
let suppressFullNativeInput = false
let suppressCompactNativeInput = false

const fullHandleStyle = computed(() => ({
	top: `${fullTravelStartPercent + faderRatio.value * (fullTravelEndPercent - fullTravelStartPercent)}%`
}))
const compactHandleStyle = computed(() => {
	const ratio = 1 - faderRatio.value
	return {
		left: `${compactTravelStartPercent + ratio * (compactTravelEndPercent - compactTravelStartPercent)}%`
	}
})
const zeroLightClass = computed(() =>
	Math.abs(faderValue.value) < 1
		? 'bg-emerald-400 opacity-95 shadow-[0_0_8px_rgba(34,197,94,0.75),inset_0_1px_1px_rgba(255,255,255,0.75)]'
		: 'bg-emerald-950/80 opacity-70 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]'
)
const fullDeckGuideClass = computed(() =>
	isSilverTurntableTheme.value ? 'border-[#5d5d5d]' : 'border-zinc-100/75'
)
const fullDeckLabelClass = computed(() =>
	isSilverTurntableTheme.value ? 'text-[#333333]' : 'text-zinc-100/85'
)
const compactDeckClass = computed(() =>
	isSilverTurntableTheme.value
		? 'border-[#8b877c] bg-[radial-gradient(circle_at_8%_8%,rgba(255,255,246,0.5)_0%,rgba(255,255,246,0.18)_16%,transparent_38%),linear-gradient(135deg,#d8d8cc_0%,#cacabd_28%,#e1e0d5_50%,#c5c5b8_74%,#babab0_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.18)]'
		: 'border-black/55 bg-[#3b3934] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]'
)
const legendTextClass = computed(() =>
	isSilverTurntableTheme.value ? 'text-[#202020]' : 'text-[#c9c6bd]'
)
const legendMarkClass = computed(() =>
	isSilverTurntableTheme.value ? 'bg-[#303030]' : 'bg-[#c9c6bd]'
)
const pitchValueClass =
	'font-mono text-[13px] leading-none font-semibold tabular-nums'
const resetButtonClass =
	'flex h-8 w-8 items-center justify-center rounded-full bg-[#171716] p-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(0,0,0,0.85)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:hover:brightness-100'
const resetButtonFaceClass =
	'pointer-events-none block h-full w-full rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#d9d9d6_34%,#a8a8a2_68%,#f2f0e8_100%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),inset_0_-2px_3px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,255,255,0.14)]'
const moduleShellClass = computed(() =>
	isSilverTurntableTheme.value
		? 'border-[#858176] bg-[#c4c0b5] shadow-[0_1px_0_rgba(255,255,255,0.58),inset_0_0_0_1px_rgba(255,255,255,0.22),inset_0_8px_12px_rgba(255,255,255,0.2),inset_0_-10px_16px_rgba(0,0,0,0.12)]'
		: 'border-black/75 bg-zinc-950 shadow-[0_1px_0_rgba(255,255,255,0.16),inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_8px_12px_rgba(255,255,255,0.04),inset_0_-10px_16px_rgba(0,0,0,0.55)]'
)
const moduleDividerClass = computed(() =>
	isSilverTurntableTheme.value ? 'border-[#8d897f]' : 'border-black/70'
)
const fullScalePanelClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(90deg,#e0ddd2_0%,#c8c3b8_45%,#ada89e_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.4),inset_1px_0_0_rgba(0,0,0,0.05)]'
		: 'bg-[linear-gradient(90deg,#484238_0%,#332f28_48%,#29251f_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.08)]'
)
const compactScalePanelClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(180deg,#e0ddd2_0%,#c8c3b8_45%,#ada89e_100%)] shadow-[inset_0_-1px_0_rgba(255,255,255,0.4),inset_0_1px_0_rgba(0,0,0,0.05)]'
		: 'bg-[linear-gradient(180deg,#484238_0%,#332f28_48%,#29251f_100%)] shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]'
)
const fullRailPanelClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(90deg,#ddd9ce_0%,#c7c2b7_35%,#b2ada3_52%,#d2cdc2_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.4),inset_-2px_0_4px_rgba(0,0,0,0.13)]'
		: 'bg-[linear-gradient(90deg,#61584a_0%,#494235_35%,#39352c_52%,#554d40_100%)] shadow-[inset_1px_0_0_rgba(255,255,255,0.12),inset_-2px_0_4px_rgba(0,0,0,0.58)]'
)
const compactRailPanelClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(180deg,#ddd9ce_0%,#c7c2b7_35%,#b2ada3_52%,#d2cdc2_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.13)]'
		: 'bg-[linear-gradient(180deg,#61584a_0%,#494235_35%,#39352c_52%,#554d40_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-2px_4px_rgba(0,0,0,0.58)]'
)
const brushedScaleGrainClass = computed(() =>
	isSilverTurntableTheme.value
		? 'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.26)_0%,transparent_20%,rgba(0,0,0,0.14)_42%,transparent_60%,rgba(255,255,255,0.18)_78%,rgba(0,0,0,0.08)_100%),linear-gradient(180deg,rgba(255,255,255,0.15)_0%,transparent_34%,rgba(0,0,0,0.1)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-[0.34] mix-blend-multiply [background-size:100%_100%,100%_100%,100%_100%]'
		: 'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.16)_0%,transparent_18%,rgba(0,0,0,0.18)_37%,transparent_56%,rgba(255,255,255,0.13)_73%,rgba(0,0,0,0.12)_100%),linear-gradient(180deg,rgba(255,255,255,0.1)_0%,transparent_34%,rgba(0,0,0,0.24)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-90 mix-blend-soft-light [background-size:100%_100%,100%_100%,100%_100%]'
)
const brushedRailGrainClass = computed(() =>
	isSilverTurntableTheme.value
		? 'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.22)_0%,transparent_22%,rgba(0,0,0,0.16)_44%,transparent_62%,rgba(255,255,255,0.16)_80%,rgba(0,0,0,0.09)_100%),linear-gradient(180deg,rgba(255,255,255,0.13)_0%,transparent_32%,rgba(0,0,0,0.11)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-[0.36] mix-blend-multiply [background-size:100%_100%,100%_100%,100%_100%]'
		: 'pointer-events-none absolute inset-0 bg-[linear-gradient(92deg,rgba(255,255,255,0.14)_0%,transparent_20%,rgba(0,0,0,0.22)_43%,transparent_62%,rgba(255,255,255,0.11)_78%,rgba(0,0,0,0.14)_100%),linear-gradient(180deg,rgba(255,255,255,0.09)_0%,transparent_32%,rgba(0,0,0,0.28)_100%),url(/textures/brushed-metal-009.jpg)] bg-no-repeat opacity-95 mix-blend-soft-light [background-size:100%_100%,100%_100%,100%_100%]'
)
const fullFaderHandleClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(180deg,#e0e0dc_0%,#fbfaf2_12%,#c4c2b8_34%,#929088_36%,#f4f3ec_37%,#f8f7f0_50%,#e8e6dd_63%,#8c8a82_64%,#b8b6aa_70%,#dbd9ce_100%)]'
		: 'bg-[linear-gradient(180deg,#e8e1cd_0%,#fff7e6_12%,#a29a84_34%,#8d8674_36%,#f3ead6_37%,#f6edda_50%,#efe4cf_63%,#8f8775_64%,#b3a990_70%,#d8cfba_100%)]'
)
const compactFaderHandleClass = computed(() =>
	isSilverTurntableTheme.value
		? 'bg-[linear-gradient(90deg,#e0e0dc_0%,#fbfaf2_12%,#c4c2b8_34%,#929088_36%,#f4f3ec_37%,#f8f7f0_50%,#e8e6dd_63%,#8c8a82_64%,#b8b6aa_70%,#dbd9ce_100%)]'
		: 'bg-[linear-gradient(90deg,#e8e1cd_0%,#fff7e6_12%,#a29a84_34%,#8d8674_36%,#f3ead6_37%,#f6edda_50%,#efe4cf_63%,#8f8775_64%,#b3a990_70%,#d8cfba_100%)]'
)

const pitchValueColour = computed(() => {
	if (isSilverTurntableTheme.value) {
		return getPitchDeltaHighContrastColour(faderValue.value, 100)
	}

	return getPitchDeltaColour(faderValue.value, 100)
})
const pitchValueStyle = computed(() => ({
	color: pitchValueColour.value,
	textShadow: `0 0 3px ${hexToRgba(pitchValueColour.value, 0.46)}, 0 0 10px ${hexToRgba(pitchValueColour.value, 0.2)}`
}))

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

function handleCompactPitchInput(event: Event) {
	if (suppressCompactNativeInput) {
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

function setCompactPitchFromClientX(clientX: number) {
	const input = compactInputRef.value
	if (!input) return

	const rect = (input.parentElement ?? input).getBoundingClientRect()
	const start = rect.left + (rect.width * compactTravelStartPercent) / 100
	const end = rect.left + (rect.width * compactTravelEndPercent) / 100
	const ratio = Math.max(0, Math.min(1, (clientX - start) / (end - start)))
	session.setPitch(props.deckIndex, 100 - ratio * 200)
}

function handleCompactPitchPointerMove(event: PointerEvent) {
	if (event.pointerId !== activeCompactPitchPointerId) return

	event.preventDefault()
	setCompactPitchFromClientX(event.clientX)
}

function stopCompactPitchPointer() {
	activeCompactPitchPointerId = null
	window.removeEventListener('pointermove', handleCompactPitchPointerMove)
	window.removeEventListener('pointerup', stopCompactPitchPointer)
	window.removeEventListener('pointercancel', stopCompactPitchPointer)
	window.setTimeout(() => {
		suppressCompactNativeInput = false
	}, 0)
}

function handleCompactPitchPointerDown(event: PointerEvent) {
	if (deck.value?.faderSliding) return

	event.preventDefault()
	suppressCompactNativeInput = true
	activeCompactPitchPointerId = event.pointerId
	;(event.currentTarget as HTMLInputElement).focus()
	setCompactPitchFromClientX(event.clientX)
	window.addEventListener('pointermove', handleCompactPitchPointerMove, {
		passive: false
	})
	window.addEventListener('pointerup', stopCompactPitchPointer, { once: true })
	window.addEventListener('pointercancel', stopCompactPitchPointer, {
		once: true
	})
}

onBeforeUnmount(() => {
	stopFullPitchPointer()
	stopCompactPitchPointer()
})

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
			class="pointer-events-none absolute top-1/2 left-6 z-20 h-[61px] w-[30px] border-t border-l"
			:class="fullDeckGuideClass"
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
					class="relative z-30"
					:class="resetButtonClass"
					:disabled="deck?.pitch === 0"
					@click="resetPitch"
				>
					<span aria-hidden="true" :class="resetButtonFaceClass" />
				</button>
				<span
					class="text-[10px] leading-none font-medium"
					:class="fullDeckLabelClass"
				>
					reset
				</span>
				<span
					:data-testid="`deck-${deckIndex}-pitch-value`"
					class="absolute top-[calc(100%+3px)] left-1/2 -translate-x-1/2"
					:class="pitchValueClass"
					:style="pitchValueStyle"
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
				class="flex h-full overflow-hidden rounded-[3px] border"
				:class="moduleShellClass"
			>
				<div
					class="relative h-full w-[34px] border-r"
					:class="[moduleDividerClass, fullScalePanelClass]"
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

				<div class="relative h-full flex-1" :class="fullRailPanelClass">
					<div :class="brushedRailGrainClass" />
					<div
						class="absolute top-4 bottom-4 left-1/2 w-2 -translate-x-1/2 rounded-full bg-[linear-gradient(90deg,#11100e_0%,#020202_45%,#090807_68%,#181612_100%)] shadow-[inset_1px_0_2px_rgba(255,255,255,0.16),inset_-1px_0_2px_rgba(0,0,0,0.9)]"
					/>

					<div
						:data-testid="`deck-${deckIndex}-pitch-handle`"
						class="pointer-events-none absolute left-1/2 z-20 h-[42px] w-[calc(100%+1px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] border border-black/35 shadow-[0_3px_5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(0,0,0,0.36)]"
						:class="fullFaderHandleClass"
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
				class="absolute -bottom-4 left-1/2 w-full -translate-x-1/2 text-center text-[10px] leading-none font-medium"
				:class="fullDeckLabelClass"
			>
				pitch adj.
			</div>
		</div>
	</div>

	<!-- Compact mode: horizontal battle-mode SL-1200 style -->
	<div
		v-else
		class="relative flex h-[90px] shrink-0 items-center gap-2 overflow-visible rounded-[3px] border p-2"
		:class="compactDeckClass"
	>
		<div class="relative flex w-12 shrink-0 flex-col items-center gap-1">
			<button
				:data-testid="`deck-${deckIndex}-pitch-reset`"
				aria-label="Reset pitch"
				class="relative"
				:class="resetButtonClass"
				:disabled="deck?.pitch === 0"
				@click="resetPitch"
			>
				<span aria-hidden="true" :class="resetButtonFaceClass" />
			</button>
			<span
				class="text-[10px] leading-none font-medium"
				:class="fullDeckLabelClass"
			>
				reset
			</span>
			<span
				:data-testid="`deck-${deckIndex}-pitch-value`"
				:class="pitchValueClass"
				:style="pitchValueStyle"
			>
				{{ formattedPitch }}
			</span>
		</div>

		<div
			class="relative h-full min-w-0 flex-1 overflow-visible"
			:data-testid="`deck-${deckIndex}-pitch-module`"
		>
			<div
				class="flex h-[62px] flex-col overflow-hidden rounded-[3px] border"
				:class="moduleShellClass"
			>
				<div
					class="relative h-[25px] border-b"
					:class="[moduleDividerClass, compactScalePanelClass]"
				>
					<div :class="brushedScaleGrainClass" />
					<div
						class="absolute right-[12%] bottom-0 left-[12%] h-px"
						:class="legendMarkClass"
					/>
					<div
						v-for="mark in compactPitchMarks"
						:key="`${mark.left}-${mark.label ?? 'tick'}`"
						class="absolute bottom-0 -translate-x-1/2"
						:style="{ left: `${mark.left}%` }"
					>
						<span
							v-if="mark.label"
							class="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] leading-none font-semibold tabular-nums"
							:class="legendTextClass"
						>
							{{ mark.label }}
						</span>
						<span
							class="block"
							:class="[
								legendMarkClass,
								mark.major ? 'h-[6px] w-[5px]' : 'h-[4px] w-[3px]'
							]"
						/>
					</div>
					<div
						class="absolute top-[7px] left-1/2 h-2 w-4 -translate-x-1/2 rounded-[1px] border border-black/75 transition-all"
						:class="zeroLightClass"
					/>
				</div>

				<div class="relative min-h-0 flex-1" :class="compactRailPanelClass">
					<div :class="brushedRailGrainClass" />
					<div
						class="absolute top-1/2 right-4 left-4 h-2 -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,#11100e_0%,#020202_45%,#090807_68%,#181612_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.16),inset_0_-1px_2px_rgba(0,0,0,0.9)]"
					/>

					<div
						:data-testid="`deck-${deckIndex}-pitch-handle`"
						class="pointer-events-none absolute top-1/2 z-20 h-[calc(100%+2px)] w-[58px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[3px] border border-black/35 shadow-[2px_0_5px_rgba(0,0,0,0.45),inset_1px_0_0_rgba(255,255,255,0.82),inset_-1px_0_0_rgba(0,0,0,0.36)]"
						:class="compactFaderHandleClass"
						:style="compactHandleStyle"
					>
						<div
							class="absolute inset-y-0 left-[36%] w-px bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.38)_12%,rgba(0,0,0,0.5)_88%,transparent_100%)]"
						/>
						<div
							class="absolute inset-y-0 left-[64%] w-px bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.32)_12%,rgba(0,0,0,0.44)_88%,transparent_100%)]"
						/>
						<div
							class="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-950/65"
						/>
						<div class="absolute top-1 bottom-1 left-[46%] w-px bg-white/75" />
					</div>
				</div>
			</div>
			<input
				ref="compactInputRef"
				type="range"
				:min="-100"
				:max="100"
				:value="faderValue"
				:disabled="deck?.faderSliding"
				aria-label="Pitch adjustment"
				class="absolute inset-x-0 top-[18px] z-30 m-0 h-[52px] cursor-pointer touch-none appearance-none bg-transparent opacity-0 [direction:rtl] disabled:cursor-not-allowed"
				@pointerdown="handleCompactPitchPointerDown"
				@input="handleCompactPitchInput"
			/>
			<div
				class="pointer-events-none mt-1 text-center text-[10px] leading-none font-medium"
				:class="fullDeckLabelClass"
			>
				pitch adj.
			</div>
		</div>
	</div>
</template>
