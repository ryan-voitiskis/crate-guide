import { defineComponent, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMockLibraryRecord } from 'test/mocks/fixtures/records'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CardCrate from '~/components/crates/CardCrate.vue'
import { useLibraryMutations } from '~/composables/useLibraryMutations'
import {
	provideDemoWorkbench,
	useWorkbenchCapabilities,
	useWorkbenchCratesStore,
	useWorkbenchPreferencesStore,
	useWorkbenchRecordsStore,
	useWorkbenchRuntime,
	useWorkbenchSessionStore,
	useWorkbenchTracksStore,
	useWorkbenchUserStore
} from '~/composables/useWorkbench'
import { demoRecords } from '~/demo/domainFixtures'
import { createDemoEnrichmentReview } from '~/demo/enrichmentFixtures'
import { createDemoLibraryRepository } from '~/repositories/library/demoLibraryRepository'
import { useLibraryPreferencesStore } from '~/stores/libraryPreferencesStore'
import { useRecordsStore } from '~/stores/recordsStore'
import {
	appWorkbenchCapabilities,
	bindWorkbenchRuntime,
	createWorkbenchRuntime,
	runWithActivePinia
} from '~/utils/workbenchPinia'
import type { LibraryCrate, LibraryDataset } from '~~/shared/types/library'

let wrapper: VueWrapper | null = null

