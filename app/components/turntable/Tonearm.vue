<script setup lang="ts">
defineProps<{
	isPlaying: boolean
	layer: 'base' | 'arm'
}>()
</script>

<template>
	<!-- Base layer: pivot well + platform (renders below platter) -->
	<svg
		v-if="layer === 'base'"
		class="absolute top-3 -right-[50px] z-0 h-[190px] w-[100px]"
		viewBox="-25 0 100 210"
		overflow="visible"
	>
		<defs>
			<radialGradient id="pivotWell" cx="0.5" cy="0.5" r="0.5">
				<stop offset="0%" stop-color="#2a2a2a" />
				<stop offset="70%" stop-color="#222" />
				<stop offset="100%" stop-color="#1a1a1a" />
			</radialGradient>
			<radialGradient id="pivotPlatform" cx="0.45" cy="0.4" r="0.55">
				<stop offset="0%" stop-color="#444" />
				<stop offset="60%" stop-color="#333" />
				<stop offset="100%" stop-color="#2a2a2a" />
			</radialGradient>
		</defs>

		<circle
			cx="25"
			cy="34"
			r="33"
			fill="url(#pivotWell)"
			stroke="#111"
			stroke-width="0.8"
		/>
		<circle
			cx="25"
			cy="34"
			r="32"
			fill="none"
			stroke="rgba(255,255,255,0.06)"
			stroke-width="0.4"
		/>
		<circle
			cx="25"
			cy="34"
			r="26"
			fill="url(#pivotPlatform)"
			stroke="#222"
			stroke-width="0.3"
		/>
	</svg>

	<!-- Arm layer: arm + bearing housing (renders above platter) -->
	<svg
		v-else
		class="absolute top-3 -right-[50px] z-20 h-[190px] w-[100px]"
		viewBox="-25 0 100 210"
		overflow="visible"
	>
		<defs>
			<linearGradient
				id="armTube"
				x1="0"
				y1="0"
				x2="1"
				y2="0"
				gradientUnits="objectBoundingBox"
			>
				<stop offset="0%" stop-color="#909090" />
				<stop offset="20%" stop-color="#c8c8c8" />
				<stop offset="45%" stop-color="#e8e8e8" />
				<stop offset="70%" stop-color="#c0c0c0" />
				<stop offset="100%" stop-color="#909090" />
			</linearGradient>
			<linearGradient id="counterweight" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color="#808080" />
				<stop offset="25%" stop-color="#aaa" />
				<stop offset="50%" stop-color="#bbb" />
				<stop offset="75%" stop-color="#aaa" />
				<stop offset="100%" stop-color="#808080" />
			</linearGradient>
			<linearGradient id="cartridge" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#444" />
				<stop offset="50%" stop-color="#333" />
				<stop offset="100%" stop-color="#222" />
			</linearGradient>
			<radialGradient id="pivotPost" cx="0.4" cy="0.35" r="0.55">
				<stop offset="0%" stop-color="#ccc" />
				<stop offset="50%" stop-color="#aaa" />
				<stop offset="100%" stop-color="#888" />
			</radialGradient>
			<radialGradient id="pivotRing" cx="0.4" cy="0.35" r="0.55">
				<stop offset="0%" stop-color="#bbb" />
				<stop offset="50%" stop-color="#999" />
				<stop offset="100%" stop-color="#777" />
			</radialGradient>
		</defs>

		<!-- Rotating arm group -->
		<g
			:style="{
				transform: isPlaying ? 'rotate(22deg)' : 'rotate(0deg)',
				transformOrigin: '25px 34px',
				transition: 'transform 0.5s ease'
			}"
		>
			<!-- Arm tube -->
			<path
				d="M25,14 L25,85 C25,105 31,120 29,142 S10,172 5,178"
				stroke="url(#armTube)"
				stroke-width="5.5"
				fill="none"
				stroke-linecap="round"
			/>
			<!-- Tube specular highlight -->
			<path
				d="M26.5,16 L26.5,85 C26.5,105 32.5,120 30.5,142 S11.5,172 6.5,178"
				stroke="rgba(255,255,255,0.3)"
				stroke-width="0.8"
				fill="none"
			/>

			<!-- Counterweight (rendered after arm tube so it appears on top) -->
			<rect
				x="19"
				y="4"
				width="12"
				height="10"
				rx="1.5"
				fill="url(#counterweight)"
				stroke="#777"
				stroke-width="0.5"
			/>
			<rect
				x="20.5"
				y="6"
				width="9"
				height="6"
				rx="1"
				fill="none"
				stroke="#999"
				stroke-width="0.3"
			/>

			<!-- Headshell -->
			<g transform="translate(5,178) rotate(48)">
				<path
					d="M-4,-3 L4,-3 L4,-1 L5,-1 L5,8 L6,8 L6,14 L-6,14 L-6,8 L-5,8 L-5,-1 L-4,-1 Z"
					fill="#2a2a2a"
					stroke="#1a1a1a"
					stroke-width="0.4"
				/>
				<line
					x1="-3.5"
					y1="-2.5"
					x2="-3.5"
					y2="13.5"
					stroke="rgba(255,255,255,0.08)"
					stroke-width="0.5"
				/>
				<rect
					x="-4"
					y="9"
					width="3.5"
					height="1.5"
					rx="0.75"
					fill="#444"
					stroke="#333"
					stroke-width="0.2"
				/>
				<rect
					x="2"
					y="9"
					width="3.5"
					height="1.5"
					rx="0.75"
					fill="#444"
					stroke="#333"
					stroke-width="0.2"
				/>
				<circle
					cx="0.5"
					cy="4"
					r="1.8"
					fill="#444"
					stroke="#333"
					stroke-width="0.2"
				/>
				<path
					d="M5,3.5 C9,3.5 14,4 14,4.5 C14,5 9,5.5 5,5.5"
					fill="#2a2a2a"
					stroke="#1a1a1a"
					stroke-width="0.4"
				/>
				<rect
					x="-3"
					y="14"
					width="7"
					height="4"
					rx="0.3"
					fill="url(#cartridge)"
					stroke="#222"
					stroke-width="0.3"
				/>
				<rect
					x="-1.5"
					y="18"
					width="4"
					height="2.5"
					rx="0.3"
					fill="#3a3a3a"
					stroke="#222"
					stroke-width="0.2"
				/>
				<line
					x1="0.5"
					y1="20.5"
					x2="0.5"
					y2="24"
					stroke="#ccc"
					stroke-width="0.4"
					stroke-linecap="round"
				/>
				<circle cx="0.5" cy="24" r="0.6" fill="#eee" />
			</g>
		</g>

		<!-- Bearing housing + ring + cap (above arm) -->
		<circle
			cx="25"
			cy="34"
			r="12"
			fill="url(#pivotPost)"
			stroke="#777"
			stroke-width="0.4"
		/>
		<circle
			cx="25"
			cy="34"
			r="11.5"
			fill="none"
			stroke="rgba(255,255,255,0.15)"
			stroke-width="0.3"
		/>
		<circle
			cx="25"
			cy="34"
			r="7.5"
			fill="url(#pivotRing)"
			stroke="#666"
			stroke-width="0.3"
		/>
		<circle
			cx="25"
			cy="34"
			r="7.5"
			fill="none"
			stroke="#bbb"
			stroke-width="0.4"
			stroke-dasharray="0.6 0.5"
		/>
		<circle
			cx="25"
			cy="34"
			r="3.5"
			fill="#999"
			stroke="#777"
			stroke-width="0.3"
		/>
		<circle cx="25" cy="34" r="1.8" fill="#777" />
	</svg>
</template>
