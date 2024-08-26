<template>
	<svg
		ref="platter"
		viewBox="0 0 366 366"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<g class="slipmat">
			<circle cx="183" cy="183" r="183" fill="#222" />
			<circle
				cx="183"
				cy="183"
				r="163"
				stroke-width="10"
				stroke="var(--logo-medium)"
				fill="transparent"
			/>
			<text x="183" y="158" fill="var(--logo-medium)">Crate</text>
			<text x="183" y="258" fill="var(--logo-light)">Guide</text>
		</g>
	</svg>
</template>

<style scoped lang="scss">
.slipmat {
	text {
		font-size: 6rem;
		font-weight: 600;
		letter-spacing: 0.1rem;
		text-anchor: middle;
		font-family: 'Egyptian505', serif;
		user-select: none;
	}
}
</style>
