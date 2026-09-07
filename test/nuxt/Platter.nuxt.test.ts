import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Platter from '~/components/turntable/Platter.vue'
import type { SessionDeck } from '~/stores/sessionTypes'

mockNuxtImport('useWorkbenchRecordsStore', () => () => ({
	getRecordById: vi.fn()
}))
mockNuxtImport('useWorkbenchSessionStore', () => () => ({ pitchRange: 8 }))
mockNuxtImport('useRecordCover', () => () => ({ getCoverUrl: vi.fn() }))

function createDeck(isPlaying = false): SessionDeck {
	return {
		loadedTrack: null,
		rpm: 33,
		pitch: 0,
		faderPosition: 0,
		faderSliding: false,
		isPlaying
	}
}

describe('Platter animation lifecycle', () => {
	let wrapper: VueWrapper | undefined
	let container: HTMLDivElement
	let nextFrameId: number
	let frameTime: number
	const pendingFrames = new Map<number, FrameRequestCallback>()
	const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>()
	const cancelFrame = vi.fn<(id: number) => void>()
	const rowTransformsAtRequest: (string | null)[][] = []

	beforeEach(() => {
		container = document.createElement('div')
		document.body.append(container)
		nextFrameId = 0
		frameTime = 0
		pendingFrames.clear()
		rowTransformsAtRequest.length = 0
		requestFrame.mockImplementation((callback) => {
			rowTransformsAtRequest.push(
				Array.from(container.querySelectorAll('[data-strobe-row]'), (row) =>
					row.getAttribute('transform')
				)
			)
			const id = nextFrameId++
			pendingFrames.set(id, callback)
			return id
		})
		cancelFrame.mockImplementation((id) => {
			pendingFrames.delete(id)
		})
		vi.stubGlobal('requestAnimationFrame', requestFrame)
		vi.stubGlobal('cancelAnimationFrame', cancelFrame)
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = undefined
		container.remove()
		vi.unstubAllGlobals()
		vi.clearAllMocks()
	})

	async function mountPlatter(isPlaying = false) {
		wrapper = await mountSuspended(Platter, {
			props: { deckIndex: 0, deck: createDeck(isPlaying) },
			attachTo: container
		})
		return wrapper
	}

	function advanceFrame() {
		const frame = pendingFrames.entries().next().value
		if (!frame) throw new Error('No animation frame is pending')
		const [id, callback] = frame
		pendingFrames.delete(id)
		frameTime += 16
		callback(frameTime)
	}

	it('initializes every row before starting an already-playing deck', async () => {
		await mountPlatter(true)

		expect(requestFrame).toHaveBeenCalledTimes(1)
		expect(rowTransformsAtRequest[0]).toEqual(Array(4).fill('rotate(0)'))
		advanceFrame()
		expect(pendingFrames.size).toBe(1)
	})

	it('does not duplicate or lose a pending frame whose handle is zero', async () => {
		const platter = await mountPlatter()
		expect(requestFrame).not.toHaveBeenCalled()

		await platter.setProps({ deck: createDeck(true) })
		await platter.setProps({ deck: createDeck(false) })
		await platter.setProps({ deck: createDeck(true) })

		expect(requestFrame).toHaveBeenCalledTimes(1)
		expect(pendingFrames.has(0)).toBe(true)
		platter.unmount()
		wrapper = undefined
		expect(cancelFrame).toHaveBeenCalledWith(0)
		expect(pendingFrames.size).toBe(0)
	})

	it('coasts to a stop with physical and illuminated rows aligned', async () => {
		const platter = await mountPlatter(true)
		for (let frame = 0; frame < 150; frame++) advanceFrame()
		await platter.setProps({ deck: createDeck(false) })
		for (let frame = 0; frame < 500 && pendingFrames.size; frame++)
			advanceFrame()

		expect(pendingFrames.size).toBe(0)
		const physicalMirrors = platter.get('g[mask*="unlit-mirrors-mask"] > g')
		expect(physicalMirrors.attributes('style')).toContain('opacity: 1')
		for (const row of platter.findAll('[data-strobe-row]')) {
			expect(row.attributes('transform')).toBe(
				physicalMirrors.attributes('transform')
			)
		}
	})
})
