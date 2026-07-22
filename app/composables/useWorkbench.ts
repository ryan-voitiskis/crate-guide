import { type Pinia, createPinia, getActivePinia } from 'pinia'
import {
	demoCrates,
	demoProfile,
	demoRecords,
	demoTracks
} from '~/demo/domainFixtures'
import type { WorkbenchCapabilities } from '~/repositories/library/contracts'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import {
	type WorkbenchRuntime,
	bindWorkbenchRuntime,
	createWorkbenchRuntime,
	demoWorkbenchCapabilities,
	ensureWorkbenchRuntime,
	getWorkbenchRuntime,
	markDemoWorkbenchPinia,
	runWithActivePinia,
	workbenchPiniaKey,
	workbenchRuntimeKey
} from '~/utils/workbenchPinia'
import type { LibraryDataset } from '~~/shared/types/library'

const demoPiniaByApp = new WeakMap<object, Pinia>()
const seededDemoPinia = new WeakMap<Pinia, Promise<void>>()
const demoProviderStateByApp = new WeakMap<
	object,
	{ activeProviders: number; restoreGeneration: number }
>()

function getDemoPinia(): Pinia {
	const nuxtApp = useNuxtApp()
	const existing = demoPiniaByApp.get(nuxtApp)
	if (existing) return existing

	const pinia = markDemoWorkbenchPinia(createPinia())
	ensureDemoWorkbenchRuntime(pinia)
	demoPiniaByApp.set(nuxtApp, pinia)
	return pinia
}

function createDemoDataset(): LibraryDataset {
	return {
		records: demoRecords.map(
			({ user_id: _owner, cover_storage_path, cover, ...record }) => ({
				...record,
				cover: cover_storage_path
					? {
							kind: 'cloud' as const,
							assetId: cover_storage_path,
							fallbackUrl: cover
						}
					: cover
						? { kind: 'external' as const, url: cover }
						: { kind: 'none' as const }
			})
		),
		tracks: demoTracks.map((track) => ({ ...track })),
		crates: demoCrates.map(({ user_id: _owner, ...crate }) => ({
			...crate,
			records: [...crate.records]
		})),
		savedSets: [],
		preferences: {
			ui_theme: demoProfile.ui_theme,
			key_format: demoProfile.key_format,
			list_layout: demoProfile.list_layout,
			selected_crate: demoProfile.selected_crate,
			turntable_pitch_range: demoProfile.turntable_pitch_range,
			turntable_theme: demoProfile.turntable_theme
		}
	}
}

export function ensureDemoWorkbenchRuntime(pinia: Pinia): WorkbenchRuntime {
	const existing = getWorkbenchRuntime(pinia)
	if (existing) return existing
	const runtimeReference: { current: WorkbenchRuntime | null } = {
		current: null
	}
	const repository = createDemoLibraryRepository({
		id: 'demo-repository',
		dataset: createDemoDataset(),
		isCurrentContext: (context) =>
			runtimeReference.current?.isCurrent(context) ?? false
	})
	const runtime = createWorkbenchRuntime(
		{
			id: 'demo',
			repositoryId: repository.id,
			location: 'demo',
			displayLabel: 'Demo',
			readOnly: true,
			repositoryRevision: 0,
			capabilities: demoWorkbenchCapabilities
		},
		repository
	)
	runtimeReference.current = runtime
	bindWorkbenchRuntime(pinia, runtime)
	return runtime
}

function seedDemoPinia(pinia: Pinia): Promise<void> {
	const existing = seededDemoPinia.get(pinia)
	if (existing) return existing

	const created = (async () => {
		const { user, tracks, records, crates, session, preferences } =
			runWithActivePinia(pinia, () => ({
				user: useUserStore(pinia),
				tracks: useTracksStore(pinia),
				records: useRecordsStore(pinia),
				crates: useCratesStore(pinia),
				session: useSessionStore(pinia),
				preferences: useLibraryPreferencesStore(pinia)
			}))

		user.$patch({
			profile: {
				id: demoProfile.id,
				name: demoProfile.name,
				discogs_avatar_url: demoProfile.discogs_avatar_url,
				discogs_uid: demoProfile.discogs_uid,
				discogs_username: demoProfile.discogs_username,
				just_completed_discogs_oauth: demoProfile.just_completed_discogs_oauth
			}
		})
		const loaded = await Promise.all([
			records.fetchAllRecords(),
			tracks.fetchAllTracks(),
			crates.fetchAllCrates(),
			preferences.fetchPreferences()
		])
		if (loaded.some((result) => !result)) {
			throw new Error('The Demo library could not be loaded.')
		}

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
	})()
	seededDemoPinia.set(pinia, created)
	void created.catch(() => {
		if (seededDemoPinia.get(pinia) === created) seededDemoPinia.delete(pinia)
	})
	return created
}

