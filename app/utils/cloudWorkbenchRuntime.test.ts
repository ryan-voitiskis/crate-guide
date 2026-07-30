import { nextTick, ref, watch } from 'vue'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureCloudWorkbenchRuntime } from './cloudWorkbenchRuntime'
import { createCloudWorkspaceId } from './workspaceIdentity'

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

describe('cloud workbench runtime identity', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('does not let late bootstrap identity A replace reactive identity B', async () => {
		const userId = ref<string | null>(null)
		const bootstrapIdentity = createDeferred<string>()
		vi.stubGlobal('useSupabaseClient', () => ({}))
		vi.stubGlobal('watch', watch)

		const runtime = ensureCloudWorkbenchRuntime(createPinia(), {
			identity: {
				getUserId: () => userId.value,
				resolveAuthenticatedUserId: () => bootstrapIdentity.promise
			}
		})

		expect(runtime.descriptor.value.id).toBe(createCloudWorkspaceId(null))
		userId.value = 'account-b'
		await nextTick()
		expect(runtime.descriptor.value.id).toBe(
			createCloudWorkspaceId('account-b')
		)

		bootstrapIdentity.resolve('account-a')
		await bootstrapIdentity.promise
		await Promise.resolve()

		expect(runtime.descriptor.value.id).toBe(
			createCloudWorkspaceId('account-b')
		)
	})
})
