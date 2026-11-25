import { computed, nextTick } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { type VueWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SessionPage from '~/pages/index.vue'
import { FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY } from '~/utils/firstRunChecklist'

type MockTrack = { bpm: number | null; key: number | null; mode: number | null }

const pageMocks = await vi.hoisted(async () => {
	const { reactive } = await import('vue')
	return reactive({
		workspace: { id: 'cloud:account-a', readOnly: false },
		user: { profile: { id: 'account-a' } as { id: string } | null },
		capabilities: {
			location: 'cloud',
			canPersistSessions: true,
			canMutateLibrary: true,
			canManageCrates: true,
			canConnectDiscogs: true,
			canEnrichTracks: true,
			canManageAccount: true
		},
		records: {
			records: [] as { id: string; discogs_id: number | null }[],
			isLoadingRecords: false,
			get hasRecords(): boolean {
				return this.records.length > 0
			}
		},
		tracks: {
			tracks: [] as MockTrack[],
			isLoadingTracks: false,
			get hasTracks(): boolean {
				return this.tracks.length > 0
			}
		},
		crates: { crates: [] as { id: string }[], isLoadingCrates: false },
		session: {
			decks: [] as unknown[],
			showHistory: false,
			savedSets: [] as { id: string }[],
			setTrackSource: () => undefined,
			fetchSavedSets: (() => Promise.resolve()) as () => Promise<void>
		},
		discogsAuth: { isOAuthed: false }
	})
})

mockNuxtImport('useWorkbenchRecordsStore', () => () => pageMocks.records)
mockNuxtImport('useWorkbenchTracksStore', () => () => pageMocks.tracks)
mockNuxtImport('useWorkbenchCratesStore', () => () => pageMocks.crates)
mockNuxtImport('useWorkbenchSessionStore', () => () => pageMocks.session)
mockNuxtImport(
	'useWorkbenchDiscogsAuthStore',
	() => () => pageMocks.discogsAuth
)
mockNuxtImport('useWorkbenchCapabilities', () => () => pageMocks.capabilities)
mockNuxtImport('useWorkbenchUserStore', () => () => pageMocks.user)
mockNuxtImport('useWorkbenchRuntime', () => () => ({
	descriptor: computed(() => ({
		id: pageMocks.workspace.id,
		readOnly: pageMocks.workspace.readOnly,
		capabilities: pageMocks.capabilities
	}))
}))
mockNuxtImport('usePageActive', () => () => computed(() => true))

const annotated: MockTrack = { bpm: 124, key: 7, mode: 1 }
const blank: MockTrack = { bpm: null, key: null, mode: null }

let wrapper: VueWrapper | null = null

async function mountSessionPage() {
	document.body.innerHTML = '<div id="header-left"></div>'
	wrapper = await mountSuspended(SessionPage, {
		attachTo: document.body,
		global: {
			stubs: {
				DeckColumn: true,
				DialogSaveSession: true,
				DialogSelectDeck: true,
				DialogSetManager: true,
				HeaderSessionControls: true,
				PanelSessionHistory: true,
				StateEmptyCollection: true,
				StateLoading: true
			}
		}
	})
	await flushPromises()
	await vi.waitFor(() => undefined)
}

function findChecklist() {
	return wrapper?.find('[data-testid="first-run-checklist"]')
}

async function waitForChecklist() {
	await vi.waitFor(() => {
		expect(findChecklist()?.exists()).toBe(true)
	})
	return findChecklist()!
}

function stepDone(stepId: string): string | undefined {
	return findChecklist()
		?.get(`[data-step-id="${stepId}"]`)
		.attributes('data-step-done')
}

describe('Session home first-run checklist', () => {
	beforeEach(() => {
		window.localStorage.clear()
		pageMocks.workspace.id = 'cloud:account-a'
		pageMocks.workspace.readOnly = false
		pageMocks.user.profile = { id: 'account-a' }
		pageMocks.capabilities.canMutateLibrary = true
		pageMocks.capabilities.canPersistSessions = true
		pageMocks.records.records = []
		pageMocks.records.isLoadingRecords = false
		pageMocks.tracks.tracks = []
		pageMocks.tracks.isLoadingTracks = false
		pageMocks.crates.crates = []
		pageMocks.crates.isLoadingCrates = false
		pageMocks.session.savedSets = []
		pageMocks.session.fetchSavedSets = () => Promise.resolve()
		pageMocks.discogsAuth.isOAuthed = false
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		document.body.innerHTML = ''
		vi.restoreAllMocks()
	})

	it('shows a new account every step with links to where each is done', async () => {
		await mountSessionPage()
		const checklist = await waitForChecklist()

		expect(checklist.text()).toContain('0 of 5 done')
		expect(checklist.text()).toContain('0% of your tracks have BPM and key')
		const hrefs = checklist.findAll('a').map((link) => link.attributes('href'))
		expect(hrefs).toEqual(['/settings', '/records', '/tracks', '/crates'])
		// The existing empty state remains the primary call to action.
		expect(
			wrapper?.findComponent({ name: 'StateEmptyCollection' }).exists()
		).toBe(true)
	})

	it('derives each step from library state and updates the BPM and key bar live', async () => {
		pageMocks.records.records = [{ id: 'r1', discogs_id: 123 }]
		pageMocks.tracks.tracks = [annotated, blank, blank, blank]
		await mountSessionPage()
		const checklist = await waitForChecklist()

		expect(stepDone('connect-discogs')).toBe('true')
		expect(stepDone('import-records')).toBe('true')
		expect(stepDone('add-bpm-key')).toBe('false')
		expect(checklist.text()).toContain('25% of your tracks have BPM and key')
		expect(checklist.text()).toContain('1 of 4')
		expect(checklist.get('[role="progressbar"]').attributes('aria-label')).toBe(
			'25% of your tracks have BPM and key'
		)

		pageMocks.tracks.tracks = [annotated, annotated, annotated, blank]
		pageMocks.crates.crates = [{ id: 'c1' }]
		await nextTick()

		expect(findChecklist()?.text()).toContain(
			'75% of your tracks have BPM and key'
		)
		expect(stepDone('add-bpm-key')).toBe('true')
		expect(stepDone('build-crate')).toBe('true')
		expect(stepDone('plan-set')).toBe('false')
		expect(findChecklist()?.text()).toContain('4 of 5 done')
	})

	it('hides itself once every step is complete', async () => {
		pageMocks.discogsAuth.isOAuthed = true
		pageMocks.records.records = [{ id: 'r1', discogs_id: null }]
		pageMocks.tracks.tracks = [annotated]
		pageMocks.crates.crates = [{ id: 'c1' }]
		await mountSessionPage()
		await waitForChecklist()

		pageMocks.session.savedSets = [{ id: 'set-1' }]
		await nextTick()

		expect(findChecklist()?.exists()).toBe(false)
	})

	it('waits for saved sets before deciding whether a set has been planned', async () => {
		let resolveSets: () => void = () => undefined
		pageMocks.session.fetchSavedSets = () =>
			new Promise<void>((resolve) => {
				resolveSets = resolve
			})
		pageMocks.discogsAuth.isOAuthed = true
		pageMocks.records.records = [{ id: 'r1', discogs_id: 1 }]
		pageMocks.tracks.tracks = [annotated]
		pageMocks.crates.crates = [{ id: 'c1' }]
		await mountSessionPage()

		// Until the list is known, "Plan a set" might already be done.
		expect(findChecklist()?.exists()).toBe(false)
		resolveSets()
		await flushPromises()

		await waitForChecklist()
		expect(stepDone('plan-set')).toBe('false')
		expect(findChecklist()?.text()).toContain('4 of 5 done')
	})

	it('stays hidden while the library is loading', async () => {
		pageMocks.records.isLoadingRecords = true
		await mountSessionPage()
		expect(findChecklist()?.exists()).toBe(false)

		pageMocks.records.isLoadingRecords = false
		await waitForChecklist()
	})

	it('never renders in a read-only workspace such as the demo', async () => {
		pageMocks.capabilities.canMutateLibrary = false
		pageMocks.capabilities.canPersistSessions = false
		pageMocks.records.records = [{ id: 'r1', discogs_id: 1 }]
		pageMocks.tracks.tracks = [blank]
		await mountSessionPage()

		expect(findChecklist()?.exists()).toBe(false)

		// The same library in a writable workspace does get the checklist.
		pageMocks.capabilities.canMutateLibrary = true
		await waitForChecklist()
	})

	it('also respects a read-only workspace flag set independently of capabilities', async () => {
		pageMocks.workspace.readOnly = true
		await mountSessionPage()
		expect(findChecklist()?.exists()).toBe(false)

		pageMocks.workspace.readOnly = false
		await waitForChecklist()
	})

	it('waits for the account profile so a connected DJ never sees "Connect Discogs" flash', async () => {
		pageMocks.user.profile = null
		pageMocks.records.records = [{ id: 'r1', discogs_id: null }]
		await mountSessionPage()
		expect(findChecklist()?.exists()).toBe(false)

		pageMocks.user.profile = { id: 'account-a' }
		await waitForChecklist()
	})

	it('refetches saved sets for a new workspace before deciding again', async () => {
		const resolvers: (() => void)[] = []
		const fetchSavedSets = vi.fn(
			() => new Promise<void>((resolve) => void resolvers.push(resolve))
		)
		pageMocks.session.fetchSavedSets = fetchSavedSets
		await mountSessionPage()
		resolvers[0]?.()
		await waitForChecklist()

		// Another account signs in while the Session page stays mounted.
		pageMocks.workspace.id = 'cloud:account-b'
		await nextTick()
		expect(fetchSavedSets).toHaveBeenCalledTimes(2)
		expect(findChecklist()?.exists()).toBe(false)

		// A late answer for the previous workspace does not mark the new one ready.
		resolvers[0]?.()
		await flushPromises()
		expect(findChecklist()?.exists()).toBe(false)

		resolvers[1]?.()
		await waitForChecklist()
	})

	it('keeps the plan-a-set hint visible on phones because that step has no link', async () => {
		await mountSessionPage()
		const checklist = await waitForChecklist()

		const planHint = checklist.get('[data-step-id="plan-set"] p')
		expect(planHint.classes()).not.toContain('hidden')
		expect(planHint.text()).toContain('save the set')
		expect(checklist.get('[data-step-id="build-crate"] p').classes()).toContain(
			'hidden'
		)
	})

	it('remembers a dismissal in this browser across visits', async () => {
		await mountSessionPage()
		const checklist = await waitForChecklist()

		await checklist
			.get('[data-testid="first-run-checklist-dismiss"]')
			.trigger('click')
		await nextTick()

		expect(findChecklist()?.exists()).toBe(false)
		expect(
			window.localStorage.getItem(FIRST_RUN_CHECKLIST_DISMISSED_STORAGE_KEY)
		).toBe('1')
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(
				wrapper?.get('[data-testid="session-content"]').element
			)
		})

		wrapper?.unmount()
		await mountSessionPage()
		expect(findChecklist()?.exists()).toBe(false)
	})

	it('still dismisses for this visit when browser storage is unavailable', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError')
		})
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError')
		})
		await mountSessionPage()
		const checklist = await waitForChecklist()

		await checklist
			.get('[data-testid="first-run-checklist-dismiss"]')
			.trigger('click')
		await nextTick()

		expect(findChecklist()?.exists()).toBe(false)
	})
})
