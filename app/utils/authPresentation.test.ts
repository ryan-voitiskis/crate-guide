import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANONYMOUS_THEME_STORAGE_KEY } from '../../shared/constants/theme'
import { buildAnonymousThemeBootstrapScript } from './themeBootstrap'

type Oklch = [lightness: number, chroma: number, hue: number]

function parseOklch(block: string, token: string): Oklch {
	const match = block.match(
		new RegExp(`--${token}: oklch\\(([-.\\d]+) ([-.\\d]+) ([-.\\d]+)\\)`)
	)
	if (!match) throw new Error(`Missing ${token} token`)
	return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function linearRgb([lightness, chroma, hue]: Oklch): [number, number, number] {
	const radians = (hue * Math.PI) / 180
	const a = chroma * Math.cos(radians)
	const b = chroma * Math.sin(radians)
	const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b
	const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b
	const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b
	const l = lPrime ** 3
	const m = mPrime ** 3
	const s = sPrime ** 3
	const clamp = (value: number) => Math.max(0, Math.min(1, value))
	return [
		clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
	]
}

function luminance(color: Oklch): number {
	const [red, green, blue] = linearRgb(color)
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(first: Oklch, second: Oklch): number {
	const firstLuminance = luminance(first)
	const secondLuminance = luminance(second)
	return (
		(Math.max(firstLuminance, secondLuminance) + 0.05) /
		(Math.min(firstLuminance, secondLuminance) + 0.05)
	)
}

describe('authentication presentation contracts', () => {
	const css = readFileSync(
		fileURLToPath(new URL('../assets/css/main.css', import.meta.url)),
		'utf8'
	)
	const lightBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
	const darkBlock = css.slice(
		css.indexOf('.dark {'),
		css.indexOf('@theme inline')
	)

	it.each([
		[
			'light primary button',
			lightBlock,
			'auth-primary-foreground',
			'auth-primary'
		],
		[
			'dark primary button',
			darkBlock,
			'auth-primary-foreground',
			'auth-primary'
		],
		['light muted card copy', lightBlock, 'auth-muted-foreground', 'card'],
		[
			'light muted inset copy',
			lightBlock,
			'auth-muted-foreground',
			'workbench-inset'
		],
		['dark muted card copy', darkBlock, 'auth-muted-foreground', 'card'],
		[
			'dark muted inset copy',
			darkBlock,
			'auth-muted-foreground',
			'workbench-inset'
		],
		['light destructive card copy', lightBlock, 'auth-destructive', 'card'],
		[
			'light destructive inset copy',
			lightBlock,
			'auth-destructive',
			'workbench-inset'
		],
		['dark destructive card copy', darkBlock, 'auth-destructive', 'card'],
		[
			'dark destructive inset copy',
			darkBlock,
			'auth-destructive',
			'workbench-inset'
		]
	])(
		'%s meets WCAG normal-text contrast',
		(_name, block, foreground, background) => {
			expect(
				contrast(parseOklch(block, foreground), parseOklch(block, background))
			).toBeGreaterThanOrEqual(4.5)
		}
	)

	it('builds the pre-paint parser from the shared anonymous storage key', () => {
		const script = buildAnonymousThemeBootstrapScript()

		expect(script).toContain(JSON.stringify(ANONYMOUS_THEME_STORAGE_KEY))
		expect(script).toContain("saved==='light'||saved==='dark'||saved==='auto'")
		expect(script).toContain('root.classList.add(resolved)')
		expect(script).not.toContain('eval(')
	})

	it.each([
		['../pages/login.vue', 'Log in · Crate Guide'],
		['../pages/signup.vue', 'Create account · Crate Guide'],
		['../pages/reset-password.vue', 'Reset password · Crate Guide'],
		['../pages/update-password.vue', 'Choose new password · Crate Guide'],
		['../pages/auth/check-inbox.vue', 'Check your inbox · Crate Guide'],
		['../pages/auth/confirm.vue', '· Crate Guide'],
		['../pages/auth/finalising.vue', 'Completing sign in · Crate Guide']
	])('gives %s a safe Crate Guide title', (relativePath, expectedTitle) => {
		const source = readFileSync(
			fileURLToPath(new URL(relativePath, import.meta.url)),
			'utf8'
		)
		expect(source).toContain('useHead({')
		expect(source).toContain(expectedTitle)
	})
})
