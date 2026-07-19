import {
	ANONYMOUS_THEME_STORAGE_KEY,
	THEME_OPTIONS
} from '../../shared/constants/theme'
import type { ThemeOptions } from '../../shared/types/options'

// Keep signed-out choices separate from account settings. Authenticated themes
// are persisted in profiles.ui_theme and must never leak into this fallback.
let mediaQueryList: MediaQueryList | null = null
let mediaQueryListener: ((event: MediaQueryListEvent) => void) | null = null

function resolveTheme(theme: ThemeOptions): 'light' | 'dark' {
	if (theme !== 'auto') return theme
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
		return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light'
}

function applyThemeClass(theme: 'light' | 'dark') {
	document.documentElement?.classList.remove('light', 'dark')
	document.documentElement?.classList.add(theme)
}

function clearAutoThemeListener() {
	if (!mediaQueryList || !mediaQueryListener) return
	if (typeof mediaQueryList.removeEventListener === 'function') {
		mediaQueryList.removeEventListener('change', mediaQueryListener)
	} else {
		mediaQueryList.removeListener(mediaQueryListener)
	}
	mediaQueryList = null
	mediaQueryListener = null
}

export function parseThemeOption(value: string | null): ThemeOptions | null {
	if (THEME_OPTIONS.some((theme) => theme === value))
		return value as ThemeOptions
	return null
}

export function getSavedAnonymousThemePreference(): ThemeOptions | null {
	if (typeof window === 'undefined') return null
	return parseThemeOption(
		window.localStorage.getItem(ANONYMOUS_THEME_STORAGE_KEY)
	)
}

export function saveAnonymousThemePreference(theme: ThemeOptions) {
	if (typeof window === 'undefined') return
	window.localStorage.setItem(ANONYMOUS_THEME_STORAGE_KEY, theme)
}

export function setTheme(theme: ThemeOptions) {
	if (typeof document === 'undefined') return
	clearAutoThemeListener()
	if (theme === 'auto' && typeof window !== 'undefined') {
		mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)')
		mediaQueryListener = (event: MediaQueryListEvent) => {
			applyThemeClass(event.matches ? 'dark' : 'light')
		}
		if (typeof mediaQueryList.addEventListener === 'function') {
			mediaQueryList.addEventListener('change', mediaQueryListener)
		} else {
			mediaQueryList.addListener(mediaQueryListener)
		}
		applyThemeClass(mediaQueryList.matches ? 'dark' : 'light')
		return
	}
	const resolvedTheme = resolveTheme(theme)
	applyThemeClass(resolvedTheme)
}
