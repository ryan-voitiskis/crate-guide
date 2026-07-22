import { describe, expect, it } from 'vitest'
import { createCloudRepositoryState } from '~/repositories/library/cloud/cloudRepositoryState'
import type { LibrarySnapshot } from '~~/shared/types/library'

const context = {
	workspaceId: 'cloud-library',
	repositoryId: 'cloud-supabase',
	activationGeneration: 0,
	repositoryRevision: 0
}

const snapshot: LibrarySnapshot = {
	records: [],
	tracks: [],
	crates: [],
	savedSets: [],
	preferences: {
		ui_theme: 'auto',
		key_format: 'key',
		list_layout: 'cover',
		selected_crate: '',
		turntable_pitch_range: 8,
		turntable_theme: 'silver'
	},
	repositoryRevision: 0
}

function createHarness() {
	let userId: string | null = 'user-a'
	let isWorkspaceCurrent = true
	const state = createCloudRepositoryState({
		repositoryId: 'cloud-supabase',
		supabase: {} as never,
		identity: {
			getUserId: () => userId,
			resolveAuthenticatedUserId: async () => {
				if (!userId) throw new Error('Signed out')
				return userId
			}
		},
		isCurrentContext: () => isWorkspaceCurrent,
		getSupabaseConfig: () => ({ key: 'anon-key', url: 'https://example.test' })
	})
	return {
		state,
		setUserId(nextUserId: string | null) {
			userId = nextUserId
		},
		invalidateWorkspace() {
			isWorkspaceCurrent = false
		}
	}
}

describe('cloud repository publication state', () => {
	it('rejects a snapshot CAS when a mutation commits at its completion boundary', async () => {
		const { state } = createHarness()
		const snapshotLease = await state.capture(context)
		const mutationLease = await state.capture(context)
		expect(state.isLease(snapshotLease)).toBe(true)
		expect(state.isLease(mutationLease)).toBe(true)
		if (!state.isLease(snapshotLease) || !state.isLease(mutationLease)) return

		expect(
			state.complete(mutationLease, { id: 'record-1' }, { mutated: true })
		).toMatchObject({ status: 'success', repositoryRevision: 1 })

		const outcome = state.complete(snapshotLease, snapshot, {
			expectedRevision: snapshotLease.startedRevision
		})
		expect(outcome).toEqual({ status: 'stale' })
	})

	it('cannot publish a cloud lease after auth becomes null or changes subject', async () => {
		const harness = createHarness()
		const signedOutLease = await harness.state.capture(context)
		expect(harness.state.isLease(signedOutLease)).toBe(true)
		if (!harness.state.isLease(signedOutLease)) return

		harness.setUserId(null)
		expect(harness.state.isCurrent(signedOutLease)).toBe(false)
		expect(harness.state.complete(signedOutLease, undefined)).toEqual({
			status: 'stale'
		})

		harness.setUserId('user-a')
		const replacedLease = await harness.state.capture(context)
		expect(harness.state.isLease(replacedLease)).toBe(true)
		if (!harness.state.isLease(replacedLease)) return
		harness.setUserId('user-b')
		expect(harness.state.complete(replacedLease, undefined)).toEqual({
			status: 'stale'
		})

		harness.invalidateWorkspace()
		expect(harness.state.isCurrent(replacedLease)).toBe(false)
	})
})
