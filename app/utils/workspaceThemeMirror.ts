import type { ThemeOptions } from '~~/shared/types/options'
import {
	BROWSER_LIBRARY_WORKSPACE_PREFIX,
	CLOUD_ACCOUNT_WORKSPACE_PREFIX,
	WORKSPACE_THEME_MIRROR_STORAGE_KEY,
	WORKSPACE_THEME_OWNER_SALT_STORAGE_KEY
} from '../../shared/constants/theme'
import { parseThemeOption } from './setTheme'

type WorkspaceThemeMirror = {
	location: 'browser' | 'cloud'
	ownerTag: string
	theme: ThemeOptions
}

const OWNER_TAG_PATTERN = /^owner:[0-9a-f]{16}$/
const OWNER_SALT_PATTERN = /^[0-9a-f]{32}$/

export function isThemeMirrorWorkspaceId(workspaceId: string): boolean {
	return (
		workspaceId.startsWith(CLOUD_ACCOUNT_WORKSPACE_PREFIX) ||
		workspaceId.startsWith(BROWSER_LIBRARY_WORKSPACE_PREFIX)
	)
}

function getMirrorLocation(
	workspaceId: string
): WorkspaceThemeMirror['location'] | null {
	if (workspaceId.startsWith(CLOUD_ACCOUNT_WORKSPACE_PREFIX)) return 'cloud'
	if (workspaceId.startsWith(BROWSER_LIBRARY_WORKSPACE_PREFIX)) return 'browser'
	return null
}

function readOwnerSalt(): string | null {
	if (typeof window === 'undefined') return null
	try {
		const salt = window.localStorage.getItem(
			WORKSPACE_THEME_OWNER_SALT_STORAGE_KEY
		)
		return salt && OWNER_SALT_PATTERN.test(salt) ? salt : null
	} catch {
		return null
	}
}

function createOwnerSalt(): string | null {
	if (typeof window === 'undefined') return null
	try {
		const bytes = new Uint8Array(16)
		globalThis.crypto.getRandomValues(bytes)
		const salt = Array.from(bytes, (value) =>
			value.toString(16).padStart(2, '0')
		).join('')
		window.localStorage.setItem(WORKSPACE_THEME_OWNER_SALT_STORAGE_KEY, salt)
		return salt
	} catch {
		return null
	}
}

function getOrCreateOwnerSalt(): string | null {
	return readOwnerSalt() ?? createOwnerSalt()
}

/**
 * Produces a device-local data-minimisation tag. This is deliberately not an
 * authentication token or security boundary; it only avoids persisting raw
 * account/workspace identifiers in the optional first-paint cache.
 */
function createOpaqueOwnerTag(workspaceId: string, salt: string): string {
	const input = `${salt}:${workspaceId}`
	let left = 0x811c9dc5
	let right = 0x9e3779b9
	for (let index = 0; index < input.length; index += 1) {
		const character = input.charCodeAt(index)
		left = Math.imul(left ^ character, 0x01000193)
		right = Math.imul(right ^ character, 0x85ebca6b)
	}
	return `owner:${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0)
		.toString(16)
		.padStart(8, '0')}`
}

function readMirror(): WorkspaceThemeMirror | null {
	if (typeof window === 'undefined') return null
	try {
		const value: unknown = JSON.parse(
			window.localStorage.getItem(WORKSPACE_THEME_MIRROR_STORAGE_KEY) ?? 'null'
		)
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null
		const mirror = value as Partial<WorkspaceThemeMirror>
		if (
			(mirror.location !== 'cloud' && mirror.location !== 'browser') ||
			typeof mirror.ownerTag !== 'string' ||
			!OWNER_TAG_PATTERN.test(mirror.ownerTag)
		)
			return null
		const theme = parseThemeOption(
			typeof mirror.theme === 'string' ? mirror.theme : null
		)
		return theme
			? {
					location: mirror.location,
					ownerTag: mirror.ownerTag,
					theme
				}
			: null
	} catch {
		return null
	}
}

export function readWorkspaceThemeMirror(
	workspaceId: string
): ThemeOptions | null {
	const location = getMirrorLocation(workspaceId)
	const salt = readOwnerSalt()
	if (!location || !salt) return null
	const mirror = readMirror()
	return mirror?.location === location &&
		mirror.ownerTag === createOpaqueOwnerTag(workspaceId, salt)
		? mirror.theme
		: null
}

export function clearWorkspaceThemeMirror(): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.removeItem(WORKSPACE_THEME_MIRROR_STORAGE_KEY)
	} catch {
		// This cache is optional. The repository remains authoritative.
	}
}

export function activateWorkspaceThemeMirror(
	workspaceId: string
): ThemeOptions | null {
	const theme = readWorkspaceThemeMirror(workspaceId)
	if (!theme) clearWorkspaceThemeMirror()
	return theme
}

export function writeWorkspaceThemeMirror(
	workspaceId: string,
	theme: ThemeOptions
): void {
	if (typeof window === 'undefined') return
	const location = getMirrorLocation(workspaceId)
	const salt = location ? getOrCreateOwnerSalt() : null
	if (!location || !salt) return
	try {
		window.localStorage.setItem(
			WORKSPACE_THEME_MIRROR_STORAGE_KEY,
			JSON.stringify({
				location,
				ownerTag: createOpaqueOwnerTag(workspaceId, salt),
				theme
			} satisfies WorkspaceThemeMirror)
		)
	} catch {
		// This is only a first-paint cache. The repository remains authoritative.
	}
}
