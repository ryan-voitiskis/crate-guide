import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard, downloadTextFile } from './textFileExport'

interface FakeLink {
	href: string
	download: string
	rel: string
	click: ReturnType<typeof vi.fn>
	remove: ReturnType<typeof vi.fn>
}

function stubDom(options: { clickThrows?: boolean } = {}) {
	const links: FakeLink[] = []
	const attached = new Set<FakeLink>()
	vi.stubGlobal('document', {
		createElement: () => {
			const link: FakeLink = {
				href: '',
				download: '',
				rel: '',
				click: vi.fn(() => {
					if (options.clickThrows) throw new Error('blocked')
				}),
				remove: vi.fn(() => attached.delete(link))
			}
			links.push(link)
			return link
		},
		body: { append: (link: FakeLink) => attached.add(link) }
	})
	return { links, attached }
}

describe('downloadTextFile', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it('clicks a temporary link and revokes the object URL afterwards', async () => {
		vi.useFakeTimers()
		const { links, attached } = stubDom()
		const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

		expect(
			downloadTextFile('set.csv', 'a,b', 'text/csv', { withBom: true })
		).toBe(true)

		expect(links[0]).toMatchObject({ href: 'blob:x', download: 'set.csv' })
		expect(links[0]!.click).toHaveBeenCalledOnce()
		expect(attached.size).toBe(0)
		const blob = create.mock.calls[0]![0] as Blob
		expect(blob.type).toBe('text/csv;charset=utf-8')
		expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(
			new Uint8Array([0xef, 0xbb, 0xbf])
		)
		expect(revoke).not.toHaveBeenCalled()
		vi.advanceTimersByTime(1000)
		expect(revoke).toHaveBeenCalledWith('blob:x')
	})

	it('returns false when creating the object URL throws', () => {
		stubDom()
		vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
			throw new Error('quota')
		})
		vi.spyOn(console, 'error').mockImplementation(() => {})

		expect(downloadTextFile('set.txt', 'x', 'text/plain')).toBe(false)
	})

	it('returns false, detaches the link and revokes the URL when the click throws', () => {
		vi.useFakeTimers()
		const { attached } = stubDom({ clickThrows: true })
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:y')
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
		vi.spyOn(console, 'error').mockImplementation(() => {})

		expect(downloadTextFile('set.txt', 'x', 'text/plain')).toBe(false)
		expect(attached.size).toBe(0)
		vi.advanceTimersByTime(1000)
		expect(revoke).toHaveBeenCalledWith('blob:y')
	})

	it('returns false without a document', () => {
		expect(downloadTextFile('set.txt', 'x', 'text/plain')).toBe(false)
	})
})

describe('copyTextToClipboard', () => {
	afterEach(() => vi.unstubAllGlobals())

	it('reports success and refusal', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('navigator', { clipboard: { writeText } })
		expect(await copyTextToClipboard('x')).toBe(true)

		writeText.mockRejectedValueOnce(new Error('denied'))
		expect(await copyTextToClipboard('x')).toBe(false)

		vi.stubGlobal('navigator', {})
		expect(await copyTextToClipboard('x')).toBe(false)
	})
})
