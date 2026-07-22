import { type Pinia, createPinia } from 'pinia'
import {
	demoCrates,
	demoProfile,
	demoRecords,
	demoTracks
} from '~/demo/domainFixtures'
import { createCloudLibraryRepository } from '~/repositories/library/cloud/cloudLibraryRepository'
import type { WorkbenchCapabilities } from '~/repositories/library/contracts'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import {
	type WorkbenchRuntime,
	appWorkbenchCapabilities,
	bindWorkbenchRuntime,
	createWorkbenchRuntime,
	demoWorkbenchCapabilities,
	getWorkbenchRuntime,
	markDemoWorkbenchPinia,
	workbenchPiniaKey,
	workbenchRuntimeKey
} from '~/utils/workbenchPinia'
import type { LibrarySnapshot } from '~~/shared/types/library'

const demoPiniaByApp = new WeakMap<object, Pinia>()
const seededDemoPinia = new WeakSet<Pinia>()

function getDemoPinia(): Pinia {
	const nuxtApp = useNuxtApp()
	const existing = demoPiniaByApp.get(nuxtApp)
	if (existing) return existing

	const pinia = markDemoWorkbenchPinia(createPinia())
	ensureDemoWorkbenchRuntime(pinia)
	demoPiniaByApp.set(nuxtApp, pinia)
	return pinia
}

function createDemoSnapshot(): LibrarySnapshot {
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
		},
		repositoryRevision: 0
	}
}

export function ensureDemoWorkbenchRuntime(pinia: Pinia): WorkbenchRuntime {
	const existing = getWorkbenchRuntime(pinia)
	if (existing) return existing
	let runtime: WorkbenchRuntime
	const repository = createDemoLibraryRepository({
		id: 'demo-repository',
		snapshot: createDemoSnapshot(),
		isCurrentContext: (context) => runtime.isCurrent(context)
	})
	runtime = createWorkbenchRuntime(
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
	bindWorkbenchRuntime(pinia, runtime)
	return runtime
}

export function ensureCloudWorkbenchRuntime(pinia: Pinia): WorkbenchRuntime {
	const existing = getWorkbenchRuntime(pinia)
	if (existing) return existing
	const user = useUserStore(pinia)
	const supabase = useSupabaseClient<Database>()
	const getUserId = (): string | null => {
		const storeUserId = (user as { supaUserId?: string | null }).supaUserId
		if (storeUserId) return storeUserId
		const authUser = user.supaUser as {
			id?: string | null
			sub?: string | null
		} | null
		return authUser?.sub ?? authUser?.id ?? null
	}
	let runtime: WorkbenchRuntime
	const repository = createCloudLibraryRepository({
		repositoryId: 'cloud-supabase',
		supabase,
		identity: {
			getUserId,
			resolveAuthenticatedUserId: () => user.resolveAuthenticatedUserId()
		},
		isCurrentContext: (context) => runtime.isCurrent(context),
		getSupabaseConfig() {
			const config = useRuntimeConfig().public.supabase as {
				key?: unknown
				url?: unknown
			}
			if (
				typeof config.key !== 'string' ||
				!config.key ||
				typeof config.url !== 'string' ||
				!config.url
			) {
				throw new Error('Supabase configuration is unavailable.')
			}
			return { key: config.key, url: config.url }
		}
	})
	runtime = createWorkbenchRuntime(
		{
			id: 'cloud-library',
			repositoryId: repository.id,
			location: 'cloud',
			displayLabel: 'Cloud library',
			readOnly: false,
			repositoryRevision: 0,
			capabilities: appWorkbenchCapabilities
		},
		repository
	)
	watch(
		() => user.supaUserId,
		(nextUserId, previousUserId) => {
			if (nextUserId === previousUserId) return
			runtime.invalidate()
			repository.covers.reset()
		},
		{ flush: 'sync' }
	)
	bindWorkbenchRuntime(pinia, runtime)
	return runtime
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
		records: createDemoSnapshot().records
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
	provide(workbenchRuntimeKey, ensureDemoWorkbenchRuntime(pinia))
}

export function useWorkbenchPinia(): Pinia {
	return inject(workbenchPiniaKey, null) ?? usePinia()
}

export function useWorkbenchCapabilities(): WorkbenchCapabilities {
	return useWorkbenchRuntime().descriptor.value.capabilities
}

export function useWorkbenchRuntime(): WorkbenchRuntime {
	const injected = inject(workbenchRuntimeKey, null)
	if (injected) return injected
	const pinia = useWorkbenchPinia()
	return getWorkbenchRuntime(pinia) ?? ensureCloudWorkbenchRuntime(pinia)
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
