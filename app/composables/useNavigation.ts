import {
	Disc,
	FolderOpen,
	Music,
	Radio,
	Settings,
	WandSparkles
} from 'lucide-vue-next'

export const navItems = [
	{ path: '', label: 'Session', icon: Radio },
	{ path: '/tracks', label: 'Tracks', icon: Music },
	{ path: '/records', label: 'Records', icon: Disc },
	{ path: '/crates', label: 'Crates', icon: FolderOpen },
	{ path: '/enrichment', label: 'Enrich', icon: WandSparkles, demo: false },
	{ path: '/settings', label: 'Settings', icon: Settings }
] as const

export function useNavigation() {
	const route = useRoute()

	const isDemo = computed(() => route.path.startsWith('/demo'))
	const basePath = computed(() => (isDemo.value ? '/demo' : ''))
	const visibleNavItems = computed(() =>
		navItems.filter(
			(item) => !isDemo.value || !('demo' in item) || item.demo !== false
		)
	)

	function isActive(itemPath: string) {
		const fullPath = basePath.value + itemPath
		// For root paths (/ or /demo), require exact match
		if (fullPath === '' || fullPath === '/demo') {
			return route.path === '/' || route.path === '/demo'
		}
		// For nested paths, check exact match or child routes
		return route.path === fullPath || route.path.startsWith(fullPath + '/')
	}

	function getHref(itemPath: string) {
		const fullPath = basePath.value + itemPath
		return fullPath === '' ? '/' : fullPath
	}

	return {
		isDemo,
		basePath,
		visibleNavItems,
		isActive,
		getHref
	}
}
