export type ThemeOptions = 'light' | 'dark'

export function isThemeOption(value: unknown): value is ThemeOptions {
	return value === 'light' || value === 'dark'
}

export function setTheme(theme: ThemeOptions) {
	document.documentElement?.classList.remove('light', 'dark')
	document.documentElement?.classList.add(theme)
}
