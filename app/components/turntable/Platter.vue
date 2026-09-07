<script setup lang="ts">
import {
	STROBE_DOT_COUNTS,
	calculateDeltaTime,
	calculateNextAngle,
	calculatePlatterMotionMix,
	calculateStrobeApparentVelocity,
	calculateStrobeLockPitch,
	calculateStrobeRenderAngle,
	calculateTargetVelocity,
	shouldContinueAnimation,
	smoothVelocity
} from '~/utils/platter-physics'

const props = defineProps<{
	deckIndex: number
	deck: Deck
}>()

const records = useWorkbenchRecordsStore()
const session = useWorkbenchSessionStore()
const { getCoverUrl } = useRecordCover()

const rotor = ref<SVGGElement | null>(null)
const physicalDots = ref<SVGGElement | null>(null)
const strobeLayer = ref<SVGGElement | null>(null)
let strobeRowElements: SVGGElement[] = []

const strobeRows = [
	{
		count: STROBE_DOT_COUNTS[0],
		radius: 177.6,
		diameter: 1.8,
		pitch: calculateStrobeLockPitch(STROBE_DOT_COUNTS[0])
	},
	{
		count: STROBE_DOT_COUNTS[1],
		radius: 174,
		diameter: 3,
		pitch: calculateStrobeLockPitch(STROBE_DOT_COUNTS[1])
	},
	{
		count: STROBE_DOT_COUNTS[2],
		radius: 170.2,
		diameter: 1.8,
		pitch: calculateStrobeLockPitch(STROBE_DOT_COUNTS[2])
	},
	{
		count: STROBE_DOT_COUNTS[3],
		radius: 166.8,
		diameter: 1.8,
		pitch: calculateStrobeLockPitch(STROBE_DOT_COUNTS[3])
	}
] as const

const definitionId = (name: string) => `${name}-${props.deckIndex}`
const strobeDotRows = strobeRows.map((row) => ({
	...row,
	dots: Array.from({ length: row.count }, (_, index) => {
		const angle = (index * 2 * Math.PI) / row.count
		return { x: row.radius * Math.cos(angle), y: row.radius * Math.sin(angle) }
	})
}))

// Get album cover from record
const coverRecord = computed(() => {
	if (!props.deck.loadedTrack) return null
	return records.getRecordById(props.deck.loadedTrack.record_id) ?? null
})
const coverUrl = ref<string | null>(null)
let coverRequest = 0
let acceptingCoverResults = true

watch(
	() =>
		coverRecord.value
			? getCoverReferenceKey(coverRecord.value.cover)
			: 'no-record',
	async () => {
		const request = ++coverRequest
		const nextUrl = coverRecord.value
			? await getCoverUrl(coverRecord.value)
			: null
		if (acceptingCoverResults && request === coverRequest)
			coverUrl.value = nextUrl
	},
	{ immediate: true }
)

// Target angular velocity in degrees per millisecond
const targetVelocity = computed(() =>
	calculateTargetVelocity(
		props.deck.rpm,
		props.deck.pitch,
		session.pitchRange,
		props.deck.isPlaying
	)
)

// The record follows physical platter motion. Each illuminated mirror row
// follows its own stroboscopically aliased phase instead of the monitor frame.
let animationId: number | null = null
let lastTime = 0
let angle = 0
let velocity = 0
const strobeAngles = strobeRows.map(() => 0)

function renderFrame(deltaTime: number) {
	angle = calculateNextAngle(angle, velocity, deltaTime)
	rotor.value?.setAttribute('transform', `rotate(${angle})`)

	const motionMix = calculatePlatterMotionMix(velocity)
	if (physicalDots.value) {
		physicalDots.value.style.opacity = `${1 - motionMix}`
		physicalDots.value.setAttribute('transform', `rotate(${angle})`)
	}
	if (strobeLayer.value)
		strobeLayer.value.style.opacity = `${0.78 + motionMix * 0.22}`

	strobeRows.forEach((row, index) => {
		const apparentVelocity = calculateStrobeApparentVelocity(
			velocity,
			props.deck.rpm,
			row.count
		)
		strobeAngles[index] = calculateNextAngle(
			strobeAngles[index] ?? 0,
			apparentVelocity,
			deltaTime
		)
		if (velocity === 0) strobeAngles[index] = angle
		const renderAngle = calculateStrobeRenderAngle(
			angle,
			strobeAngles[index] ?? angle,
			velocity,
			row.count
		)
		strobeRowElements[index]?.setAttribute(
			'transform',
			`rotate(${renderAngle})`
		)
	})
}

