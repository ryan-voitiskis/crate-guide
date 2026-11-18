/**
 * Latches true the first time `isOpen` is true. Use it to mount a lazy dialog
 * on first use while keeping it mounted afterwards, so closing animations and
 * in-flight save guards keep their lifecycle.
 */
export function useOpenedOnce(isOpen: () => boolean): Readonly<Ref<boolean>> {
	const hasOpened = ref(false)
	watch(
		isOpen,
		(open) => {
			if (open) hasOpened.value = true
		},
		{ immediate: true, flush: 'sync' }
	)
	return readonly(hasOpened)
}
