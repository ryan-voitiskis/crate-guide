import type { Component } from 'vue'
import {
	Disc,
	FolderOpen,
	Music,
	Radio,
	Settings,
	WandSparkles
} from '@lucide/vue'

type NavigationItem = {
	path: string
	label: string
	description: string
	shortcut: string
	prefetch: boolean
	icon: Component
}

export const navItems = [
	{
		path: '',
		label: 'Session',
		description: 'Build and rehearse a set across virtual decks',
		shortcut: 'G S',
		prefetch: true,
		icon: Radio
	},
	{
		path: '/tracks',
		label: 'Tracks',
		description: 'Search, sort and inspect the full track library',
		shortcut: 'G T',
		prefetch: true,
		icon: Music
	},
	{
		path: '/records',
		label: 'Records',
		description: 'Browse releases, labels and catalog numbers',
		shortcut: 'G R',
		prefetch: true,
		icon: Disc
	},
	{
		path: '/crates',
		label: 'Crates',
		description: 'Organise records into gig-ready collections',
		shortcut: 'G C',
		prefetch: true,
		icon: FolderOpen
	},
	{
		path: '/enrichment',
		label: 'BPM & Key',
		description: 'Review and apply local track analysis',
		shortcut: 'G E',
		prefetch: false,
		icon: WandSparkles
	},
	{
		path: '/settings',
		label: 'Settings',
		description: 'Appearance, accounts and integrations',
		shortcut: 'G ,',
		prefetch: true,
		icon: Settings
	}
] as const satisfies readonly NavigationItem[]

export function useNavigation() {
	const route = useRoute()

	const isDemo = computed(() => route.path.startsWith('/demo'))
	const basePath = computed(() => (isDemo.value ? '/demo' : ''))
	const visibleNavItems = computed(() => navItems)

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
