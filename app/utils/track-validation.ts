import { parseKeyComposite } from './keyFunctions'

export function isValidTrackPosition(position: string): boolean {
	if (position === '') return true
	return /^[A-Z]\d+$|^[A-Z]\d+-[A-Z]\d+$/i.test(position.trim())
}

export function isValidDurationFormat(duration: string): boolean {
	if (duration === '') return true
	return /^[0-9]{1,2}:[0-5][0-9]$/.test(duration)
}

export function isValidBPM(bpm: string): boolean {
	if (bpm === '') return true
	const num = parseFloat(bpm)
	return !isNaN(num) && num >= 30 && num <= 300
}

export function isValidKeyComposite(keyComposite: string): boolean {
	if (keyComposite === 'none') return true
	const parsed = parseKeyComposite(keyComposite)
	return parsed.key !== null && parsed.mode !== null
}

export const POSITION_ERROR_MESSAGE =
	'Position must be empty or like A1, B2, or A1-A2'

export const DURATION_ERROR_MESSAGE =
	'Duration must be empty or MM:SS format (e.g., 3:45)'

export const BPM_ERROR_MESSAGE = 'BPM must be empty or a number between 30-300'

export const KEY_ERROR_MESSAGE =
	'Please select a valid key or leave unspecified'
