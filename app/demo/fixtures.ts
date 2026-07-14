export type DemoRecord = {
	id: string
	title: string
	artists: string[]
	label: string
	catno: string
	year: number
	format: string
	cover: string
}

export type DemoTrack = {
	id: string
	recordId: string
	position: string
	title: string
	artists: string[]
	duration: number
	bpm: number
	key: string
	keyColor: string
	genres: string[]
	playable: boolean
}

export type DemoCrate = {
	id: string
	name: string
	description: string
	color: string
	recordIds: string[]
}

export type DemoHistoryEntry = {
	trackId: string
	playedAt: string
	adjustedBpm: number
	rating: number | null
}

const coverPalettes = [
	['#1f2937', '#d97706', '#fef3c7'],
	['#172554', '#2563eb', '#dbeafe'],
	['#3f1d2e', '#db2777', '#fce7f3'],
	['#052e2b', '#0f766e', '#ccfbf1'],
	['#2e1065', '#7c3aed', '#ede9fe'],
	['#422006', '#ca8a04', '#fef9c3'],
	['#111827', '#dc2626', '#fee2e2'],
	['#1c1917', '#78716c', '#f5f5f4']
] as const

function coverArtwork(index: number, code: string, title: string) {
	const palette = coverPalettes[index % coverPalettes.length]!
	const [ink, accent, paper] = palette
	const safeTitle = title.replaceAll('&', 'and')
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><rect width="640" height="640" fill="${paper}"/><rect x="44" y="44" width="552" height="552" fill="none" stroke="${ink}" stroke-width="4"/><circle cx="320" cy="320" r="190" fill="${ink}"/><circle cx="320" cy="320" r="104" fill="${accent}"/><circle cx="320" cy="320" r="14" fill="${paper}"/><path d="M86 118h214M86 136h154M340 504h214M400 522h154" stroke="${accent}" stroke-width="8"/><text x="86" y="98" font-family="monospace" font-size="22" fill="${ink}">${code}</text><text x="554" y="570" text-anchor="end" font-family="monospace" font-size="18" fill="${ink}">${safeTitle.slice(0, 22).toUpperCase()}</text></svg>`
	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const demoRecords: DemoRecord[] = [
	{
		id: 'record-aurora',
		title: 'Aurora Transit',
		artists: ['Lena Arco'],
		label: 'Lattice Works',
		catno: 'LTW-014',
		year: 2024,
		format: '12-inch',
		cover: coverArtwork(0, 'LTW-014', 'Aurora Transit')
	},
	{
		id: 'record-nightglass',
		title: 'Nightglass',
		artists: ['Index Gray'],
		label: 'Contour Audio',
		catno: 'CTA-008',
		year: 2023,
		format: '12-inch',
		cover: coverArtwork(1, 'CTA-008', 'Nightglass')
	},
	{
		id: 'record-signal',
		title: 'Signal Bloom',
		artists: ['Mara Venn'],
		label: 'Soft Relay',
		catno: 'SRL-022',
		year: 2025,
		format: 'EP',
		cover: coverArtwork(2, 'SRL-022', 'Signal Bloom')
	},
	{
		id: 'record-courtyard',
		title: 'Courtyard Pressure',
		artists: ['Taro Meridian'],
		label: 'Substrate',
		catno: 'SUB-119',
		year: 2021,
		format: '12-inch',
		cover: coverArtwork(3, 'SUB-119', 'Courtyard Pressure')
	},
	{
		id: 'record-sundial',
		title: 'Sundial Methods',
		artists: ['Paloma Unit'],
		label: 'Numeral',
		catno: 'NUM-031',
		year: 2022,
		format: 'LP',
		cover: coverArtwork(4, 'NUM-031', 'Sundial Methods')
	},
	{
		id: 'record-mercury',
		title: 'Mercury Dubplates',
		artists: ['Soren Vale'],
		label: 'Low Orbit',
		catno: 'LOR-006',
		year: 2020,
		format: '10-inch',
		cover: coverArtwork(5, 'LOR-006', 'Mercury Dubplates')
	},
	{
		id: 'record-redline',
		title: 'Redline Memory',
		artists: ['Common Phase'],
		label: 'Foundry Rhythm',
		catno: 'FDR-043',
		year: 2025,
		format: '12-inch',
		cover: coverArtwork(6, 'FDR-043', 'Redline Memory')
	},
	{
		id: 'record-still',
		title: 'Still Forms',
		artists: ['Eira North'],
		label: 'Quiet Index',
		catno: 'QIX-017',
		year: 2019,
		format: 'LP',
		cover: coverArtwork(7, 'QIX-017', 'Still Forms')
	}
]

export const demoTracks: DemoTrack[] = [
	{
		id: 'track-aurora',
		recordId: 'record-aurora',
		position: 'A1',
		title: 'Aurora Transit',
		artists: ['Lena Arco'],
		duration: 357,
		bpm: 124.2,
		key: '8A',
		keyColor: '#22c55e',
		genres: ['Deep House'],
		playable: true
	},
	{
		id: 'track-arc',
		recordId: 'record-aurora',
		position: 'B1',
		title: 'Arc Return',
		artists: ['Lena Arco'],
		duration: 381,
		bpm: 125,
		key: '9A',
		keyColor: '#84cc16',
		genres: ['House'],
		playable: true
	},
	{
		id: 'track-nightglass',
		recordId: 'record-nightglass',
		position: 'A1',
		title: 'Nightglass',
		artists: ['Index Gray'],
		duration: 392,
		bpm: 128,
		key: '10A',
		keyColor: '#eab308',
		genres: ['Techno'],
		playable: true
	},
	{
		id: 'track-trace',
		recordId: 'record-nightglass',
		position: 'B2',
		title: 'Trace Element',
		artists: ['Index Gray'],
		duration: 346,
		bpm: 127.4,
		key: '10B',
		keyColor: '#f59e0b',
		genres: ['Techno'],
		playable: true
	},
	{
		id: 'track-signal',
		recordId: 'record-signal',
		position: 'A1',
		title: 'Signal Bloom',
		artists: ['Mara Venn'],
		duration: 401,
		bpm: 126.6,
		key: '9A',
		keyColor: '#84cc16',
		genres: ['Progressive House'],
		playable: true
	},
	{
		id: 'track-petal',
		recordId: 'record-signal',
		position: 'A2',
		title: 'Petal Logic',
		artists: ['Mara Venn'],
		duration: 373,
		bpm: 126,
		key: '8A',
		keyColor: '#22c55e',
		genres: ['Deep House'],
		playable: true
	},
	{
		id: 'track-courtyard',
		recordId: 'record-courtyard',
		position: 'A1',
		title: 'Courtyard Pressure',
		artists: ['Taro Meridian'],
		duration: 331,
		bpm: 130,
		key: '11A',
		keyColor: '#f97316',
		genres: ['Dub Techno'],
		playable: true
	},
	{
		id: 'track-paving',
		recordId: 'record-courtyard',
		position: 'B1',
		title: 'Warm Paving',
		artists: ['Taro Meridian'],
		duration: 414,
		bpm: 129.7,
		key: '12A',
		keyColor: '#ef4444',
		genres: ['Dub Techno'],
		playable: true
	},
	{
		id: 'track-sundial',
		recordId: 'record-sundial',
		position: 'A1',
		title: 'Sundial Method I',
		artists: ['Paloma Unit'],
		duration: 443,
		bpm: 121,
		key: '6A',
		keyColor: '#06b6d4',
		genres: ['Balearic'],
		playable: true
	},
	{
		id: 'track-meridian',
		recordId: 'record-sundial',
		position: 'C1',
		title: 'False Meridian',
		artists: ['Paloma Unit'],
		duration: 307,
		bpm: 118.5,
		key: '5A',
		keyColor: '#3b82f6',
		genres: ['Downtempo'],
		playable: true
	},
	{
		id: 'track-mercury',
		recordId: 'record-mercury',
		position: 'A',
		title: 'Mercury Dub I',
		artists: ['Soren Vale'],
		duration: 286,
		bpm: 132,
		key: '1A',
		keyColor: '#e11d48',
		genres: ['Dub', 'Bass'],
		playable: true
	},
	{
		id: 'track-perihelion',
		recordId: 'record-mercury',
		position: 'B',
		title: 'Perihelion Tool',
		artists: ['Soren Vale'],
		duration: 299,
		bpm: 132.4,
		key: '2A',
		keyColor: '#db2777',
		genres: ['Bass'],
		playable: true
	},
	{
		id: 'track-redline',
		recordId: 'record-redline',
		position: 'A1',
		title: 'Redline Memory',
		artists: ['Common Phase'],
		duration: 365,
		bpm: 134,
		key: '2A',
		keyColor: '#db2777',
		genres: ['Techno'],
		playable: true
	},
	{
		id: 'track-limiter',
		recordId: 'record-redline',
		position: 'B1',
		title: 'Soft Limiter',
		artists: ['Common Phase'],
		duration: 348,
		bpm: 133.8,
		key: '3A',
		keyColor: '#a855f7',
		genres: ['Techno'],
		playable: true
	},
	{
		id: 'track-still',
		recordId: 'record-still',
		position: 'A1',
		title: 'Still Forms',
		artists: ['Eira North'],
		duration: 468,
		bpm: 98,
		key: '4A',
		keyColor: '#6366f1',
		genres: ['Ambient'],
		playable: false
	},
	{
		id: 'track-weather',
		recordId: 'record-still',
		position: 'B2',
		title: 'Weather Index',
		artists: ['Eira North'],
		duration: 512,
		bpm: 102,
		key: '5A',
		keyColor: '#3b82f6',
		genres: ['Ambient'],
		playable: true
	}
]

export const demoCrates: DemoCrate[] = [
	{
		id: 'crate-opening',
		name: 'Opening / room tone',
		description: 'Patient starters, low contrast and plenty of space.',
		color: '#3b82f6',
		recordIds: ['record-still', 'record-sundial', 'record-aurora']
	},
	{
		id: 'crate-terrace',
		name: 'Terrace at dusk',
		description: 'Warm, rolling records for the light-to-dark handover.',
		color: '#f59e0b',
		recordIds: [
			'record-aurora',
			'record-signal',
			'record-sundial',
			'record-courtyard'
		]
	},
	{
		id: 'crate-pressure',
		name: 'Pressure tools',
		description: 'Direct club records with clean transition points.',
		color: '#ef4444',
		recordIds: [
			'record-nightglass',
			'record-courtyard',
			'record-mercury',
			'record-redline'
		]
	},
	{
		id: 'crate-late',
		name: 'Late close',
		description: 'Hypnotic material for the final hour.',
		color: '#8b5cf6',
		recordIds: [
			'record-nightglass',
			'record-signal',
			'record-redline',
			'record-still'
		]
	},
	{
		id: 'crate-unplayed',
		name: 'Unplayed this month',
		description: 'A rotating prompt to keep the library moving.',
		color: '#14b8a6',
		recordIds: ['record-mercury', 'record-signal', 'record-still']
	}
]

export const demoHistory: DemoHistoryEntry[] = [
	{
		trackId: 'track-aurora',
		playedAt: '22:14',
		adjustedBpm: 125,
		rating: null
	},
	{ trackId: 'track-petal', playedAt: '22:20', adjustedBpm: 125.8, rating: 4 },
	{
		trackId: 'track-nightglass',
		playedAt: '22:27',
		adjustedBpm: 127.6,
		rating: 5
	}
]

export function getDemoRecord(recordId: string) {
	return demoRecords.find((record) => record.id === recordId)
}

export function getDemoTrack(trackId: string) {
	return demoTracks.find((track) => track.id === trackId)
}

export function getDemoRecordTracks(recordId: string) {
	return demoTracks.filter((track) => track.recordId === recordId)
}

export function formatDemoDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60)
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
