/**
 * Setup file for testing Pinia stores with Nuxt auto-imports
 */
import { computed, readonly, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { vi } from 'vitest'

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
