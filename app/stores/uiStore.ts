import { defineStore } from 'pinia'

type TabOptions = 'session' | 'tracks' | 'records' | 'settings'

export const useUiStore = defineStore('ui', () => {
	const tab = ref<TabOptions>('tracks')

	function setTab(newTab: TabOptions) {
		tab.value = newTab
	}

	return {
		tab,
		setTab
	}
})
