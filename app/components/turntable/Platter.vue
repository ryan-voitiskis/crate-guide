<script setup lang="ts">
import {
	calculateDeltaTime,
	calculateNextAngle,
	calculateTargetVelocity,
	shouldContinueAnimation,
	smoothVelocity
} from '~/utils/platter-physics'

const props = defineProps<{
	deckIndex: number
	deck: Deck
}>()

const records = useRecordsStore()
const session = useSessionStore()

const platter = ref<SVGElement | null>(null)

// Get album cover from record
const coverUrl = computed(() => {
	if (!props.deck.loadedTrack) return null
	const record = records.getRecordById(props.deck.loadedTrack.record_id)
	return record?.cover ?? null
})

// Target angular velocity in degrees per millisecond
const targetVelocity = computed(() =>
	calculateTargetVelocity(
		props.deck.rpm,
		props.deck.pitch,
		session.pitchRange,
		props.deck.isPlaying
	)
)

// Animation state
let animationId: number | null = null
let lastTime = 0
let angle = 0
let velocity = 0

function animate(time: number) {
	if (!platter.value) {
		animationId = null
		return
	}

	const deltaTime = calculateDeltaTime(time, lastTime)
	lastTime = time

	const target = targetVelocity.value
	velocity = smoothVelocity(velocity, target, deltaTime)
	angle = calculateNextAngle(angle, velocity, deltaTime)

	platter.value.style.transform = `rotate(${angle}deg)`

	if (shouldContinueAnimation(target, velocity)) {
		animationId = requestAnimationFrame(animate)
	} else {
		velocity = 0
		animationId = null
	}
}

function startAnimation() {
	if (animationId) return // Already running
	lastTime = 0
	animationId = requestAnimationFrame(animate)
}

// Watch for play state changes
watch(
	() => props.deck.isPlaying,
	(isPlaying) => {
		if (isPlaying) {
			startAnimation()
		}
		// When stopping, animation continues (decelerating) until velocity reaches 0
	},
	{ immediate: true }
)

// Cleanup on unmount
onUnmounted(() => {
	if (animationId) {
		cancelAnimationFrame(animationId)
		animationId = null
	}
})
</script>

<template>
	<svg
		ref="platter"
		width="208"
		height="208"
		viewBox="0 0 366 366"
		class="shrink-0 will-change-transform"
	>
		<!-- Platter ring (metallic rim) -->
		<g transform="translate(183, 183)">
			<circle r="183" fill="#000" />
			<circle r="181" fill="#d7d8dd" />
			<circle r="180" fill="#222" />
			<!-- Dot patterns -->
			<circle
				r="177.7"
				fill="none"
				stroke="#d7d8dd"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-dasharray="0,3.303"
			/>
			<circle
				r="174"
				fill="none"
				stroke="#d7d8dd"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-dasharray="0,3.33333"
			/>
			<circle
				r="170"
				fill="none"
				stroke="#d7d8dd"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-dasharray="0,3.3702"
			/>
			<circle
				r="167"
				fill="none"
				stroke="#d7d8dd"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-dasharray="0,3.418"
			/>
			<circle r="165" fill="#d7d8dd" />

			<!-- Record with cover (when track loaded) -->
			<g v-if="deck.loadedTrack">
				<defs>
					<clipPath :id="'coverClip-' + deckIndex">
						<circle r="51" />
					</clipPath>
				</defs>
				<!-- Record grooves -->
				<circle r="164" fill="#000" />
				<circle r="162.2" fill="#151515" />
				<circle r="142" fill="#000" />
				<circle r="141" fill="#151515" />
				<circle r="122" fill="#000" />
				<circle r="121" fill="#151515" />
				<circle r="100" fill="#000" />
				<circle r="99" fill="#151515" />
				<circle r="66" fill="#030303" />
				<!-- Album cover -->
				<image
					v-if="coverUrl"
					:href="coverUrl"
					height="104"
					width="104"
					:clip-path="'url(#coverClip-' + deckIndex + ')'"
					x="-52"
					y="-52"
				/>
				<!-- Fallback center if no cover -->
				<circle v-else r="51" class="fill-primary/20" />
				<circle r="3" fill="#d7d8dd" />
			</g>

			<!-- Slipmat (when no track loaded) -->
			<g v-else>
				<circle r="164" fill="#222" />
				<circle r="154" stroke-width="6" stroke="#8c4394" fill="transparent" />
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
	</svg>
</template>
