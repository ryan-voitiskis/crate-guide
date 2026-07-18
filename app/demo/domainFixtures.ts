import type {
	Crate,
	DatabaseRecord,
	Profile,
	Track
} from '~~/shared/types/supabase'

const demoUserId = 'demo-user'
const createdAt = '2026-07-18T00:00:00.000Z'

type RecordFixture = {
	id: string
	title: string
	artist: string
	artistDiscogsId: number
	label: string
	catno: string
	year: number
	cover: string
	discogsId: number
}

const recordFixtures: RecordFixture[] = [
	{
		id: 'almost',
		title: 'Almost',
		artist: 'Null',
		artistDiscogsId: 4343879,
		label: 'Acéphale',
		catno: 'ACE032',
		year: 2015,
		cover:
			'https://i.discogs.com/3Cr77lC_7qM0EluPmBXlQp3Pw2nx904ydKa4aFXNIWw/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTY3MTI2/NTYtMTQyNTE0ODI5/My05MDA5LmpwZWc.jpeg',
		discogsId: 6712656
	},
	{
		id: 'atmosphere',
		title: 'Atmosphere E.P. Vol. 1',
		artist: 'Kerri Chandler',
		artistDiscogsId: 59,
		label: 'Shelter Records',
		catno: 'SHL-1004',
		year: 2006,
		cover:
			'https://i.discogs.com/XD82xydfN0yiWn-D1TgaJ6T7sG8SU4pPzLq6c4yCjh0/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEyOTAw/MDctMTIwNjgxMjgw/Mi5qcGVn.jpeg',
		discogsId: 1290007
	},
	{
		id: 'dark-bliss',
		title: 'Dark Bliss',
		artist: 'Galcher Lustwerk',
		artistDiscogsId: 3288914,
		label: 'White Material',
		catno: 'WM010',
		year: 2018,
		cover:
			'https://i.discogs.com/tuXVB6yQQ4yg8tuOSLpQPDE2WV4g6XMcPQVazVYKoNk/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTExODU0/NTI5LTE1MjM1MzMy/MTktNTY3My5qcGVn.jpeg',
		discogsId: 11854529
	},
	{
		id: 'donnys-groove',
		title: "Donny's Groove",
		artist: 'Mella Dee',
		artistDiscogsId: 2719382,
		label: 'Warehouse Music',
		catno: 'WM 005',
		year: 2018,
		cover:
			'https://i.discogs.com/X2rSXARcR9CTlfGihcsS3gN_SbdD4AdT4VVdRw4wRR8/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTExOTgy/OTMzLTE1MjU5NzQy/NjUtNzA3OS5qcGVn.jpeg',
		discogsId: 11982933
	},
	{
		id: 'rojus',
		title: 'Rojus (Designed To Dance)',
		artist: 'Leon Vynehall',
		artistDiscogsId: 2741299,
		label: 'Running Back',
		catno: 'RB061',
		year: 2016,
		cover:
			'https://i.discogs.com/2KJcrbdXVrQYkVaDxEzo8t_HyYRw3bPKfFKBjsWdccs/rs:fit/g:sm/q:90/h:599/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTgzMDk0/NjctMTQ3OTMwMTM2/NC05MjEwLmpwZWc.jpeg',
		discogsId: 8309467
	},
	{
		id: 'sanctified',
		title: 'Sanctified EP',
		artist: 'Floorplan',
		artistDiscogsId: 30958,
		label: 'M-Plant',
		catno: 'M.PM13',
		year: 2011,
		cover:
			'https://i.discogs.com/6hW5s8AHItRdSuMTVbmDL_6hcCLgWOh9vIOh9F1TrzI/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMwNTg4/NDktMTQ1MDE2MDA0/NC04ODU5LmpwZWc.jpeg',
		discogsId: 3058849
	}
]

export const demoRecords: DatabaseRecord[] = recordFixtures.map((record) => ({
	id: `demo-record-${record.id}`,
	user_id: demoUserId,
	title: record.title,
	artists: [
		{
			name: record.artist,
			role: null,
			discogs_id: record.artistDiscogsId
		}
	],
	labels: [{ name: record.label, catno: record.catno }],
	year: record.year,
	cover: record.cover,
	cover_storage_path: null,
	discogs_id: record.discogsId,
	discogs_release_url: `https://www.discogs.com/release/${record.discogsId}`,
	created_at: createdAt,
	updated_at: createdAt
}))

type TrackFixture = {
	record: RecordFixture['id']
	title: string
	position: string | null
	duration?: number
	rpm: 33 | 45
	genres: string[]
}

