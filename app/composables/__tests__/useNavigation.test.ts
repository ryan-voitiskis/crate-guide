import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock route - path should be a string, not a ref
let mockRoutePath = '/'
const mockRoute = {
	get path() {
		return mockRoutePath
	}
}

// Stub globals before importing composable
vi.stubGlobal('useRoute', () => mockRoute)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)

// Import after mocks
const { useNavigation, navItems } = await import('../useNavigation')

describe('navItems', () => {
	it('has 6 navigation items', () => {
		expect(navItems).toHaveLength(6)
	})

	it('includes session page', () => {
		const session = navItems.find((item) => item.label === 'Session')
		expect(session).toBeDefined()
		expect(session?.path).toBe('')
	})

	it('includes tracks page', () => {
		const tracks = navItems.find((item) => item.label === 'Tracks')
		expect(tracks).toBeDefined()
		expect(tracks?.path).toBe('/tracks')
	})

	it('includes records page', () => {
		const records = navItems.find((item) => item.label === 'Records')
		expect(records).toBeDefined()
		expect(records?.path).toBe('/records')
	})

	it('includes crates page', () => {
		const crates = navItems.find((item) => item.label === 'Crates')
		expect(crates).toBeDefined()
		expect(crates?.path).toBe('/crates')
	})

	it('includes enrichment page', () => {
		const enrichment = navItems.find((item) => item.label === 'BPM & Key')
		expect(enrichment).toBeDefined()
		expect(enrichment?.path).toBe('/enrichment')
	})

	it('includes settings page', () => {
		const settings = navItems.find((item) => item.label === 'Settings')
		expect(settings).toBeDefined()
		expect(settings?.path).toBe('/settings')
	})

	it('each item has an icon', () => {
		navItems.forEach((item) => {
			expect(item.icon).toBeDefined()
		})
	})
})

describe('useNavigation', () => {
	beforeEach(() => {
		mockRoutePath = '/'
	})

	describe('isDemo', () => {
		it('returns false for non-demo paths', () => {
			mockRoutePath = '/'
			const { isDemo } = useNavigation()
			expect(isDemo.value).toBe(false)
		})

		it('returns true for demo root', () => {
			mockRoutePath = '/demo'
			const { isDemo } = useNavigation()
			expect(isDemo.value).toBe(true)
		})

		it('returns true for demo child paths', () => {
			mockRoutePath = '/demo/tracks'
			const { isDemo } = useNavigation()
			expect(isDemo.value).toBe(true)
		})
	})

	describe('basePath', () => {
		it('returns empty string for non-demo routes', () => {
			mockRoutePath = '/tracks'
			const { basePath } = useNavigation()
			expect(basePath.value).toBe('')
		})

		it('returns /demo for demo routes', () => {
			mockRoutePath = '/demo/tracks'
			const { basePath } = useNavigation()
			expect(basePath.value).toBe('/demo')
		})
	})

	describe('visibleNavItems', () => {
		it('includes enrichment in authenticated navigation', () => {
			mockRoutePath = '/'
			const { visibleNavItems } = useNavigation()

			expect(visibleNavItems.value.map((item) => item.label)).toContain(
				'BPM & Key'
			)
		})

		it('includes enrichment in demo navigation', () => {
			mockRoutePath = '/demo'
			const { visibleNavItems } = useNavigation()

			expect(visibleNavItems.value.map((item) => item.label)).toContain(
				'BPM & Key'
			)
		})
	})

	describe('isActive', () => {
		describe('non-demo mode', () => {
			it('returns true for root path when on /', () => {
				mockRoutePath = '/'
				const { isActive } = useNavigation()
				expect(isActive('')).toBe(true)
			})

			it('returns false for root path when on other page', () => {
				mockRoutePath = '/tracks'
				const { isActive } = useNavigation()
				expect(isActive('')).toBe(false)
			})

			it('returns true for exact path match', () => {
				mockRoutePath = '/tracks'
				const { isActive } = useNavigation()
				expect(isActive('/tracks')).toBe(true)
			})

			it('returns true for child path', () => {
				mockRoutePath = '/records/123'
				const { isActive } = useNavigation()
				expect(isActive('/records')).toBe(true)
			})

			it('returns false for non-matching path', () => {
				mockRoutePath = '/tracks'
				const { isActive } = useNavigation()
				expect(isActive('/records')).toBe(false)
			})

			it('returns false for partial path that is not a child', () => {
				mockRoutePath = '/track-details'
				const { isActive } = useNavigation()
				expect(isActive('/tracks')).toBe(false)
			})
		})

		describe('demo mode', () => {
			it('returns true for demo root when on /demo', () => {
				mockRoutePath = '/demo'
				const { isActive } = useNavigation()
				expect(isActive('')).toBe(true)
			})

			it('returns true for demo nested path', () => {
				mockRoutePath = '/demo/tracks'
				const { isActive } = useNavigation()
				expect(isActive('/tracks')).toBe(true)
			})

			it('returns false for non-matching demo path', () => {
				mockRoutePath = '/demo/records'
				const { isActive } = useNavigation()
				expect(isActive('/tracks')).toBe(false)
			})
		})
	})

	describe('getHref', () => {
		describe('non-demo mode', () => {
			it('returns / for empty path', () => {
				mockRoutePath = '/'
				const { getHref } = useNavigation()
				expect(getHref('')).toBe('/')
			})

			it('returns path as-is for non-empty paths', () => {
				mockRoutePath = '/'
				const { getHref } = useNavigation()
				expect(getHref('/tracks')).toBe('/tracks')
				expect(getHref('/records')).toBe('/records')
			})
		})

		describe('demo mode', () => {
			it('returns /demo for empty path in demo mode', () => {
				mockRoutePath = '/demo'
				const { getHref } = useNavigation()
				expect(getHref('')).toBe('/demo')
			})

			it('prefixes paths with /demo in demo mode', () => {
				mockRoutePath = '/demo'
				const { getHref } = useNavigation()
				expect(getHref('/tracks')).toBe('/demo/tracks')
				expect(getHref('/records')).toBe('/demo/records')
			})
		})
	})
})
