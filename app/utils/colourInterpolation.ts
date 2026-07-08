export const pitchDeltaColourStops = {
	slower: '#93c5fd',
	neutral: '#a7f3d0',
	faster: '#fca5a5'
} as const

const suggestionScoreColourStops = {
	low: '#a1a1aa',
	mid: '#fcd34d',
	high: '#a7f3d0'
} as const

type RgbColour = {
	r: number
	g: number
	b: number
}

export function clampNumber(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value))
}

function hexToRgb(hex: string): RgbColour {
	const value = hex.replace('#', '')
	const parsed = Number.parseInt(value, 16)
	return {
		r: (parsed >> 16) & 255,
		g: (parsed >> 8) & 255,
		b: parsed & 255
	}
}

function rgbToHex({ r, g, b }: RgbColour) {
	const toHex = (value: number) =>
		Math.round(value).toString(16).padStart(2, '0')
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function interpolateHexColour(
	start: string,
	end: string,
	amount: number
) {
	const from = hexToRgb(start)
	const to = hexToRgb(end)
	const t = clampNumber(amount, 0, 1)

	return rgbToHex({
		r: from.r + (to.r - from.r) * t,
		g: from.g + (to.g - from.g) * t,
		b: from.b + (to.b - from.b) * t
	})
}

export function hexToRgba(hex: string, alpha: number) {
	const { r, g, b } = hexToRgb(hex)
	return `rgba(${r},${g},${b},${alpha})`
}

export function getPitchDeltaColour(
	delta: number,
	maxMagnitude = 1,
	neutralThreshold = maxMagnitude * 0.01
) {
	const pitch = clampNumber(delta, -maxMagnitude, maxMagnitude)
	if (Math.abs(pitch) <= neutralThreshold) return pitchDeltaColourStops.neutral

	const target =
		pitch < 0 ? pitchDeltaColourStops.slower : pitchDeltaColourStops.faster
	return interpolateHexColour(
		pitchDeltaColourStops.neutral,
		target,
		Math.abs(pitch) / maxMagnitude
	)
}

export function getSuggestionScoreColour(score: number) {
	const clampedScore = clampNumber(score, 0, 1)
	if (clampedScore <= 0.5) {
		return interpolateHexColour(
			suggestionScoreColourStops.low,
			suggestionScoreColourStops.mid,
			clampedScore / 0.5
		)
	}

	return interpolateHexColour(
		suggestionScoreColourStops.mid,
		suggestionScoreColourStops.high,
		(clampedScore - 0.5) / 0.5
	)
}
