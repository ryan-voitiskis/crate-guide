export type ThemeOptions = 'light' | 'dark'

export function setTheme(theme: ThemeOptions) {
	document.documentElement?.classList.remove('light', 'dark')
	document.documentElement?.classList.add(theme)
}
