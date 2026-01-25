type Option = {
	id: string
	name: string
}

export type HarmonyScore = {
	harmonicAffinity: number | null // 0 - 1 compatibility of keys, 1 is a perfect combination
	keyCombination: number // the index of keyCombinations array
}

// Custom number sort function. Sorts null last, reverse optional.
// https://stackoverflow.com/questions/74356048/typescript-declare-type-of-a-keyof-a-generic-object-param
export function sortNum(field: string, reverse = false) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (a: Record<string, any>, b: Record<string, any>) =>
		(a[field] - b[field]) * (reverse ? -1 : 1)
}

export type KeyAndMode = {
	key: number
	mode: number
}

export type Key = {
	pitchClass: number
	tone: string
	camelotMajor: number
	camelotMinor: number
	majorColour: string
	minorColour: string
}

export const keyCombinations = [
	'Same key',
	'Up a fifth',
	'Down a fifth',
	'Minor to Major',
	'Major to Minor'
]

export const pitchClassMap: Key[] = [
	{
		pitchClass: 0,
		tone: 'C',
		camelotMajor: 8,
		camelotMinor: 5,
		majorColour: '#EE82D9',
		minorColour: '#FDBFA7'
	},
	{
		pitchClass: 1,
		tone: 'C♯ / D♭',
		camelotMajor: 3,
		camelotMinor: 12,
		majorColour: '#86F24F',
		minorColour: '#55F0F0'
	},
	{
		pitchClass: 2,
		tone: 'D',
		camelotMajor: 10,
		camelotMinor: 7,
		majorColour: '#9FB6FF',
		minorColour: '#FDAACC'
	},
	{
		pitchClass: 3,
		tone: 'D♯ / E♭',
		camelotMajor: 5,
		camelotMinor: 2,
		majorColour: '#FFA07C',
		minorColour: '#7DF2AA'
	},
	{
		pitchClass: 4,
		tone: 'E',
		camelotMajor: 12,
		camelotMinor: 9,
		majorColour: '#00EBEB',
		minorColour: '#DDB4FD'
	},
	{
		pitchClass: 5,
		tone: 'F',
		camelotMajor: 7,
		camelotMinor: 4,
		majorColour: '#FF81B4',
		minorColour: '#E8DAA1'
	},
	{
		pitchClass: 6,
		tone: 'F♯ / G♭',
		camelotMajor: 2,
		camelotMinor: 11,
		majorColour: '#3CEE81',
		minorColour: '#8EE4F9'
	},
	{
		pitchClass: 7,
		tone: 'G',
		camelotMajor: 9,
		camelotMinor: 6,
		majorColour: '#CE8FFF',
		minorColour: '#FDAFB7'
	},
	{
		pitchClass: 8,
		tone: 'G♯ / A♭',
		camelotMajor: 4,
		camelotMinor: 1,
		majorColour: '#DFCA73',
		minorColour: '#56F1DA'
	},
	{
		pitchClass: 9,
		tone: 'A',
		camelotMajor: 11,
		camelotMinor: 8,
		majorColour: '#56D9F9',
		minorColour: '#F2ABE4'
	},
	{
		pitchClass: 10,
		tone: 'A♯ / B♭',
		camelotMajor: 6,
		camelotMinor: 3,
		majorColour: '#FF8894',
		minorColour: '#AEF589'
	},
	{
		pitchClass: 11,
		tone: 'B',
		camelotMajor: 1,
		camelotMinor: 10,
		majorColour: '#01EDCA',
		minorColour: '#BECDFD'
	}
]

export function getCamelotMajor(pitchClass: number): number {
	const match = pitchClassMap.find((i) => i.pitchClass === pitchClass)
	if (!match) throw new Error(`Unknown pitch class: ${pitchClass}`)
	return match.camelotMajor
}

export function getCamelotMinor(pitchClass: number): number {
	const match = pitchClassMap.find((i) => i.pitchClass === pitchClass)
	if (!match) throw new Error(`Unknown pitch class: ${pitchClass}`)
	return match.camelotMinor
}