export async function provideDemoWorkbench(): Promise<void> {
	const nuxtApp = useNuxtApp()
	const appPinia = usePinia()
	const appPreferences = getWorkbenchRuntime(appPinia)
		? runWithActivePinia(appPinia, () => useLibraryPreferencesStore(appPinia))
		: null
	const pinia = getDemoPinia()
	provide(workbenchPiniaKey, pinia)
	provide(workbenchRuntimeKey, ensureDemoWorkbenchRuntime(pinia))

	const providerState = demoProviderStateByApp.get(nuxtApp) ?? {
		activeProviders: 0,
		restoreGeneration: 0
	}
	demoProviderStateByApp.set(nuxtApp, providerState)
	let isActive = false
	function activateProvider() {
		if (isActive) return
		isActive = true
		providerState.activeProviders += 1
		providerState.restoreGeneration += 1
	}
	function restoreAppTheme() {
		setTheme(
			appPreferences?.currentTheme ??
				getSavedAnonymousThemePreference() ??
				'auto'
		)
	}
	function deactivateProvider() {
		if (!isActive) return
		isActive = false
		providerState.activeProviders = Math.max(
			0,
			providerState.activeProviders - 1
		)
		const restoreGeneration = ++providerState.restoreGeneration
		void nextTick().then(() => {
			if (
				providerState.activeProviders === 0 &&
				restoreGeneration === providerState.restoreGeneration
			) {
				restoreAppTheme()
			}
		})
	}
	activateProvider()
	onActivated(activateProvider)
	onDeactivated(deactivateProvider)
	onScopeDispose(() => {
		deactivateProvider()
		if (providerState.activeProviders !== 0) return
		providerState.restoreGeneration += 1
		restoreAppTheme()
	})

	await seedDemoPinia(pinia)
	if (isActive) {
		setTheme(
			runWithActivePinia(pinia, () => useLibraryPreferencesStore(pinia))
				.currentTheme
		)
	}
}

export function useWorkbenchPinia(): Pinia {
	return inject(workbenchPiniaKey, null) ?? getActivePinia() ?? usePinia()
}

export function useWorkbenchCapabilities(): WorkbenchCapabilities {
	return useWorkbenchRuntime().descriptor.value.capabilities
}

export function useWorkbenchRuntime(): WorkbenchRuntime {
	const injected = inject(workbenchRuntimeKey, null)
	if (injected) return injected
	return ensureWorkbenchRuntime(useWorkbenchPinia())
}

export function useWorkbenchRecordsStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useRecordsStore(pinia))
}

export function useWorkbenchTracksStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useTracksStore(pinia))
}

export function useWorkbenchCratesStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useCratesStore(pinia))
}

export function useWorkbenchSessionStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useSessionStore(pinia))
}

export function useWorkbenchUserStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useUserStore(pinia))
}

export function useWorkbenchPreferencesStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useLibraryPreferencesStore(pinia))
}

export function useWorkbenchTrackFiltersStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useTrackFiltersStore(pinia))
}

export function useWorkbenchRecordDetailsStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useRecordDetailsStore(pinia))
}

export function useWorkbenchDiscogsStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useDiscogsStore(pinia))
}

export function useWorkbenchDiscogsAuthStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useDiscogsAuthStore(pinia))
}

export function useWorkbenchManualRecordEntryStore() {
	const pinia = useWorkbenchPinia()
	return runWithActivePinia(pinia, () => useManualRecordEntryStore(pinia))
}
