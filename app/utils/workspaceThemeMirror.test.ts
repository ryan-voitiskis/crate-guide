import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	WORKSPACE_THEME_MIRROR_STORAGE_KEY,
	WORKSPACE_THEME_OWNER_SALT_STORAGE_KEY
} from '../../shared/constants/theme'
import { createCloudWorkspaceId } from './workspaceIdentity'
import {
	activateWorkspaceThemeMirror,
	clearWorkspaceThemeMirror,
	readWorkspaceThemeMirror,
	writeWorkspaceThemeMirror
} from './workspaceThemeMirror'

describe('workspace theme mirror', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('runtime activation rejects and clears a mirror owned by another workspace', () => {
		const stored = new Map<string, string>()
		vi.stubGlobal('window', {
			localStorage: {
				getItem: vi.fn((key: string) => stored.get(key) ?? null),
				setItem: vi.fn((key: string, value: string) => {
					stored.set(key, value)
				}),
				removeItem: vi.fn((key: string) => {
					stored.delete(key)
				})
			}
		})
		const workspaceA = createCloudWorkspaceId('account-a')
		const workspaceB = createCloudWorkspaceId('account-b')

		writeWorkspaceThemeMirror(workspaceA, 'dark')

		expect(readWorkspaceThemeMirror(workspaceA)).toBe('dark')
		expect(readWorkspaceThemeMirror(workspaceB)).toBeNull()
		expect(activateWorkspaceThemeMirror(workspaceB)).toBeNull()
		expect(stored.has(WORKSPACE_THEME_MIRROR_STORAGE_KEY)).toBe(false)
		expect(readWorkspaceThemeMirror(workspaceA)).toBeNull()
		clearWorkspaceThemeMirror()
		expect(stored.has(WORKSPACE_THEME_OWNER_SALT_STORAGE_KEY)).toBe(true)
	})

	it('never persists raw account identifiers in the first-paint cache', () => {
		const stored = new Map<string, string>()
		vi.stubGlobal('window', {
			localStorage: {
				getItem: vi.fn((key: string) => stored.get(key) ?? null),
				setItem: vi.fn((key: string, value: string) => {
					stored.set(key, value)
				}),
				removeItem: vi.fn((key: string) => stored.delete(key))
			}
		})
		const accountA = 'account-a-sensitive-uuid'
		const accountB = 'account-b-sensitive-uuid'

		writeWorkspaceThemeMirror(createCloudWorkspaceId(accountA), 'dark')
		expect(readWorkspaceThemeMirror(createCloudWorkspaceId(accountA))).toBe(
			'dark'
		)
		expect(
			readWorkspaceThemeMirror(createCloudWorkspaceId(accountB))
		).toBeNull()

		const persisted = [...stored.values()].join('\n')
		expect(persisted).not.toContain(accountA)
		expect(persisted).not.toContain(accountB)
		expect(stored.get(WORKSPACE_THEME_MIRROR_STORAGE_KEY)).toMatch(
			/"ownerTag":"owner:[0-9a-f]{16}"/
		)
	})

	it('cannot reject a committed preference when local storage denies writes', () => {
		vi.stubGlobal('window', {
			localStorage: {
				getItem: vi.fn(() => null),
				setItem: vi.fn(() => {
					throw new DOMException('Denied', 'QuotaExceededError')
				}),
				removeItem: vi.fn()
			}
		})

		expect(() =>
			writeWorkspaceThemeMirror(createCloudWorkspaceId('account-a'), 'dark')
		).not.toThrow()
	})

	it('treats denied reads as a cache miss', () => {
		vi.stubGlobal('window', {
			localStorage: {
				getItem: vi.fn(() => {
					throw new DOMException('Denied', 'SecurityError')
				}),
				setItem: vi.fn(),
				removeItem: vi.fn()
			}
		})

		expect(
			readWorkspaceThemeMirror(createCloudWorkspaceId('account-a'))
		).toBeNull()
	})

	it('refuses an unowned or signed-out workspace tag', () => {
		const setItem = vi.fn()
		vi.stubGlobal('window', {
			localStorage: { getItem: vi.fn(), setItem, removeItem: vi.fn() }
		})

		writeWorkspaceThemeMirror('demo', 'dark')
		writeWorkspaceThemeMirror(createCloudWorkspaceId(null), 'dark')

		expect(setItem).not.toHaveBeenCalled()
	})
})