export function getMajorColour(pitchClass: number): string {
	const match = pitchClassMap.find((i) => i.pitchClass === pitchClass)
	if (!match) throw new Error(`Unknown pitch class: ${pitchClass}`)
	return match.majorColour
}

export function getMinorColour(pitchClass: number): string {
	const match = pitchClassMap.find((i) => i.pitchClass === pitchClass)
	if (!match) throw new Error(`Unknown pitch class: ${pitchClass}`)
	return match.minorColour
}

export function getKeyString(pitchClass: number, mode: number): string {
	return `${pitchClassMap.find((i) => i.pitchClass === pitchClass)?.tone} ${
		mode === 0 ? `Minor` : `Major`
	}`
}

export function getKeyStringShort(pitchClass: number, mode: number): string {
	return `${pitchClassMap
		.find((i) => i.pitchClass === pitchClass)
		?.tone.slice(0, 2)} ${mode === 0 ? `Min` : `Maj`}`
}

export function getCamelotString(pitchClass: number, mode: number): string {
	return mode === 0
		? `${getCamelotMinor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`
		: `${getCamelotMajor(pitchClass)?.toString()}${mode === 0 ? `A` : `B`}`
}

export function getKeyColour(pitchClass: number, mode: number): string {
	return mode === 0 ? getMinorColour(pitchClass) : getMajorColour(pitchClass)
}

export function getSortableNotation(pitchClass: number, mode: number): number {
	return mode === 1
		? getCamelotMajor(pitchClass)
		: getCamelotMinor(pitchClass) + 100
}

export function keyOptionsMapFn(mode: number) {
	return (i: Key) => ({
		id: `${mode.toString()}${i.pitchClass.toString().padStart(2, '0')}`,
		name: `${i.tone} ${mode === 1 ? 'Major' : 'Minor'}`
	})
}

export function camelotOptionsMapFn(mode: number) {
	return (i: Key): Option => ({
		id: `${mode.toString()}${i.pitchClass.toString().padStart(2, '0')}`,
		name: mode === 1 ? `${i.camelotMajor}B` : `${i.camelotMinor}A`
	})
}

// Alternative mapping function that combines key name with camelot notation
// e.g., "C Major (8B)", "C Minor (5A)"
export function combinedOptionsMapFnAlt(mode: number) {
	return (i: Key): Option => ({
		id: `${mode.toString()}${i.pitchClass.toString().padStart(2, '0')}`,
		name: `${i.tone} ${mode === 1 ? 'Major' : 'Minor'} (${
			mode === 1 ? i.camelotMajor : i.camelotMinor
		}${mode === 1 ? 'B' : 'A'})`
	})
}

export const getKeyOptions = (keyFormat: 'key' | 'camelot'): Option[] => {
	const keyOptionsMajor: Option[] =
		keyFormat === 'key'
			? pitchClassMap.map(keyOptionsMapFn(1))
			: pitchClassMap.sort(sortNum('camelotMajor')).map(camelotOptionsMapFn(1))
	const keyOptionsMinor: Option[] =
		keyFormat === 'key'
			? pitchClassMap.map(keyOptionsMapFn(0))
			: pitchClassMap.sort(sortNum('camelotMinor')).map(camelotOptionsMapFn(0))
	return [{ id: '', name: '--- optional ---' }]
		.concat(keyOptionsMinor)
		.concat(keyOptionsMajor)
}

// Alternative getKeyOptions that returns combined format: "C Major (8B)", "C Minor (5A)"
export const getKeyOptionsAlt = (): Option[] => {
	const keyOptionsMajor: Option[] = pitchClassMap.map(
		combinedOptionsMapFnAlt(1)
	)
	const keyOptionsMinor: Option[] = pitchClassMap.map(
		combinedOptionsMapFnAlt(0)
	)
	return [{ id: 'none', name: 'Not specified' }]
		.concat(keyOptionsMinor)
		.concat(keyOptionsMajor)
}

