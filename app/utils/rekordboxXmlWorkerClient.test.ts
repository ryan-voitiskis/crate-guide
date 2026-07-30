import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
	RekordboxXmlSanitizedTrack,
	RekordboxXmlWorkerRequest,
	RekordboxXmlWorkerResponse
} from '~/types/rekordboxXmlWorker'
import parserConfig from '../../shared/config/rekordboxXmlParser.json'
import {
	RekordboxXmlWorkerCancelledError,
	RekordboxXmlWorkerParseError,
	startRekordboxXmlWorkerParse
} from './rekordboxXmlWorkerClient'

type PostedRequest = {
	request: RekordboxXmlWorkerRequest
	transfer: Transferable[]
}

class FakeWorker {
	onerror: ((this: Worker, event: ErrorEvent) => unknown) | null = null
	onmessage:
		| ((
				this: Worker,
				event: MessageEvent<RekordboxXmlWorkerResponse>
		  ) => unknown)
		| null = null
	readonly requests: PostedRequest[] = []
	terminated = false

	constructor(
		private readonly onPost?: (
			request: RekordboxXmlWorkerRequest,
			worker: FakeWorker
		) => void
	) {}

	postMessage(
		request: RekordboxXmlWorkerRequest,
		transfer: Transferable[] = []
	) {
		this.requests.push({ request, transfer })
		this.onPost?.(request, this)
	}

	emit(response: RekordboxXmlWorkerResponse) {
		this.onmessage?.call(
			this as unknown as Worker,
			{
				data: response
			} as MessageEvent<RekordboxXmlWorkerResponse>
		)
	}

	fail() {
		this.onerror?.call(this as unknown as Worker, new ErrorEvent('error'))
	}

	terminate() {
		this.terminated = true
	}
}

function createTrack(index = 0): RekordboxXmlSanitizedTrack {
	return {
		sourceType: 'rekordboxXml',
		index,
		trackId: `track-${index}`,
		name: `Track ${index}`,
		artist: 'Artist',
		album: 'Album',
		genre: null,
		kind: 'WAV File',
		totalTimeSeconds: 180,
		year: 2026,
		averageBpm: 128,
		dateAdded: null,
		bitRate: 1411,
		sampleRate: 44100,
		comments: null,
		playCount: 0,
		rating: 0,
		location: null,
		locationHint: `Album/Track ${index}.wav`,
		remixer: null,
		tonality: '8A',
		parsedKey: 9,
		parsedMode: 0,
		label: null,
		warnings: []
	}
}

function operationId(request: RekordboxXmlWorkerRequest): string {
	return request.operationId
}

afterEach(() => {
	vi.useRealTimers()
})