function animate(time: number) {
	if (!rotor.value) {
		animationId = null
		return
	}

	const deltaTime = calculateDeltaTime(time, lastTime)
	lastTime = time

	const target = targetVelocity.value
	velocity = smoothVelocity(velocity, target, deltaTime)
	renderFrame(deltaTime)

	if (shouldContinueAnimation(target, velocity)) {
		animationId = requestAnimationFrame(animate)
	} else {
		velocity = 0
		renderFrame(0)
		animationId = null
	}
}

function startAnimation() {
	if (animationId !== null || !rotor.value) return
	lastTime = 0
	animationId = requestAnimationFrame(animate)
}

watch(
	() => props.deck.isPlaying,
	(isPlaying) => {
		if (isPlaying) startAnimation()
	}
)

onMounted(() => {
	strobeRowElements = Array.from(
		strobeLayer.value?.querySelectorAll<SVGGElement>('[data-strobe-row]') ?? []
	)
	renderFrame(0)
	if (props.deck.isPlaying) startAnimation()
})

onUnmounted(() => {
	acceptingCoverResults = false
	coverRequest += 1
	if (animationId !== null) {
		cancelAnimationFrame(animationId)
		animationId = null
	}
})
</script>

<template>
	<svg
		:data-testid="`deck-${deckIndex}-platter`"
		width="224"
		height="224"
		viewBox="0 0 366 366"
		class="shrink-0"
	>
		<defs>
			<!-- Shared circular mirrors: no dash length to stretch the round caps. -->
			<g
				v-for="row in strobeDotRows"
				:id="definitionId(`mirrors-${row.count}`)"
				:key="row.count"
			>
				<circle
					v-for="(dot, index) in row.dots"
					:key="index"
					:cx="dot.x"
					:cy="dot.y"
					:r="row.diameter / 2"
				/>
			</g>
			<!-- 90-degree cone, centred northeast (-45 degrees), from the switch. -->
			<path
				:id="definitionId('beam-shape')"
				d="M24 320 L24 195 A125 125 0 0 1 149 320 Z"
			/>
			<linearGradient
				:id="definitionId('rim-metal')"
				x1="0"
				y1="0"
				x2="1"
				y2="1"
			>
				<stop offset="0" stop-color="#f0f1f2" />
				<stop offset="0.22" stop-color="#777a7d" />
				<stop offset="0.5" stop-color="#d6d7d8" />
				<stop offset="0.76" stop-color="#4a4c4f" />
				<stop offset="1" stop-color="#bfc1c3" />
			</linearGradient>
			<linearGradient
				:id="definitionId('blur-metal')"
				x1="0"
				y1="0"
				x2="0"
				y2="1"
			>
				<stop offset="0" stop-color="#c8c9ca" />
				<stop offset="0.38" stop-color="#55575a" />
				<stop offset="0.7" stop-color="#8c8f91" />
				<stop offset="1" stop-color="#36383a" />
			</linearGradient>
			<radialGradient
				:id="definitionId('strobe-mask-gradient')"
				gradientUnits="userSpaceOnUse"
				cx="24"
				cy="320"
				r="125"
			>
				<stop offset="0" stop-color="white" />
				<stop offset="0.4" stop-color="white" />
				<stop offset="0.7" stop-color="white" stop-opacity="0.6" />
				<stop offset="1" stop-color="black" />
			</radialGradient>
			<radialGradient
				:id="definitionId('beam-red')"
				gradientUnits="userSpaceOnUse"
				cx="24"
				cy="320"
				r="125"
			>
				<stop offset="0" stop-color="#ff302b" stop-opacity="0.95" />
				<stop offset="0.35" stop-color="#ff211b" stop-opacity="0.8" />
				<stop offset="0.7" stop-color="#ed171c" stop-opacity="0.35" />
				<stop offset="1" stop-color="#e31319" stop-opacity="0" />
			</radialGradient>
			<linearGradient :id="definitionId('power-cap')" x2="0.6" y2="1">
				<stop offset="0" stop-color="#505152" />
				<stop offset="0.45" stop-color="#292a2b" />
				<stop offset="1" stop-color="#131415" />
			</linearGradient>
			<filter
				:id="definitionId('rim-blur')"
				x="-10%"
				y="-10%"
				width="120%"
				height="120%"
			>
				<feGaussianBlur stdDeviation="0.72" />
			</filter>
			<filter
				:id="definitionId('lamp-glow')"
				x="-100%"
				y="-100%"
				width="300%"
				height="300%"
			>
				<feGaussianBlur stdDeviation="2.5" />
			</filter>
			<filter
				:id="definitionId('dot-glow')"
				x="-20%"
				y="-20%"
				width="140%"
				height="140%"
			>
				<feGaussianBlur in="SourceGraphic" stdDeviation="0.65" result="blur" />
				<feMerge>
					<feMergeNode in="blur" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
			<mask
				:id="definitionId('strobe-mask')"
				maskUnits="userSpaceOnUse"
				x="-183"
				y="-183"
				width="366"
				height="366"
			>
				<rect x="-183" y="-183" width="366" height="366" fill="black" />
				<use
					:href="`#${definitionId('beam-shape')}`"
					transform="translate(-183 -183)"
					:fill="`url(#${definitionId('strobe-mask-gradient')})`"
					:filter="`url(#${definitionId('lamp-glow')})`"
				/>
			</mask>
			<!-- Complementary masks give each mirror one representation in the beam.
			     Both masks stay fixed to the lamp, outside the rotating groups. -->
			<mask
				:id="definitionId('unlit-mirrors-mask')"
				maskUnits="userSpaceOnUse"
				x="-183"
				y="-183"
				width="366"
				height="366"
			>
				<rect x="-183" y="-183" width="366" height="366" fill="white" />
				<rect
					x="-183"
					y="-183"
					width="366"
					height="366"
					fill="black"
					:mask="`url(#${definitionId('strobe-mask')})`"
				/>
			</mask>
			<clipPath :id="definitionId('cover-clip')">
				<circle r="51" />
			</clipPath>
		</defs>

		<!-- Light spills from the platter-facing side of the power-switch tower. -->
		<use
			:href="`#${definitionId('beam-shape')}`"
			:fill="`url(#${definitionId('beam-red')})`"
			:filter="`url(#${definitionId('lamp-glow')})`"
		/>

		<g transform="translate(183, 183)">
			<!-- Static rim: at speed the unlit mirrors integrate into metallic bands. -->
			<circle r="183" fill="#070707" />
			<circle r="181" :fill="`url(#${definitionId('rim-metal')})`" />
			<circle r="179.8" fill="#171819" />
			<g :filter="`url(#${definitionId('rim-blur')})`">
				<circle
					v-for="row in strobeRows"
					:key="`blur-${row.count}`"
					:r="row.radius"
					fill="none"
					:stroke="`url(#${definitionId('blur-metal')})`"
					:stroke-width="row.diameter + 0.6"
					opacity="0.72"
				/>
			</g>
			<circle r="164.8" fill="#b9bbbd" />
			<circle
				r="173"
				fill="none"
				stroke="#f52221"
				stroke-width="18"
				opacity="0.62"
				:mask="`url(#${definitionId('strobe-mask')})`"
			/>

			<!-- Unlit physical mirrors: the fixed beam is owned by strobeLayer. -->
			<g :mask="`url(#${definitionId('unlit-mirrors-mask')})`">
				<g ref="physicalDots">
					<use
						v-for="row in strobeRows"
						:key="`physical-${row.count}`"
						:href="`#${definitionId(`mirrors-${row.count}`)}`"
						fill="#dadcdd"
					/>
				</g>
			</g>

			<!-- Physical platter contents. -->
			<g ref="rotor" class="will-change-transform">
				<!-- Record with cover (when track loaded) -->
				<g v-if="deck.loadedTrack">
					<circle r="164" fill="#050505" />
					<circle r="162.2" fill="#151515" />
					<circle r="142" fill="#050505" />
					<circle r="141" fill="#151515" />
					<circle r="122" fill="#050505" />
					<circle r="121" fill="#151515" />
					<circle r="100" fill="#050505" />
					<circle r="99" fill="#151515" />
					<circle r="66" fill="#030303" />
					<image
						v-if="coverUrl"
						:href="coverUrl"
						height="104"
						width="104"
						:clip-path="`url(#${definitionId('cover-clip')})`"
						x="-52"
						y="-52"
					/>
					<circle v-else r="51" class="fill-primary/20" />
					<circle r="3" fill="#d7d8dd" />
				</g>

				<!-- Slipmat (when no track loaded) -->
				<g v-else>
					<circle r="164" fill="#222" />
					<circle
						r="154"
						stroke-width="6"
						stroke="#8c4394"
						fill="transparent"
					/>
					<text
						y="-12"
						fill="#e8e7e2"
						class="font-[Egyptian505,serif] select-none"
						font-size="92"
						font-weight="700"
						letter-spacing="0.1rem"
						length-adjust="spacingAndGlyphs"
						stroke="#e8e7e2"
						stroke-width="0.8"
						text-anchor="middle"
						text-length="255"
						:transform="deckIndex % 2 === 1 ? 'rotate(180)' : ''"
					>
						Crate
					</text>
					<text
						y="-12"
						fill="#8c4394"
						class="font-[Egyptian505,serif] select-none"
						font-size="92"
						font-weight="700"
						letter-spacing="0.1rem"
						length-adjust="spacingAndGlyphs"
						stroke="#8c4394"
						stroke-width="0.8"
						text-anchor="middle"
						text-length="255"
						:transform="deckIndex % 2 === 0 ? 'rotate(180)' : ''"
					>
						Guide
					</text>
					<circle r="3" fill="#d7d8dd" />
				</g>
			</g>

			<!-- Fixed light washes over the vinyl and catches its concentric grooves. -->
			<g v-if="deck.loadedTrack" :mask="`url(#${definitionId('strobe-mask')})`">
				<circle r="164" fill="#ef2524" opacity="0.18" />
				<circle
					v-for="radius in [100, 122, 142, 161]"
					:key="radius"
					:r="radius"
					fill="none"
					stroke="#ff7562"
					stroke-width="1"
					opacity="0.28"
				/>
			</g>

			<!-- Only mirrors reached by the fixed lamp show the synthetic strobe. -->
			<g
				ref="strobeLayer"
				:mask="`url(#${definitionId('strobe-mask')})`"
				:filter="`url(#${definitionId('dot-glow')})`"
			>
				<g
					v-for="row in strobeRows"
					:key="`strobe-${row.count}`"
					data-strobe-row
					:data-lock-pitch="row.pitch.toFixed(2)"
				>
					<use
						:href="`#${definitionId(`mirrors-${row.count}`)}`"
						fill="#ffd0c5"
					/>
				</g>
			</g>

			<!-- Machined inner lip catches the lamp without rotating as a pattern. -->
			<circle
				r="164.9"
				fill="none"
				stroke="#f1a39c"
				stroke-width="1.1"
				opacity="0.4"
				:mask="`url(#${definitionId('strobe-mask')})`"
			/>
		</g>

		<!-- Top-down view of the cylindrical power switch. Its side-mounted lamp
		     is hidden beneath the cap; only the illumination on the deck is visible. -->
		<g aria-hidden="true" :data-testid="`deck-${deckIndex}-power-strobe`">
			<circle
				cx="24"
				cy="320"
				r="20"
				:fill="`url(#${definitionId('power-cap')})`"
				:stroke="`url(#${definitionId('rim-metal')})`"
				stroke-width="3.5"
			/>
			<path d="M27 309 L30 304" stroke="#e1e0dc" stroke-width="1.6" />
			<text x="24" y="322" text-anchor="middle" fill="#d1d0cc" font-size="4.5">
				power
			</text>
			<text x="24" y="328" text-anchor="middle" fill="#a7a7a4" font-size="3.8">
				off · on
			</text>
		</g>
	</svg>
</template>
