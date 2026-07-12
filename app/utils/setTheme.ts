import type { ThemeOptions } from '../../shared/types/options'

const THEME_STORAGE_KEY = 'crate-guide:theme'
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

function parseThemeOption(value: string | null): ThemeOptions | null {
	if (value === 'light' || value === 'dark' || value === 'auto') return value
	return null
}

export function getSavedThemePreference(): ThemeOptions | null {
	if (typeof window === 'undefined') return null
	return parseThemeOption(window.localStorage.getItem(THEME_STORAGE_KEY))
}

export function saveThemePreference(theme: ThemeOptions) {
	if (typeof window === 'undefined') return
	window.localStorage.setItem(THEME_STORAGE_KEY, theme)
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