describe('startRekordboxXmlWorkerParse', () => {
	it('streams bounded chunks with backpressure and assembles sanitized batches', async () => {
		const size = parserConfig.limits.chunkBytes + 3
		const progress: number[] = []
		let bytesRead = 0
		const worker = new FakeWorker((request, currentWorker) => {
			if (request.type === 'chunk') {
				bytesRead += request.bytes.byteLength
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead,
					totalBytes: size,
					parsedTracks: bytesRead === size ? 1 : 0,
					entriesDeclared: bytesRead === size ? 1 : null
				})
			}
			if (request.type === 'end') {
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead: size,
					totalBytes: size,
					parsedTracks: 1,
					entriesDeclared: 1
				})
				currentWorker.emit({
					type: 'warnings',
					operationId: operationId(request),
					warnings: ['One bounded warning'],
					truncated: false
				})
				currentWorker.emit({
					type: 'tracks',
					operationId: operationId(request),
					startIndex: 0,
					tracks: [createTrack()]
				})
				currentWorker.emit({
					type: 'complete',
					operationId: operationId(request),
					trackCount: 1,
					entriesDeclared: 1,
					parserPolicyVersion: parserConfig.parserPolicyVersion,
					sanitizedSnapshotVersion: parserConfig.sanitizedSnapshotVersion
				})
			}
		})
		const file = new File([new Uint8Array(size)], 'collection.xml')

		const handle = startRekordboxXmlWorkerParse(file, {
			createOperationId: () => 'operation-1',
			createWorker: () => worker as unknown as Worker,
			onProgress: (nextProgress) => progress.push(nextProgress.bytesRead)
		})
		const snapshot = await handle.promise

		expect(handle.operationId).toBe('operation-1')
		expect(progress).toEqual([parserConfig.limits.chunkBytes, size, size])
		expect(worker.requests.map(({ request }) => request.type)).toEqual([
			'start',
			'chunk',
			'chunk',
			'end'
		])
		for (const posted of worker.requests.filter(
			(entry) => entry.request.type === 'chunk'
		)) {
			expect(posted.transfer).toEqual([
				(
					posted.request as Extract<
						RekordboxXmlWorkerRequest,
						{ type: 'chunk' }
					>
				).bytes
			])
		}
		expect(snapshot).toEqual({
			parserPolicyVersion: parserConfig.parserPolicyVersion,
			sanitizedSnapshotVersion: parserConfig.sanitizedSnapshotVersion,
			tracks: [createTrack()],
			entriesDeclared: 1,
			warnings: ['One bounded warning'],
			errors: []
		})
		expect(worker.terminated).toBe(true)
	})

	it('ignores messages for stale operation IDs', async () => {
		const worker = new FakeWorker((request, currentWorker) => {
			if (request.type === 'chunk') {
				currentWorker.emit({
					type: 'error',
					operationId: 'stale-operation',
					code: 'worker_failed',
					message: 'This stale error must be ignored.',
					retryable: true
				})
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead: 1,
					totalBytes: 1,
					parsedTracks: 0,
					entriesDeclared: 0
				})
			}
			if (request.type === 'end') {
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead: 1,
					totalBytes: 1,
					parsedTracks: 0,
					entriesDeclared: 0
				})
				currentWorker.emit({
					type: 'complete',
					operationId: operationId(request),
					trackCount: 0,
					entriesDeclared: 0,
					parserPolicyVersion: parserConfig.parserPolicyVersion,
					sanitizedSnapshotVersion: parserConfig.sanitizedSnapshotVersion
				})
			}
		})
		const handle = startRekordboxXmlWorkerParse(
			new File(['x'], 'collection.xml'),
			{
				createOperationId: () => 'current-operation',
				createWorker: () => worker as unknown as Worker
			}
		)

		await expect(handle.promise).resolves.toMatchObject({ tracks: [] })
	})

	it.each([
		[
			'decreasing byte progress',
			{
				type: 'progress',
				operationId: 'operation',
				bytesRead: -1,
				totalBytes: 1,
				parsedTracks: 0,
				entriesDeclared: null
			}
		],
		[
			'unsafe locations',
			{
				type: 'tracks',
				operationId: 'operation',
				startIndex: 0,
				tracks: [{ ...createTrack(), location: '/Users/private/Music/a.wav' }]
			}
		],
		['unknown response types', { type: 'mystery', operationId: 'operation' }]
	])(
		'rejects invalid Worker responses: %s',
		async (_label, invalidResponse) => {
			const worker = new FakeWorker((request, currentWorker) => {
				if (request.type !== 'chunk') return
				currentWorker.emit(
					invalidResponse as unknown as RekordboxXmlWorkerResponse
				)
			})
			const handle = startRekordboxXmlWorkerParse(
				new File(['x'], 'collection.xml'),
				{
					createOperationId: () => 'operation',
					createWorker: () => worker as unknown as Worker
				}
			)

			await expect(handle.promise).rejects.toMatchObject({
				code: 'worker_failed',
				message: 'The Rekordbox parser returned an invalid response.'
			})
			expect(worker.terminated).toBe(true)
		}
	)

	it('rejects completion metadata inconsistent with progress', async () => {
		const worker = new FakeWorker((request, currentWorker) => {
			if (request.type === 'chunk') {
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead: 1,
					totalBytes: 1,
					parsedTracks: 0,
					entriesDeclared: 1
				})
			}
			if (request.type === 'end') {
				currentWorker.emit({
					type: 'progress',
					operationId: operationId(request),
					bytesRead: 1,
					totalBytes: 1,
					parsedTracks: 0,
					entriesDeclared: 1
				})
				currentWorker.emit({
					type: 'complete',
					operationId: operationId(request),
					trackCount: 0,
					entriesDeclared: 2,
					parserPolicyVersion: parserConfig.parserPolicyVersion,
					sanitizedSnapshotVersion: parserConfig.sanitizedSnapshotVersion
				})
			}
		})
		const handle = startRekordboxXmlWorkerParse(
			new File(['x'], 'collection.xml'),
			{ createWorker: () => worker as unknown as Worker }
		)

		await expect(handle.promise).rejects.toMatchObject({
			code: 'worker_failed'
		})
	})

	it('settles cancellation by the hard deadline when the Worker does not reply', async () => {
		vi.useFakeTimers()
		const worker = new FakeWorker()
		const pendingRead = new Promise<ArrayBuffer>(() => undefined)
		const file = {
			name: 'collection.xml',
			size: 1,
			slice: () => ({ arrayBuffer: () => pendingRead })
		} as unknown as File
		const handle = startRekordboxXmlWorkerParse(file, {
			createWorker: () => worker as unknown as Worker
		})
		const cancellation = expect(handle.promise).rejects.toBeInstanceOf(
			RekordboxXmlWorkerCancelledError
		)

		handle.cancel()
		await vi.runAllTimersAsync()

		await cancellation
		expect(
			worker.requests.some(({ request }) => request.type === 'cancel')
		).toBe(true)
		expect(worker.terminated).toBe(true)
	})

	it('preserves fixed error codes and redacted messages from the Worker', async () => {
		const worker = new FakeWorker((request, currentWorker) => {
			if (request.type !== 'chunk') return
			currentWorker.emit({
				type: 'error',
				operationId: operationId(request),
				code: 'doctype_forbidden',
				message: 'DOCTYPE and XML entities are not supported.',
				retryable: false
			})
		})
		const handle = startRekordboxXmlWorkerParse(
			new File(['x'], 'private-name.xml'),
			{ createWorker: () => worker as unknown as Worker }
		)

		await expect(handle.promise).rejects.toEqual(
			expect.objectContaining({
				name: 'RekordboxXmlWorkerParseError',
				code: 'doctype_forbidden',
				message: 'DOCTYPE and XML entities are not supported.',
				retryable: false
			})
		)
	})

	it('rejects oversized files before constructing a Worker', async () => {
		const createWorker = vi.fn()
		const file = {
			name: 'oversized.xml',
			size: parserConfig.limits.maxFileBytes + 1
		} as File
		const handle = startRekordboxXmlWorkerParse(file, { createWorker })

		await expect(handle.promise).rejects.toBeInstanceOf(
			RekordboxXmlWorkerParseError
		)
		await expect(handle.promise).rejects.toMatchObject({
			code: 'file_too_large'
		})
		expect(createWorker).not.toHaveBeenCalled()
	})
})
