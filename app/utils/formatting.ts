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
export function parseUserDuration(input: string): number | null {
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

/**
 * Format key number to Camelot notation
 */
export function formatKey(key: number | null): string {
	if (key === null) return ''

	// Camelot key mapping
	const keys = [
		'8B',
		'3B',
		'10B',
		'5B',
		'12B',
		'7B',
		'2B',
		'9B',
		'4B',
		'11B',
		'6B',
		'1B',
		'8A',
		'3A',
		'10A',
		'5A',
		'12A',
		'7A',
		'2A',
		'9A',
		'4A',
		'11A',
		'6A',
		'1A'
	]

	return keys[key] || ''
}
