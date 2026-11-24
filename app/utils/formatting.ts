export function msToMMSS(milliseconds: number | null): string {
	if (!milliseconds) return ''

	const totalSeconds = Math.floor(milliseconds / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60

	return seconds < 10 ? `${minutes}:0${seconds}` : `${minutes}:${seconds}`
}

export function mmssToMs(input: string): number | null {
	if (!input) return null
	const colonIndex = input.indexOf(':')
	if (colonIndex > 0) {
		const minutes = +input.slice(0, colonIndex)
		const seconds = +input.slice(colonIndex + 1)
		if (minutes === minutes && seconds === seconds)
			return (minutes * 60 + seconds) * 1000
		return null
	}
	const seconds = +input
	return seconds === seconds ? seconds * 1000 : null
}

export const MIN_BPM = 30
export const MAX_BPM = 300

export function isBpmInRange(bpm: number): boolean {
	return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM
}

export function parseBPM(input: string): number | null {
	const normalized = input.trim()
	if (!normalized) return null
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null

	const bpm = Number(normalized)
	return isBpmInRange(bpm) ? bpm : null
}
