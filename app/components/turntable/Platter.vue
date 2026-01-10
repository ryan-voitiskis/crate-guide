<script setup lang="ts">
const props = defineProps<{
	deckIndex: number
	deck: Deck
}>()

const records = useRecordsStore()
const session = useSessionStore()

// Get album cover from record
const coverUrl = computed(() => {
	if (!props.deck.loadedTrack) return null
	const record = records.getRecordById(props.deck.loadedTrack.record_id)
	return record?.cover ?? null
})

// Calculate rotation speed based on RPM and pitch
const rotationDuration = computed(() => {
	const baseDuration = props.deck.rpm === 33 ? 1.818 : 1.333 // seconds per rotation
	const pitchFactor = 1 + (props.deck.pitch / 100) * (session.pitchRange / 100)
	return baseDuration / pitchFactor
})
</script>

<template>
	<svg
		width="192"
		height="192"
		viewBox="0 0 366 366"
		class="shrink-0"
		:class="{ 'animate-spin-platter': deck.isPlaying }"
		:style="{ animationDuration: rotationDuration + 's' }"
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
				<circle r="146" stroke-width="10" stroke="#8c4394" fill="transparent" />
				<text
					y="-23"
					fill="#8c4394"
					class="select-none"
					font-size="80"
					font-weight="600"
					letter-spacing="0.1em"
					text-anchor="middle"
					font-family="serif"
					:transform="deckIndex % 2 === 1 ? 'rotate(180)' : ''"
				>
					Crate
				</text>
				<text
					y="-23"
					fill="#b9adda"
					class="select-none"
					font-size="80"
					font-weight="600"
					letter-spacing="0.1em"
					text-anchor="middle"
					font-family="serif"
					:transform="deckIndex % 2 === 0 ? 'rotate(180)' : ''"
				>
					Guide
				</text>
				<circle r="3" fill="#d7d8dd" />
			</g>
		</g>
	</svg>
</template>

<style scoped>
.animate-spin-platter {
	animation: spin linear infinite;
}

@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>