// Helper to parse composite key ID back to separate key and mode values
// e.g., "100" -> { key: 0, mode: 1 }, "none" -> { key: null, mode: null }
export function parseKeyComposite(composite: string): {
	key: number | null
	mode: number | null
} {
	if (!composite || composite === 'none') return { key: null, mode: null }
	if (composite.length !== 3) return { key: null, mode: null }

	const modeChar = composite[0]
	if (!modeChar) return { key: null, mode: null }
	const mode = parseInt(modeChar, 10)
	const key = parseInt(composite.substring(1), 10)

	if (
		isNaN(mode) ||
		isNaN(key) ||
		mode < 0 ||
		mode > 1 ||
		key < 0 ||
		key > 11
	) {
		return { key: null, mode: null }
	}

	return { key, mode }
}

// Helper to create composite key ID from separate key and mode values
// e.g., key: 0, mode: 1 -> "100", key: null -> "none"
export function createKeyComposite(
	key: number | null,
	mode: number | null
): string {
	if (key === null || mode === null) return 'none'
	if (key < 0 || key > 11 || mode < 0 || mode > 1) return 'none'
	return `${mode}${key.toString().padStart(2, '0')}`
}

// Helper to parse Beatport key format like "A Minor" into key and mode values
// e.g., "A Minor" -> { key: 9, mode: 0 }, "C Major" -> { key: 0, mode: 1 }
export function parseBeatportKey(keyString: string): {
	key: number | null
	mode: number | null
} {
	if (!keyString) return { key: null, mode: null }

	// Parse format like "A Minor", "C Major", "F# Minor"
	const match = keyString.match(/^([A-G][#b]?)\s*(Major|Minor)$/i)
	if (!match) return { key: null, mode: null }

	const noteMap: Record<string, number> = {
		C: 0,
		'C#': 1,
		Db: 1,
		D: 2,
		'D#': 3,
		Eb: 3,
		E: 4,
		F: 5,
		'F#': 6,
		Gb: 6,
		G: 7,
		'G#': 8,
		Ab: 8,
		A: 9,
		'A#': 10,
		Bb: 10,
		B: 11
	}

	const note = match[1]
	const modeStr = match[2]?.toLowerCase()
	if (!note) return { key: null, mode: null }
	const key = noteMap[note]
	const mode = modeStr === 'major' ? 1 : 0

	return { key: key ?? null, mode }
}

// % operator returns wrong results for negative nominator in JS, hence workaround fn
// * https://stackoverflow.com/a/17323608/7259172
export function mod(n: number, m: number): number {
	return ((n % m) + m) % m
}

// * https://music.stackexchange.com/a/118424/89457
export function adjustKey(key: number, factor: number): number {
	return mod(key + 12 * (Math.log(factor) / Math.log(2)), 12)
}

// scoring some of the key combinations from:
// * http://blog.dubspot.com/harmonic-mixing-w-dj-endo-part-1/
export function scoreHarmony(a: KeyAndMode, b: KeyAndMode): HarmonyScore {
	if (a.mode === b.mode) {
		if (Math.abs(a.key - b.key) < 0.5)
			return {
				harmonicAffinity: 1 - Math.abs(a.key - b.key),
				keyCombination: 0
			}
		if (Math.abs(mod(a.key + 5, 12) - b.key) < 0.5)
			return {
				harmonicAffinity: 1 - Math.abs(mod(a.key + 5, 12) - b.key),
				keyCombination: 2
			}
		if (Math.abs(mod(a.key - 5, 12) - b.key) < 0.5)
			return {
				harmonicAffinity: 1 - Math.abs(mod(a.key - 5, 12) - b.key),
				keyCombination: 1
			}
	} else {
		if (Math.abs(a.key - b.key) < 0.5)
			return {
				harmonicAffinity: 1 - Math.abs(a.key - b.key),
				keyCombination: a.mode < b.mode ? 3 : 4
			}
	}
	return {
		harmonicAffinity: 0,
		keyCombination: -1
	}
}