describe('demo workbench', () => {
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.restoreAllMocks()
	})

	it('provides isolated fixtures and blocks account-backed commands', async () => {
		const appPinia = createPinia()
		let captured:
			| {
					capabilities: ReturnType<typeof useWorkbenchCapabilities>
					records: ReturnType<typeof useWorkbenchRecordsStore>
					tracks: ReturnType<typeof useWorkbenchTracksStore>
					crates: ReturnType<typeof useWorkbenchCratesStore>
					session: ReturnType<typeof useWorkbenchSessionStore>
					user: ReturnType<typeof useWorkbenchUserStore>
					preferences: ReturnType<typeof useWorkbenchPreferencesStore>
					runtime: ReturnType<typeof useWorkbenchRuntime>
					mutations: ReturnType<typeof useLibraryMutations>
					supabase: ReturnType<typeof useSupabaseClient>
			  }
			| undefined

		const ProbeDemoWorkbench = defineComponent({
			setup() {
				captured = {
					capabilities: useWorkbenchCapabilities(),
					records: useWorkbenchRecordsStore(),
					tracks: useWorkbenchTracksStore(),
					crates: useWorkbenchCratesStore(),
					session: useWorkbenchSessionStore(),
					user: useWorkbenchUserStore(),
					preferences: useWorkbenchPreferencesStore(),
					runtime: useWorkbenchRuntime(),
					mutations: useLibraryMutations(),
					supabase: useSupabaseClient()
				}
				return () => h('div', { 'data-testid': 'demo-probe' })
			}
		})
		const DemoWorkbenchHost = defineComponent({
			async setup() {
				await provideDemoWorkbench()
				return () => h(ProbeDemoWorkbench)
			}
		})

		wrapper = await mountSuspended(DemoWorkbenchHost)
		await nextTick()

		if (!captured) throw new Error('Demo workbench probe did not mount')

		expect(captured.capabilities).toMatchObject({
			location: 'demo',
			canPersistSessions: false,
			canMutateLibrary: false,
			canManageCrates: false,
			canConnectDiscogs: false,
			canEnrichTracks: false,
			canManageAccount: false
		})
		expect(captured.records.records).toHaveLength(6)
		expect(captured.tracks.tracks).toHaveLength(24)
		expect(captured.crates.crates).toHaveLength(3)
		expect(captured.user.supaUser).toBeNull()
		expect(captured.user.profile?.discogs_username).toBeNull()
		expect(
			captured.session
				.getSuggestionsForDeck(0)
				.every((suggestion) => suggestion.id.startsWith('demo-track-'))
		).toBe(true)

		const trackId = captured.tracks.tracks[0]?.id
		const recordId = captured.records.records[0]?.id
		const crateId = captured.crates.crates[0]?.id
		if (!trackId || !recordId || !crateId)
			throw new Error('Expected seeded demo entities')

		const repositories = captured.runtime.capture().repositories
		const repositoryMutations = [
			vi.spyOn(repositories.records, 'createWithTracks'),
			vi.spyOn(repositories.records, 'update'),
			vi.spyOn(repositories.records, 'updateWithCover'),
			vi.spyOn(repositories.records, 'removeFromCollection'),
			vi.spyOn(repositories.records, 'drainCoverCleanup'),
			vi.spyOn(repositories.tracks, 'create'),
			vi.spyOn(repositories.tracks, 'update'),
			vi.spyOn(repositories.tracks, 'updateBatch'),
			vi.spyOn(repositories.tracks, 'delete'),
			vi.spyOn(repositories.crates, 'create'),
			vi.spyOn(repositories.crates, 'updateMetadata'),
			vi.spyOn(repositories.crates, 'delete'),
			vi.spyOn(repositories.crates, 'addRecord'),
			vi.spyOn(repositories.crates, 'removeRecord'),
			vi.spyOn(repositories.savedSets, 'save'),
			vi.spyOn(repositories.savedSets, 'delete'),
			vi.spyOn(repositories.preferences, 'update')
		]
		const transportCalls = [
			vi.spyOn(captured.supabase, 'from'),
			vi.spyOn(captured.supabase, 'rpc'),
			vi.spyOn(captured.supabase.auth, 'signOut'),
			vi.spyOn(captured.supabase.auth, 'getSession'),
			vi.spyOn(captured.supabase.auth, 'getUser'),
			vi.spyOn(captured.supabase.functions, 'invoke')
		]
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		const stateBefore = {
			records: captured.records.records.map((record) => record.id),
			tracks: captured.tracks.tracks.map((track) => track.id),
			crates: captured.crates.crates.map((crate) => ({
				id: crate.id,
				records: [...crate.records]
			})),
			session: captured.session.currentSession.map((entry) => entry.track_id),
			savedSets: captured.session.savedSets.map((savedSet) => savedSet.id)
		}
		const sourceTrack = captured.tracks.tracks[0]!
		const sourceTrackUpdatedAt = sourceTrack.updated_at
		if (!sourceTrackUpdatedAt)
			throw new Error('Expected a revision on the seeded Demo track')
		const {
			id: _id,
			created_at: _createdAt,
			updated_at: _updatedAt,
			audio_features: audioFeatures,
			...trackInput
		} = sourceTrack
		const crate = captured.crates.crates[0]!
		const recordOutsideCrate = captured.records.records.find(
			(record) => !crate.records.includes(record.id)
		)
		setActivePinia(appPinia)

		await expect(
			captured.records.createRecordWithTracks({
				title: 'Blocked Demo record',
				tracks: []
			})
		).resolves.toBeNull()
		await expect(
			captured.records.updateRecord(recordId, { title: 'Blocked edit' })
		).resolves.toBeNull()
		await expect(
			captured.records.updateRecordWithCover(
				recordId,
				{ title: 'Blocked cover edit' },
				{ type: 'remove' }
			)
		).resolves.toBeNull()
		await expect(captured.records.drainCoverCleanup()).resolves.toBe(false)
		await expect(
			captured.mutations.removeRecordFromCollection(recordId)
		).resolves.toBe(false)
		await expect(
			captured.tracks.createTrack({
				...trackInput,
				audio_features: audioFeatures
			})
		).resolves.toBeNull()
		await expect(
			captured.tracks.updateTrack(trackId, { title: 'Blocked edit' })
		).resolves.toBeNull()
		await expect(
			captured.tracks.updateTracksBatch([
				{
					id: trackId,
					expectedUpdatedAt: sourceTrackUpdatedAt,
					updates: { bpm: 123 }
				}
			])
		).resolves.toMatchObject({ cancelled: true })
		await expect(captured.tracks.deleteTrack(trackId)).resolves.toBe(false)
		await expect(
			captured.crates.createCrate({
				name: 'Blocked Demo crate',
				description: null,
				color: null
			})
		).resolves.toBeNull()
		await expect(
			captured.crates.updateCrate(crateId, { name: 'Blocked edit' })
		).resolves.toBeNull()
		await expect(captured.crates.deleteCrate(crateId)).resolves.toBe(false)
		if (!recordOutsideCrate)
			throw new Error('Expected a record outside the crate')
		await expect(
			captured.crates.addRecordToCrate(crateId, recordOutsideCrate.id)
		).resolves.toBe(false)
		await expect(
			captured.crates.removeRecordFromCrate(crateId, crate.records[0]!)
		).resolves.toBe(false)
		await expect(captured.session.saveSession('Demo set')).resolves.toBeNull()
		await captured.session.deleteSet('demo-set')
		await expect(
			captured.preferences.updatePreferences({ key_format: 'key' })
		).resolves.toBe(true)
		await expect(captured.user.signOut()).resolves.toBe(false)
		await expect(captured.user.deleteAllUserData()).resolves.toBe(false)
		await expect(captured.user.deleteAccount('demo')).resolves.toEqual({
			status: 'failed'
		})

		expect({
			records: captured.records.records.map((record) => record.id),
			tracks: captured.tracks.tracks.map((track) => track.id),
			crates: captured.crates.crates.map((currentCrate) => ({
				id: currentCrate.id,
				records: [...currentCrate.records]
			})),
			session: captured.session.currentSession.map((entry) => entry.track_id),
			savedSets: captured.session.savedSets.map((savedSet) => savedSet.id)
		}).toEqual(stateBefore)
		for (const mutation of repositoryMutations) {
			expect(mutation).not.toHaveBeenCalled()
		}
		for (const transport of transportCalls) {
			expect(transport).not.toHaveBeenCalled()
		}
		expect(consoleError).not.toHaveBeenCalled()
		consoleError.mockRestore()
	})

	it('renders crate previews from the isolated demo records store', async () => {
		const sentinelTitle = 'Application store sentinel'

		const appPinia = createPinia()
		const appRecords = useRecordsStore(appPinia)
		appRecords.$patch({
			records: demoRecords.map((record) =>
				createMockLibraryRecord({
					id: record.id,
					title: sentinelTitle
				})
			)
		})

		let renderedCrate: LibraryCrate | undefined
		const DemoCrate = defineComponent({
			setup() {
				const crates = useWorkbenchCratesStore()
				const crate = crates.crates[0]
				if (!crate) throw new Error('Expected a seeded demo crate')
				renderedCrate = crate

				return () => h(CardCrate, { crate })
			}
		})
		const DemoWorkbenchHost = defineComponent({
			async setup() {
				await provideDemoWorkbench()
				return () => h(DemoCrate)
			}
		})

		wrapper = await mountSuspended(DemoWorkbenchHost, {
			global: { plugins: [appPinia] }
		})
		await nextTick()
		if (!renderedCrate) throw new Error('Expected the demo crate to render')

		const card = wrapper.getComponent(CardCrate)
		const summary = card.get('[class~="mt-0.5"]')
		const previewTitles = renderedCrate.records
			.slice(0, 3)
			.map(
				(recordId) =>
					demoRecords.find((record) => record.id === recordId)?.title
			)
			.filter((title): title is string => Boolean(title))
		for (const title of previewTitles) expect(card.text()).toContain(title)
		expect(card.text()).not.toContain(sentinelTitle)
		expect(summary.text()).toMatch(
			new RegExp(`^${renderedCrate.records.length}\\b`)
		)

		await card.get('button').trigger('click')
		expect(card.emitted('select')?.[0]?.[0]).toBe(renderedCrate)
	})

	it('restores the effective main-workspace theme after Demo unmounts', async () => {
		const dataset: LibraryDataset = {
			records: [],
			tracks: [],
			crates: [],
			savedSets: [],
			preferences: {
				ui_theme: 'dark',
				key_format: 'key',
				list_layout: 'cover',
				selected_crate: '',
				turntable_pitch_range: 8,
				turntable_theme: 'silver'
			}
		}
		const repository = createDemoLibraryRepository({
			id: 'main-repository',
			dataset,
			isCurrentContext: () => true
		})
		let demoPreferences:
			ReturnType<typeof useWorkbenchPreferencesStore> | undefined
		const Probe = defineComponent({
			setup() {
				demoPreferences = useWorkbenchPreferencesStore()
				return () => h('div')
			}
		})
		const Host = defineComponent({
			async setup() {
				const appPinia = usePinia()
				bindWorkbenchRuntime(
					appPinia,
					createWorkbenchRuntime(
						{
							id: 'cloud:account:main',
							repositoryId: repository.id,
							location: 'cloud',
							displayLabel: 'Cloud library',
							readOnly: false,
							repositoryRevision: 0,
							capabilities: appWorkbenchCapabilities
						},
						repository
					)
				)
				const mainPreferences = runWithActivePinia(appPinia, () =>
					useLibraryPreferencesStore(appPinia)
				)
				mainPreferences.replacePreferences(dataset.preferences)
				await provideDemoWorkbench()
				return () => h(Probe)
			}
		})

		wrapper = await mountSuspended(Host)
		if (!demoPreferences) throw new Error('Demo preferences did not mount')
		await demoPreferences.updatePreferences({ ui_theme: 'light' })
		expect(document.documentElement.classList.contains('light')).toBe(true)

		wrapper.unmount()
		wrapper = null
		await nextTick()
		expect(document.documentElement.classList.contains('dark')).toBe(true)
	})

	it('provides deterministic enrichment review states without a private XML file', () => {
		const readyReview = createDemoEnrichmentReview('ready')
		const unmatchedReview = createDemoEnrichmentReview('unmatched')

		expect(readyReview.fileName).toBe('crate-guide-demo.xml')
		expect(readyReview.rows).toHaveLength(18)
		expect(readyReview.rows.filter((row) => row.defaultStaged)).toHaveLength(8)
		expect(readyReview.rows.filter((row) => row.alreadyComplete)).toHaveLength(
			2
		)
		expect(readyReview.rows.filter((row) => !row.track)).toHaveLength(4)
		expect(unmatchedReview.selectedFilter).toBe('unmatched')
		expect(unmatchedReview.rows).not.toBe(readyReview.rows)
	})
})
