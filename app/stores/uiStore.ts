import { defineStore } from 'pinia'

type TabOptions = 'session' | 'collection'

export const useUiStore = defineStore('ui', () => {
	const tab = ref<TabOptions>('session')

	function setTab(newTab: TabOptions) {
		tab.value = newTab
	}

	return {
		tab,
		setTab
	}
})
