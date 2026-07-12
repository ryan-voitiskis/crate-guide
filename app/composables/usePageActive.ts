/**
 * Tracks whether a page component is currently active (visible).
 * Works with KeepAlive by using onActivated/onDeactivated lifecycle hooks.
 */
export function usePageActive(initialValue = false) {
	const isActive = ref(initialValue)

	onMounted(() => {
		isActive.value = true
	})

	onActivated(() => {
		isActive.value = true
	})

	onDeactivated(() => {
		isActive.value = false
	})

	return isActive
}
