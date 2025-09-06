export function openInNewTab(url: string) {
	if (typeof window !== 'undefined') window.open(url, '_blank')
}
