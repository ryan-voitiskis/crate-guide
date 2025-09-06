/**
 * Discogs ID validation utilities
 */

interface ValidationResult {
	isValid: boolean
	message: string
	normalizedId: number | null
}

/**
 * Validates a Discogs artist ID
 * @param artistId - The artist ID to validate
 * @returns Validation result with isValid boolean and message
 */
export function validateDiscogsArtistId(artistId: string | number | null | undefined): ValidationResult {
	const result: ValidationResult = {
		isValid: false,
		message: '',
		normalizedId: null
	}

	// Check if input is provided
	if (artistId === null || artistId === undefined || artistId === '') {
		result.message = 'Artist ID is required'
		return result
	}

	// Convert to string for processing
	const idStr = String(artistId).trim()

	// Check if empty after trimming
	if (idStr === '') {
		result.message = 'Artist ID cannot be empty'
		return result
	}

	// Check if it's a valid positive integer
	const idNum = parseInt(idStr, 10)

	// Validate it's a number and the string representation matches (no decimals, extra chars)
	if (isNaN(idNum) || String(idNum) !== idStr) {
		result.message = 'Artist ID must be a valid integer'
		return result
	}

	// Check if it's positive (Discogs IDs start from 1)
	if (idNum <= 0) {
		result.message = 'Artist ID must be a positive integer greater than 0'
		return result
	}

	// Check reasonable upper bound (current max is in millions, set generous limit)
	if (idNum > 999999999) {
		result.message = 'Artist ID exceeds reasonable maximum value'
		return result
	}

	// If we get here, it's valid
	result.isValid = true
	result.message = 'Valid Discogs artist ID'
	result.normalizedId = idNum

	return result
}

/**
 * Regex pattern for Discogs artist ID validation (alternative approach)
 */
export const DISCOGS_ARTIST_ID_REGEX = /^[1-9]\d{0,8}$/

/**
 * Simple regex-based validation for Discogs artist ID
 * @param artistId - The artist ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidDiscogsArtistId(artistId: string | number | null | undefined): boolean {
	if (artistId === null || artistId === undefined) return false
	const idStr = String(artistId).trim()
	return DISCOGS_ARTIST_ID_REGEX.test(idStr)
}

/**
 * Validates a Discogs artist ID and returns normalized number or null
 * @param artistId - The artist ID to validate and normalize
 * @returns Normalized ID number or null if invalid
 */
export function normalizeDiscogsArtistId(artistId: string | number | null | undefined): number | null {
	const validation = validateDiscogsArtistId(artistId)
	return validation.normalizedId
}
