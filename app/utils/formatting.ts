/**
 * Formatting utilities for track and record data
 */

/**
 * Format duration from seconds to MM:SS format
 */
export function formatDuration(seconds: number | null): string {
	if (!seconds) return ''
	const minutes = Math.floor(seconds / 60)
	const remainingSeconds = seconds % 60
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Parse duration from string input (MM:SS or plain seconds) to seconds number
 */
export function parseDuration(input: string): number | null {
	if (!input.trim()) return null

	// Handle MM:SS format
	const colonMatch = input.match(/^(\d+):(\d+)$/)
	if (colonMatch) {
		const minutes = parseInt(colonMatch[1] || '0', 10)
		const seconds = parseInt(colonMatch[2] || '0', 10)
		return minutes * 60 + seconds
	}

	// Handle plain seconds
	const seconds = parseInt(input, 10)
	return isNaN(seconds) ? null : seconds
}

export function parseBpm(numStr: string): number | null {
	if (!numStr.trim()) return null
	const num = parseFloat(numStr)
	return isNaN(num) ? null : num
}
