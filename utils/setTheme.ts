export type ThemeOptions = 'light' | 'dark' | 'contrast'

export function isThemeOption(value: unknown): value is ThemeOptions {
	return value === 'light' || value === 'dark' || value === 'contrast'
}

export function setTheme(theme: ThemeOptions) {
	const root = document.querySelector(':root')
	if (!root) return

	root.classList.remove('light', 'dark', 'contrast')
	root.classList.add(theme)
}
