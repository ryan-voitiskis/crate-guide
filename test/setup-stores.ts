/**
 * Setup file for testing Pinia stores with Nuxt auto-imports
 */
import { computed, readonly, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { beforeEach, vi } from 'vitest'

function getTestUserId(): string | null {
	const storeFactory = (globalThis as { useUserStore?: () => unknown })
		.useUserStore
	if (!storeFactory) return null
	const store = storeFactory() as {
		supaUser?: { id?: unknown; sub?: unknown } | null
		supaUserId?: unknown
	}
	if (typeof store.supaUserId === 'string' && store.supaUserId)
		return store.supaUserId
	const subject = store.supaUser?.sub
	if (typeof subject === 'string' && subject) return subject
	const legacyId = store.supaUser?.id
	return typeof legacyId === 'string' && legacyId ? legacyId : null
}

beforeEach(async () => {
	const [{ ensureCloudWorkbenchRuntime }, { registerWorkbenchRuntimeFactory }] =
		await Promise.all([
			import('~/utils/cloudWorkbenchRuntime'),
			import('~/utils/workbenchPinia')
		])
	registerWorkbenchRuntimeFactory((pinia) =>
		ensureCloudWorkbenchRuntime(pinia, {
			identity: {
				getUserId: getTestUserId,
				async resolveAuthenticatedUserId() {
					const userId = getTestUserId()
					if (!userId) throw new Error('User not logged in.')
					return userId
				}
			}
		})
	)
})

// Provide Nuxt auto-imports as globals
globalThis.defineStore = defineStore
globalThis.ref = ref
globalThis.computed = computed
globalThis.watch = watch
globalThis.readonly = readonly

// Mock toast
globalThis.toast = {
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
	warning: vi.fn()
}

// Export for type declarations
export {}

declare global {
	var defineStore: typeof defineStore
	var ref: typeof ref
	var computed: typeof computed
	var watch: typeof watch
	var readonly: typeof readonly
	var toast: {
		success: ReturnType<typeof vi.fn>
		error: ReturnType<typeof vi.fn>
		info: ReturnType<typeof vi.fn>
		warning: ReturnType<typeof vi.fn>
	}
}
