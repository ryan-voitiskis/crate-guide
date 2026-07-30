import { describe, expect, it } from 'vitest'
import { createTrackEnrichmentDraftWorkspaceIdentity } from './trackEnrichmentDraftWorkspaceIdentity'

describe('createTrackEnrichmentDraftWorkspaceIdentity', () => {
	it('creates a deterministic, domain-separated cloud routing alias', async () => {
		const input = {
			workspaceId: 'cloud:account:auth-user-a',
			repositoryId: 'cloud-supabase'
		}

		const first = await createTrackEnrichmentDraftWorkspaceIdentity(
			input,
			'cloud'
		)
		const second = await createTrackEnrichmentDraftWorkspaceIdentity(
			input,
			'cloud'
		)

		expect(first).toEqual(second)
		expect(first).toEqual({
			workspaceId:
				'device-draft:cloud:v1:73bacf87b98eb746af16c9cd7ff372b1b551aad4332407511ab593c9a18a518b',
			repositoryId: 'cloud-supabase'
		})
		expect(JSON.stringify(first)).not.toContain('auth-user-a')
	})

	it('separates account and repository identities', async () => {
		const accountA = await createTrackEnrichmentDraftWorkspaceIdentity(
			{
				workspaceId: 'cloud:account:auth-user-a',
				repositoryId: 'cloud-supabase'
			},
			'cloud'
		)
		const accountB = await createTrackEnrichmentDraftWorkspaceIdentity(
			{
				workspaceId: 'cloud:account:auth-user-b',
				repositoryId: 'cloud-supabase'
			},
			'cloud'
		)
		const otherRepository = await createTrackEnrichmentDraftWorkspaceIdentity(
			{
				workspaceId: 'cloud:account:auth-user-a',
				repositoryId: 'other-cloud'
			},
			'cloud'
		)

		expect(accountA.workspaceId).not.toBe(accountB.workspaceId)
		expect(accountA.workspaceId).not.toBe(otherRepository.workspaceId)
	})

	it('leaves signed-out and browser routing identities byte-identical', async () => {
		const signedOut = {
			workspaceId: 'cloud:signed-out',
			repositoryId: 'cloud-supabase'
		}
		const browser = {
			workspaceId: 'browser:library:device-workspace',
			repositoryId: 'browser-indexeddb'
		}
		const browserWithCloudShapedId = {
			workspaceId: 'cloud:account:not-an-account-in-browser-mode',
			repositoryId: 'browser-indexeddb'
		}

		await expect(
			createTrackEnrichmentDraftWorkspaceIdentity(signedOut, 'cloud')
		).resolves.toEqual(signedOut)
		await expect(
			createTrackEnrichmentDraftWorkspaceIdentity(browser, 'browser')
		).resolves.toEqual(browser)
		await expect(
			createTrackEnrichmentDraftWorkspaceIdentity(
				browserWithCloudShapedId,
				'browser'
			)
		).resolves.toEqual(browserWithCloudShapedId)
	})
})