const trackFixtures: TrackFixture[] = [
	{
		record: 'almost',
		title: '40',
		position: 'A1',
		rpm: 33,
		genres: ['House', 'Techno', 'Leftfield', 'Experimental']
	},
	{
		record: 'almost',
		title: 'Mothering',
		position: 'A2',
		rpm: 33,
		genres: ['House', 'Techno', 'Leftfield', 'Experimental']
	},
	{
		record: 'almost',
		title: 'Back To Normal, Almost',
		position: 'A3',
		rpm: 33,
		genres: ['House', 'Techno', 'Leftfield', 'Experimental']
	},
	{
		record: 'almost',
		title: 'Luv U, Luv Me',
		position: 'A4',
		rpm: 33,
		genres: ['House', 'Techno', 'Leftfield', 'Experimental']
	},
	{
		record: 'atmosphere',
		title: 'Climax 1',
		position: 'A1',
		rpm: 33,
		genres: ['House', 'Deep House']
	},
	{
		record: 'atmosphere',
		title: 'Climax 2',
		position: 'A2',
		rpm: 33,
		genres: ['House', 'Deep House']
	},
	{
		record: 'atmosphere',
		title: 'Track 1',
		position: 'B1',
		rpm: 33,
		genres: ['House', 'Deep House']
	},
	{
		record: 'atmosphere',
		title: 'Track 2',
		position: 'B2',
		rpm: 33,
		genres: ['House', 'Deep House']
	},
	{
		record: 'dark-bliss',
		title: 'Catamaran',
		position: 'A1',
		duration: 230000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Abstract']
	},
	{
		record: 'dark-bliss',
		title: 'What U Want Me To Do',
		position: 'A2',
		duration: 235000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Abstract']
	},
	{
		record: 'dark-bliss',
		title: 'Yeeno',
		position: 'B1',
		duration: 249000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Abstract']
	},
	{
		record: 'dark-bliss',
		title: 'Yo',
		position: 'B2',
		duration: 202000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Abstract']
	},
	{
		record: 'donnys-groove',
		title: 'The Sound',
		position: null,
		duration: 292000,
		rpm: 33,
		genres: ['House']
	},
	{
		record: 'donnys-groove',
		title: 'DG Redux',
		position: null,
		duration: 383000,
		rpm: 33,
		genres: ['House']
	},
	{
		record: 'donnys-groove',
		title: 'B',
		position: null,
		rpm: 33,
		genres: ['House']
	},
	{
		record: 'donnys-groove',
		title: "Donny's Groove",
		position: null,
		duration: 384000,
		rpm: 33,
		genres: ['House']
	},
	{
		record: 'rojus',
		title: 'Beyond This...',
		position: 'A1',
		duration: 220000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Downtempo']
	},
	{
		record: 'rojus',
		title: 'Saxony',
		position: 'A2',
		duration: 268000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Downtempo']
	},
	{
		record: 'rojus',
		title: 'Beau Sovereign',
		position: 'A3',
		duration: 359000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Downtempo']
	},
	{
		record: 'rojus',
		title: 'Paradisea',
		position: 'B1',
		duration: 403000,
		rpm: 45,
		genres: ['House', 'Deep House', 'Downtempo']
	},
	{
		record: 'sanctified',
		title: 'We Magnify His Name',
		position: 'A1',
		rpm: 33,
		genres: ['House', 'Techno', 'Garage House']
	},
	{
		record: 'sanctified',
		title: 'Baby Baby',
		position: 'B1',
		rpm: 33,
		genres: ['House', 'Techno', 'Garage House']
	},
	{
		record: 'sanctified',
		title: 'Basic Principle',
		position: 'B2',
		rpm: 33,
		genres: ['House', 'Techno', 'Garage House']
	},
	{
		record: 'sanctified',
		title: 'That Side',
		position: null,
		rpm: 33,
		genres: ['House', 'Techno', 'Garage House']
	}
]

export const demoTracks: Track[] = trackFixtures.map((track, index) => {
	const record = recordFixtures.find(
		(candidate) => candidate.id === track.record
	)
	if (!record) throw new Error(`Missing demo record fixture: ${track.record}`)

	return {
		id: `demo-track-${index + 1}`,
		record_id: `demo-record-${record.id}`,
		title: track.title,
		artists: [
			{
				name: record.artist,
				role: null,
				discogs_id: record.artistDiscogsId
			}
		],
		extraartists: [],
		position: track.position,
		duration: track.duration ?? null,
		bpm: null,
		rpm: track.rpm,
		key: null,
		mode: null,
		genres: track.genres,
		time_signature_upper: null,
		time_signature_lower: null,
		playable: true,
		beatport_data: null,
		audio_features: null,
		created_at: createdAt,
		updated_at: createdAt
	}
})

export const demoCrates: Crate[] = [
	{
		id: 'demo-crate-deep-house',
		user_id: demoUserId,
		name: 'Deep house',
		description: 'Warm, spacious records for the first part of a set.',
		color: '#3b82f6',
		records: ['demo-record-atmosphere', 'demo-record-rojus'],
		created_at: createdAt,
		updated_at: createdAt
	},
	{
		id: 'demo-crate-late-night',
		user_id: demoUserId,
		name: 'Late night',
		description: 'Hypnotic and low-lit club records.',
		color: '#8b5cf6',
		records: ['demo-record-almost', 'demo-record-dark-bliss'],
		created_at: createdAt,
		updated_at: createdAt
	},
	{
		id: 'demo-crate-energy',
		user_id: demoUserId,
		name: 'Lift the room',
		description: 'Direct house records for increasing the energy.',
		color: '#f97316',
		records: ['demo-record-donnys-groove', 'demo-record-sanctified'],
		created_at: createdAt,
		updated_at: createdAt
	}
]

export const demoProfile: Profile = {
	id: demoUserId,
	name: 'Demo selector',
	discogs_avatar_url: null,
	discogs_uid: null,
	discogs_username: null,
	just_completed_discogs_oauth: false,
	key_format: 'camelot',
	list_layout: 'cover',
	selected_crate: '',
	turntable_pitch_range: 8,
	turntable_theme: 'black',
	ui_theme: 'auto'
}
