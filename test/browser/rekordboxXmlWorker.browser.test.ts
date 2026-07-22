import { describe, expect, it } from 'vitest'
import type {
	RekordboxXmlSanitizedSnapshot,
	RekordboxXmlWorkerRequest,
	RekordboxXmlWorkerResponse
} from '../../app/types/rekordboxXmlWorker'
import { parseRekordboxXml } from '../../app/utils/rekordboxXml'
import {
	RekordboxXmlWorkerCancelledError,
	startRekordboxXmlWorkerParse
} from '../../app/utils/rekordboxXmlWorkerClient'
import parserConfig from '../../shared/config/rekordboxXmlParser.json'
import { generateRekordboxXmlScaleFixture } from '../fixtures/rekordboxXmlScale'

const SCALE_COUNTS = [1_000, 10_000, 100_000] as const

type PerformanceWithMemory = Performance & {
	memory?: { usedJSHeapSize: number }
}

function nextAnimationFrame(): Promise<number> {
	return new Promise((resolve) => requestAnimationFrame(resolve))
}

function updateFnv1a(hash: number, value: string): number {
	let nextHash = hash
	for (let index = 0; index < value.length; index += 1) {
		nextHash ^= value.charCodeAt(index)
		nextHash = Math.imul(nextHash, 0x01000193)
	}
	return nextHash >>> 0
}

function outputChecksum(snapshot: RekordboxXmlSanitizedSnapshot): string {
	let hash = 0x811c9dc5
	hash = updateFnv1a(hash, JSON.stringify(snapshot.entriesDeclared))
	hash = updateFnv1a(hash, JSON.stringify(snapshot.warnings))
	hash = updateFnv1a(hash, JSON.stringify(snapshot.errors))
	for (const track of snapshot.tracks) {
		hash = updateFnv1a(hash, JSON.stringify(track))
	}
	return hash.toString(16).padStart(8, '0')
}

async function expectWorkerError(file: File, code: string) {
	const handle = startRekordboxXmlWorkerParse(file)
	await expect(handle.promise).rejects.toMatchObject({ code })
}

function parseWithBrowserDom(xml: string): Document {
	return new DOMParser().parseFromString(xml, 'application/xml')
}

