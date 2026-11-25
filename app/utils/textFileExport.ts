/** Copy text to the system clipboard. Resolves false when the browser refuses. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
	const clipboard = globalThis.navigator?.clipboard
	if (!clipboard?.writeText) return false
	try {
		await clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

const UTF8_BOM = '﻿'

/**
 * Save text as a file through a temporary object URL. `withBom` prefixes a
 * UTF-8 byte order mark, which spreadsheet apps need to read non-ASCII CSV.
 */
export function downloadTextFile(
	filename: string,
	text: string,
	mimeType: string,
	options: { withBom?: boolean } = {}
): boolean {
	if (typeof document === 'undefined' || !globalThis.URL?.createObjectURL) {
		return false
	}
	const blob = new Blob([options.withBom ? UTF8_BOM + text : text], {
		type: `${mimeType};charset=utf-8`
	})
	const url = URL.createObjectURL(blob)
	try {
		const link = document.createElement('a')
		link.href = url
		link.download = filename
		link.rel = 'noopener'
		document.body.append(link)
		link.click()
		link.remove()
		return true
	} finally {
		// Some browsers start the download asynchronously after the click, so
		// keep the object URL alive briefly before releasing the blob.
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	}
}
