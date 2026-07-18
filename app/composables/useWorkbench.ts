import { type Pinia, createPinia } from 'pinia'
import {
	demoCrates,
	demoProfile,
	demoRecords,
	demoTracks
} from '~/demo/domainFixtures'

const demoPiniaByApp = new WeakMap<object, Pinia>()
const seededDemoPinia = new WeakSet<Pinia>()

function getDemoPinia(): Pinia {
	const nuxtApp = useNuxtApp()
	const existing = demoPiniaByApp.get(nuxtApp)
	if (existing) return existing

	const pinia = markDemoWorkbenchPinia(createPinia())
	demoPiniaByApp.set(nuxtApp, pinia)
	return pinia
}

function seedDemoPinia(pinia: Pinia) {
	if (seededDemoPinia.has(pinia)) return

	const user = useUserStore(pinia)
	const tracks = useTracksStore(pinia)
	const records = useRecordsStore(pinia)
	const crates = useCratesStore(pinia)
	const session = useSessionStore(pinia)

	user.$patch({ profile: { ...demoProfile } })
	records.$patch({
		records: demoRecords.map((record) => ({ ...record }))
	})
	tracks.$patch({ tracks: demoTracks.map((track) => ({ ...track })) })
	crates.$patch({
		crates: demoCrates.map((crate) => ({
			...crate,
			records: [...crate.records]
		}))
	})

	session.initializeDecks(2)
	session.setTrackSource(tracks.tracks)
	session.$patch({
		decks: session.decks.map((deck, index) => ({
			...deck,
			loadedTrack:
				index === 0
					? (tracks.tracks[8] ?? null)
					: index === 1
						? (tracks.tracks[16] ?? null)
						: null
		})),
		currentSession: [
			{
				track_id: tracks.tracks[4]?.id ?? '',
				time_added: Date.parse('2026-07-18T00:00:00.000Z'),
				adjusted_bpm: null,
				transition_rating: 4
			},
			{
				track_id: tracks.tracks[8]?.id ?? '',
				time_added: Date.parse('2026-07-18T00:05:00.000Z'),
				adjusted_bpm: null,
				transition_rating: null
			}
		].filter((entry) => entry.track_id)
	})

	seededDemoPinia.add(pinia)
}

export function provideDemoWorkbench() {
	const pinia = getDemoPinia()
	seedDemoPinia(pinia)
	provide(workbenchPiniaKey, pinia)
	provide(workbenchCapabilitiesKey, demoWorkbenchCapabilities)
}

export function useWorkbenchPinia(): Pinia {
	return inject(workbenchPiniaKey, null) ?? usePinia()
}

export function useWorkbenchCapabilities(): WorkbenchCapabilities {
	return inject(workbenchCapabilitiesKey, appWorkbenchCapabilities)
}

export function useWorkbenchRecordsStore() {
	return useRecordsStore(useWorkbenchPinia())
}

export function useWorkbenchTracksStore() {
	return useTracksStore(useWorkbenchPinia())
}

export function useWorkbenchCratesStore() {
	return useCratesStore(useWorkbenchPinia())
}

export function useWorkbenchSessionStore() {
	return useSessionStore(useWorkbenchPinia())
}

export function useWorkbenchUserStore() {
	return useUserStore(useWorkbenchPinia())
}

export function useWorkbenchTrackFiltersStore() {
	return useTrackFiltersStore(useWorkbenchPinia())
}

export function useWorkbenchRecordDetailsStore() {
	return useRecordDetailsStore(useWorkbenchPinia())
}

export function useWorkbenchDiscogsStore() {
	return useDiscogsStore(useWorkbenchPinia())
}

export function useWorkbenchDiscogsAuthStore() {
	return useDiscogsAuthStore(useWorkbenchPinia())
}

export function useWorkbenchManualRecordEntryStore() {
	return useManualRecordEntryStore(useWorkbenchPinia())
}