describe('Rekordbox XML Worker', () => {
	it('equally normalizes the 1k corpus and meets checked-in scale budgets through 100k tracks', async () => {
		expect(PerformanceObserver.supportedEntryTypes).toContain('longtask')
		expect(navigator.userAgent).toContain('HeadlessChrome')

		for (const trackCount of SCALE_COUNTS) {
			let xml = generateRekordboxXmlScaleFixture(trackCount)
			const oracleXml = trackCount === 1_000 ? xml : null
			const file = new File([xml], `generated-${trackCount}.xml`, {
				type: 'application/xml'
			})
			xml = ''
			await nextAnimationFrame()
			await nextAnimationFrame()

			const progressTimes: number[] = []
			const longTaskDurations: number[] = []
			const observer = new PerformanceObserver((entries) => {
				for (const entry of entries.getEntries()) {
					longTaskDurations.push(entry.duration)
				}
			})
			observer.observe({ entryTypes: ['longtask'] })
			const heapBefore = (performance as PerformanceWithMemory).memory
				?.usedJSHeapSize
			const startedAt = performance.now()
			let snapshot: RekordboxXmlSanitizedSnapshot | null = null
			try {
				const handle = startRekordboxXmlWorkerParse(file, {
					onProgress: () => progressTimes.push(performance.now())
				})
				snapshot = await handle.promise
				await nextAnimationFrame()
				await nextAnimationFrame()
			} finally {
				for (const entry of observer.takeRecords()) {
					longTaskDurations.push(entry.duration)
				}
				observer.disconnect()
			}
			const completedAt = performance.now()
			if (!snapshot) throw new Error('Worker did not return a snapshot.')
			const heapAfter = (performance as PerformanceWithMemory).memory
				?.usedJSHeapSize
			const progressSilences = progressTimes.map((time, index) =>
				index === 0 ? time - startedAt : time - progressTimes[index - 1]!
			)
			const checksum = outputChecksum(snapshot)
			const resultKey = String(
				trackCount
			) as keyof typeof parserConfig.workerBaseline.results
			const result = {
				kind: 'rekordbox-xml-worker-performance',
				trackCount,
				inputBytes: file.size,
				parsedTracks: snapshot.tracks.length,
				firstProgressMs: progressTimes[0]! - startedAt,
				maxProgressSilenceMs: Math.max(...progressSilences),
				totalMs: completedAt - startedAt,
				maxMainThreadLongTaskMs: Math.max(0, ...longTaskDurations),
				observedMainThreadHeapGrowthBytes:
					heapBefore === undefined || heapAfter === undefined
						? null
						: Math.max(0, heapAfter - heapBefore),
				outputChecksum: checksum
			}
			console.info(JSON.stringify(result))

			expect(snapshot.tracks).toHaveLength(trackCount)
			expect(snapshot.entriesDeclared).toBe(trackCount)
			expect(snapshot.errors).toEqual([])
			expect(checksum).toBe(
				parserConfig.workerBaseline.results[resultKey].outputChecksum
			)
			expect(snapshot.tracks.every((track) => track.location === null)).toBe(
				true
			)
			expect(progressTimes.length).toBeGreaterThan(0)
			expect(result.firstProgressMs).toBeLessThanOrEqual(
				parserConfig.performanceBudgets.firstProgressMs
			)
			expect(result.maxProgressSilenceMs).toBeLessThanOrEqual(
				parserConfig.performanceBudgets.maxProgressSilenceMs
			)
			expect(result.totalMs).toBeLessThanOrEqual(
				parserConfig.performanceBudgets.totalMs[resultKey]
			)
			expect(result.maxMainThreadLongTaskMs).toBeLessThanOrEqual(
				parserConfig.performanceBudgets.maxMainThreadLongTaskMs
			)
			if (result.observedMainThreadHeapGrowthBytes !== null) {
				expect(result.observedMainThreadHeapGrowthBytes).toBeLessThanOrEqual(
					parserConfig.performanceBudgets.maxMainThreadHeapGrowthBytes
				)
			}

			if (oracleXml) {
				const oracle = parseRekordboxXml(oracleXml)
				expect(snapshot.tracks).toEqual(
					oracle.tracks.map((track) => ({ ...track, location: null }))
				)
				expect(snapshot.warnings).toEqual(oracle.warnings)
			}
			snapshot = null
		}
	}, 120_000)

	it('decodes a multibyte UTF-8 attribute split across file chunks', async () => {
		const prefix =
			'<?xml version="1.0" encoding="UTF-8"?><DJ_PLAYLISTS><COLLECTION Entries="1">'
		const trackPrefix = '<TRACK Name="Caf'
		const bytesBeforeCharacter = new TextEncoder().encode(
			`${prefix}${trackPrefix}`
		).byteLength
		const paddingLength =
			parserConfig.limits.chunkBytes - bytesBeforeCharacter - 1
		const xml = `${prefix}${'x'.repeat(paddingLength)}${trackPrefix}é"/></COLLECTION></DJ_PLAYLISTS>`
		const bytes = new TextEncoder().encode(xml)

		expect(bytes[parserConfig.limits.chunkBytes - 1]).toBe(0xc3)
		expect(bytes[parserConfig.limits.chunkBytes]).toBe(0xa9)
		const handle = startRekordboxXmlWorkerParse(
			new File([bytes], 'utf8-boundary.xml')
		)
		const snapshot = await handle.promise

		expect(snapshot.tracks[0]?.name).toBe('Café')
	})

	it('matches Chromium declaration and attribute-normalization rules', async () => {
		const invalidDeclarations = [
			'<?xml version="1.0"?><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
			' \n<?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
			'<!--before--><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
			'<?probe value="before"?><?xml version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
			'<?xml encoding="UTF-8" version="1.0"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>',
			'<?xml version="1.0" standalone="yes" encoding="UTF-8"?><DJ_PLAYLISTS><COLLECTION/></DJ_PLAYLISTS>'
		]
		for (const [index, xml] of invalidDeclarations.entries()) {
			const document = parseWithBrowserDom(xml)
			expect(document.querySelector('parsererror')).not.toBeNull()
			await expectWorkerError(
				new File([xml], `invalid-declaration-${index}.xml`),
				'malformed_xml'
			)
		}

		const valid = `<?probe arbitrary processing instruction data?>
<DJ_PLAYLISTS><COLLECTION Entries="1"><TRACK Name="one\ttwo
three\r\nfour&#xA;five"/></COLLECTION></DJ_PLAYLISTS>`
		const browserDocument = parseWithBrowserDom(valid)
		const browserName = browserDocument
			.querySelector('TRACK')
			?.getAttribute('Name')
		const snapshot = await startRekordboxXmlWorkerParse(
			new File([valid], 'valid-processing-instruction.xml')
		).promise
		expect(browserDocument.querySelector('parsererror')).toBeNull()
		expect(snapshot.tracks[0]?.name).toBe(browserName)
		expect(snapshot.tracks[0]?.name).toBe('one two three four\nfive')
	})

	it('rejects DTDs and invalid UTF-8 without disclosing file data', async () => {
		const doctype =
			'<!DOCTYPE DJ_PLAYLISTS [<!ENTITY external SYSTEM "file:///etc/passwd">]><DJ_PLAYLISTS><COLLECTION><TRACK Name="&external;"/></COLLECTION></DJ_PLAYLISTS>'
		const privateName = '/Users/private-user/Music/export.xml'
		const doctypeHandle = startRekordboxXmlWorkerParse(
			new File([doctype], privateName)
		)
		let doctypeError: unknown
		try {
			await doctypeHandle.promise
		} catch (error) {
			doctypeError = error
		}
		expect(doctypeError).toMatchObject({ code: 'doctype_forbidden' })
		expect((doctypeError as Error).message).not.toContain(privateName)
		expect((doctypeError as Error).message).not.toContain('/etc/passwd')

		const prefix = new TextEncoder().encode(
			'<DJ_PLAYLISTS><COLLECTION><TRACK Name="'
		)
		const suffix = new TextEncoder().encode('"/></COLLECTION></DJ_PLAYLISTS>')
		await expectWorkerError(
			new File([prefix, new Uint8Array([0xc3, 0x28]), suffix], 'invalid.xml'),
			'invalid_encoding'
		)
	})

	it('settles cancellation during reading, parsing, and result batching within budget', async () => {
		async function measureCancellation(
			file: File,
			cancelWhen: 'immediate' | 'first-progress' | 'final-batching'
		) {
			let fullProgressCount = 0
			let cancellationStartedAt: number | null = null
			const handle = startRekordboxXmlWorkerParse(file, {
				onProgress: (progress) => {
					if (
						cancelWhen === 'first-progress' &&
						cancellationStartedAt === null
					) {
						cancellationStartedAt = performance.now()
						handle.cancel()
					}
					if (
						cancelWhen === 'final-batching' &&
						progress.bytesRead === progress.totalBytes
					) {
						fullProgressCount += 1
						if (fullProgressCount === 2) {
							cancellationStartedAt = performance.now()
							handle.cancel()
						}
					}
				}
			})
			const cancellation = handle.promise.catch((error: unknown) => error)
			if (cancelWhen === 'immediate') {
				cancellationStartedAt = performance.now()
				handle.cancel()
			}
			const error = await cancellation
			if (cancellationStartedAt === null) {
				throw new Error('Cancellation trigger was not reached.')
			}
			return {
				elapsedMs: performance.now() - cancellationStartedAt,
				error
			}
		}

		const smallFile = new File(
			[generateRekordboxXmlScaleFixture(1_000)],
			'immediate.xml'
		)
		const largeXml = generateRekordboxXmlScaleFixture(10_000)
		const parsingFile = new File([largeXml], 'parsing.xml')
		const batchingFile = new File([largeXml], 'batching.xml')
		const cancellationResults = [
			{
				phase: 'immediate',
				...(await measureCancellation(smallFile, 'immediate'))
			},
			{
				phase: 'first-progress',
				...(await measureCancellation(parsingFile, 'first-progress'))
			},
			{
				phase: 'final-batching',
				...(await measureCancellation(batchingFile, 'final-batching'))
			}
		]
		console.info(
			JSON.stringify({
				kind: 'rekordbox-xml-worker-cancellation',
				results: cancellationResults.map(({ elapsedMs, phase }) => ({
					phase,
					elapsedMs
				}))
			})
		)
		for (const result of cancellationResults) {
			expect(result.error).toBeInstanceOf(RekordboxXmlWorkerCancelledError)
			expect(result.elapsedMs).toBeLessThanOrEqual(
				parserConfig.performanceBudgets.cancellationMs
			)
		}
	})

	it('emits exactly one terminal response when completion receives duplicate messages', async () => {
		const worker = new Worker(
			new URL('../../app/workers/rekordboxXml.worker.ts', import.meta.url),
			{ type: 'module' }
		)
		const operationId = crypto.randomUUID()
		const xml =
			'<DJ_PLAYLISTS><COLLECTION Entries="1"><TRACK Name="One"/></COLLECTION></DJ_PLAYLISTS>'
		const bytes = new TextEncoder().encode(xml).buffer
		const responses: RekordboxXmlWorkerResponse[] = []
		try {
			const terminal = new Promise<RekordboxXmlWorkerResponse>((resolve) => {
				worker.onmessage = (
					event: MessageEvent<RekordboxXmlWorkerResponse>
				) => {
					responses.push(event.data)
					if (['complete', 'cancelled', 'error'].includes(event.data.type)) {
						resolve(event.data)
					}
				}
			})
			const start: RekordboxXmlWorkerRequest = {
				type: 'start',
				operationId,
				totalBytes: bytes.byteLength,
				parserPolicyVersion: parserConfig.parserPolicyVersion
			}
			worker.postMessage(start)
			worker.postMessage({ type: 'chunk', operationId, bytes }, [bytes])
			worker.postMessage({ type: 'end', operationId })
			worker.postMessage({ type: 'end', operationId })
			worker.postMessage({
				type: 'chunk',
				operationId,
				bytes: new ArrayBuffer(0)
			})

			await expect(terminal).resolves.toMatchObject({ type: 'complete' })
			await new Promise((resolve) => setTimeout(resolve, 50))
			const terminalResponses = responses.filter((response) =>
				['complete', 'cancelled', 'error'].includes(response.type)
			)
			expect(terminalResponses).toHaveLength(1)
			expect(terminalResponses[0]?.operationId).toBe(operationId)
		} finally {
			worker.terminate()
		}
	})
})
