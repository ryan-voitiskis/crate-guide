import { defineComponent, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import {
	provideDemoWorkbench,
	useWorkbenchCapabilities,
	useWorkbenchCratesStore,
	useWorkbenchRecordsStore,
	useWorkbenchSessionStore,
	useWorkbenchTracksStore,
	useWorkbenchUserStore
} from '~/composables/useWorkbench'

let wrapper: VueWrapper | null = null

describe('demo workbench', () => {
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it('provides isolated fixtures and blocks account-backed commands', async () => {
		let captured:
			| {
					capabilities: ReturnType<typeof useWorkbenchCapabilities>
					records: ReturnType<typeof useWorkbenchRecordsStore>
					tracks: ReturnType<typeof useWorkbenchTracksStore>
					crates: ReturnType<typeof useWorkbenchCratesStore>
					session: ReturnType<typeof useWorkbenchSessionStore>
					user: ReturnType<typeof useWorkbenchUserStore>
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
					user: useWorkbenchUserStore()
				}
				return () => h('div', { 'data-testid': 'demo-probe' })
			}
		})
		const DemoWorkbenchHost = defineComponent({
			setup() {
				provideDemoWorkbench()
				return () => h(ProbeDemoWorkbench)
			}
		})

		wrapper = await mountSuspended(DemoWorkbenchHost)
		await nextTick()

		if (!captured) throw new Error('Demo workbench probe did not mount')

		expect(captured.capabilities).toMatchObject({
			mode: 'demo',
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

		expect(await captured.tracks.deleteTrack(trackId)).toBe(false)
		expect(await captured.records.deleteRecord(recordId)).toBe(false)
		expect(await captured.crates.deleteCrate(crateId)).toBe(false)
		expect(await captured.session.saveSession('Demo set')).toBeNull()
		expect(captured.tracks.tracks).toHaveLength(24)
		expect(captured.records.records).toHaveLength(6)
		expect(captured.crates.crates).toHaveLength(3)
	})
})
