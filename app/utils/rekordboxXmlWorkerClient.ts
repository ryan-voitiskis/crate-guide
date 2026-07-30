import type {
	RekordboxXmlSanitizedSnapshot,
	RekordboxXmlSanitizedTrack,
	RekordboxXmlWorkerErrorCode,
	RekordboxXmlWorkerRequest,
	RekordboxXmlWorkerResponse
} from '~/types/rekordboxXmlWorker'
import parserConfig from '../../shared/config/rekordboxXmlParser.json'

type ResponseErrorCode = Exclude<RekordboxXmlWorkerErrorCode, 'cancelled'>

const SANITIZED_TRACK_KEYS = new Set([
	'sourceType',
	'index',
	'trackId',
	'name',
	'artist',
	'album',
	'genre',
	'kind',
	'totalTimeSeconds',
	'year',
	'averageBpm',
	'dateAdded',
	'bitRate',
	'sampleRate',
	'comments',
	'playCount',
	'rating',
	'location',
	'locationHint',
	'remixer',
	'tonality',
	'parsedKey',
	'parsedMode',
	'label',
	'warnings'
])
const textEncoder = new TextEncoder()

const CLIENT_ERROR_POLICY = {
	declared_count_exceeded: {
		message: 'The declared track count exceeds the supported limit.',
		retryable: false
	},
	doctype_forbidden: {
		message: 'DOCTYPE and XML entities are not supported.',
		retryable: false
	},
	file_too_large: {
		message: `Rekordbox XML must be ${Math.floor(parserConfig.limits.maxFileBytes / 1024 / 1024)} MiB or smaller.`,
		retryable: false
	},
	invalid_encoding: {
		message: 'Only valid UTF-8 Rekordbox XML exports are supported.',
		retryable: false
	},
	malformed_xml: {
		message: 'Unable to parse Rekordbox XML.',
		retryable: false
	},
	missing_collection: {
		message: 'Missing COLLECTION element.',
		retryable: false
	},
	parser_policy_mismatch: {
		message: 'The Rekordbox parser version changed. Retry the import.',
		retryable: true
	},
	resource_limit_exceeded: {
		message: 'The Rekordbox XML exceeds a supported parser limit.',
		retryable: false
	},
	track_limit_exceeded: {
		message: 'The Rekordbox XML contains too many tracks.',
		retryable: false
	},
	worker_failed: {
		message: 'The Rekordbox parser stopped unexpectedly.',
		retryable: true
	}
} satisfies Record<ResponseErrorCode, { message: string; retryable: boolean }>

export type RekordboxXmlWorkerProgress = {
	bytesRead: number
	totalBytes: number
	parsedTracks: number
	entriesDeclared: number | null
}

type WorkerPort = Pick<
	Worker,
	'onerror' | 'onmessage' | 'postMessage' | 'terminate'
>

export type RekordboxXmlWorkerParseOptions = {
	onProgress?: (progress: RekordboxXmlWorkerProgress) => void
	createWorker?: () => WorkerPort
	createOperationId?: () => string
}

export type RekordboxXmlWorkerParseHandle = {
	operationId: string
	promise: Promise<RekordboxXmlSanitizedSnapshot>
	cancel: () => void
}

export class RekordboxXmlWorkerParseError extends Error {
	readonly code: RekordboxXmlWorkerErrorCode
	readonly retryable: boolean

	constructor(
		code: RekordboxXmlWorkerErrorCode,
		message: string,
		retryable = false
	) {
		super(message)
		this.name = 'RekordboxXmlWorkerParseError'
		this.code = code
		this.retryable = retryable
	}
}

export class RekordboxXmlWorkerCancelledError extends RekordboxXmlWorkerParseError {
	constructor() {
		super('cancelled', 'Rekordbox XML parsing was cancelled.', true)
		this.name = 'RekordboxXmlWorkerCancelledError'
	}
}

function defaultWorkerFactory(): WorkerPort {
	return new Worker(
		new URL('../workers/rekordboxXml.worker.ts', import.meta.url),
		{ type: 'module' }
	)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedNullableString(value: unknown, maxBytes: number): boolean {
	return (
		value === null ||
		(typeof value === 'string' &&
			textEncoder.encode(value).byteLength <= maxBytes)
	)
}

function isNullableFiniteNumber(value: unknown): boolean {
	return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isResponseErrorCode(value: unknown): value is ResponseErrorCode {
	return typeof value === 'string' && Object.hasOwn(CLIENT_ERROR_POLICY, value)
}

function isSanitizedTrack(
	value: unknown,
	expectedIndex: number
): value is RekordboxXmlSanitizedTrack {
	return (
		isRecord(value) &&
		Object.keys(value).length === SANITIZED_TRACK_KEYS.size &&
		Object.keys(value).every((key) => SANITIZED_TRACK_KEYS.has(key)) &&
		value.sourceType === 'rekordboxXml' &&
		value.index === expectedIndex &&
		Number.isSafeInteger(value.index) &&
		[
			value.trackId,
			value.name,
			value.artist,
			value.album,
			value.genre,
			value.kind,
			value.dateAdded,
			value.comments,
			value.remixer,
			value.tonality,
			value.label
		].every((field) =>
			isBoundedNullableString(field, parserConfig.limits.maxAttributeBytes)
		) &&
		[
			value.totalTimeSeconds,
			value.year,
			value.averageBpm,
			value.bitRate,
			value.sampleRate,
			value.playCount,
			value.rating,
			value.parsedKey,
			value.parsedMode
		].every(isNullableFiniteNumber) &&
		value.location === null &&
		isBoundedNullableString(
			value.locationHint,
			parserConfig.limits.maxLocationHintBytes
		) &&
		Array.isArray(value.warnings) &&
		value.warnings.every(
			(warning) =>
				typeof warning === 'string' &&
				textEncoder.encode(warning).byteLength <=
					parserConfig.limits.maxWarningBytes
		)
	)
}

function post(
	worker: WorkerPort,
	request: RekordboxXmlWorkerRequest,
	transfer: Transferable[] = []
): void {
	worker.postMessage(request, transfer)
}

export function startRekordboxXmlWorkerParse(
	file: File,
	options: RekordboxXmlWorkerParseOptions = {}
): RekordboxXmlWorkerParseHandle {
	const operationId =
		options.createOperationId?.() ?? globalThis.crypto.randomUUID()
	let worker: WorkerPort | null = null
	let settled = false
	let cancelled = false
	let cancellationTimer: ReturnType<typeof setTimeout> | null = null
	let resolvePromise!: (snapshot: RekordboxXmlSanitizedSnapshot) => void
	let rejectPromise!: (error: RekordboxXmlWorkerParseError) => void
	let resolveChunk: (() => void) | null = null
	let rejectChunk: ((error: RekordboxXmlWorkerParseError) => void) | null = null
	const tracks: RekordboxXmlSanitizedTrack[] = []
	const warnings: string[] = []
	let acceptedWarningCount = 0
	let lastBytesRead = 0
	let lastParsedTracks = 0
	let lastEntriesDeclared: number | null = null
	let expectedChunkEnd: number | null = null
	let endPosted = false
	let sawFinalProgress = false

	const promise = new Promise<RekordboxXmlSanitizedSnapshot>(
		(resolve, reject) => {
			resolvePromise = resolve
			rejectPromise = reject
		}
	)

	const cleanup = () => {
		if (cancellationTimer) clearTimeout(cancellationTimer)
		cancellationTimer = null
		worker?.terminate()
		worker = null
		resolveChunk = null
		rejectChunk = null
		expectedChunkEnd = null
	}

	const reject = (error: RekordboxXmlWorkerParseError) => {
		if (settled) return
		settled = true
		rejectChunk?.(error)
		cleanup()
		rejectPromise(error)
	}

	const resolve = (snapshot: RekordboxXmlSanitizedSnapshot) => {
		if (settled) return
		settled = true
		cleanup()
		resolvePromise(snapshot)
	}

	const failInvalidResponse = () => {
		reject(
			new RekordboxXmlWorkerParseError(
				'worker_failed',
				'The Rekordbox parser returned an invalid response.',
				true
			)
		)
	}

	const onResponse = (response: RekordboxXmlWorkerResponse) => {
		if (
			settled ||
			!isRecord(response) ||
			response.operationId !== operationId
		) {
			return
		}
		if (response.type === 'progress') {
			if (
				!Number.isSafeInteger(response.bytesRead) ||
				!Number.isSafeInteger(response.totalBytes) ||
				!Number.isSafeInteger(response.parsedTracks) ||
				(response.entriesDeclared !== null &&
					(!Number.isSafeInteger(response.entriesDeclared) ||
						response.entriesDeclared < 0 ||
						response.entriesDeclared > parserConfig.limits.maxTracks)) ||
				(lastEntriesDeclared !== null &&
					response.entriesDeclared !== lastEntriesDeclared) ||
				response.bytesRead < lastBytesRead ||
				response.bytesRead > file.size ||
				response.totalBytes !== file.size ||
				response.parsedTracks < lastParsedTracks ||
				response.parsedTracks > parserConfig.limits.maxTracks ||
				(expectedChunkEnd !== null
					? response.bytesRead !== expectedChunkEnd
					: !endPosted || response.bytesRead !== file.size)
			) {
				failInvalidResponse()
				return
			}
			lastBytesRead = response.bytesRead
			lastParsedTracks = response.parsedTracks
			lastEntriesDeclared = response.entriesDeclared
			if (expectedChunkEnd === null) sawFinalProgress = true
			options.onProgress?.({
				bytesRead: response.bytesRead,
				totalBytes: response.totalBytes,
				parsedTracks: response.parsedTracks,
				entriesDeclared: response.entriesDeclared
			})
			const acknowledgeChunk = resolveChunk
			resolveChunk = null
			rejectChunk = null
			expectedChunkEnd = null
			acknowledgeChunk?.()
			return
		}
		if (response.type === 'warnings') {
			if (
				!sawFinalProgress ||
				!Array.isArray(response.warnings) ||
				typeof response.truncated !== 'boolean' ||
				response.warnings.length > parserConfig.limits.warningBatchSize ||
				acceptedWarningCount + response.warnings.length >
					parserConfig.limits.maxWarnings ||
				response.warnings.some(
					(warning) =>
						typeof warning !== 'string' ||
						new TextEncoder().encode(warning).byteLength >
							parserConfig.limits.maxWarningBytes
				)
			) {
				failInvalidResponse()
				return
			}
			warnings.push(...response.warnings)
			acceptedWarningCount += response.warnings.length
			return
		}
		if (response.type === 'tracks') {
			const batchWarnings = Array.isArray(response.tracks)
				? response.tracks.reduce(
						(total, track) =>
							total +
							(isRecord(track) && Array.isArray(track.warnings)
								? track.warnings.length
								: 0),
						0
					)
				: 0
			if (
				!sawFinalProgress ||
				!Array.isArray(response.tracks) ||
				response.startIndex !== tracks.length ||
				response.tracks.length === 0 ||
				response.tracks.length > parserConfig.limits.resultBatchTracks ||
				acceptedWarningCount + batchWarnings >
					parserConfig.limits.maxWarnings ||
				!response.tracks.every((track, index) =>
					isSanitizedTrack(track, response.startIndex + index)
				)
			) {
				failInvalidResponse()
				return
			}
			tracks.push(...response.tracks)
			acceptedWarningCount += batchWarnings
			return
		}
		if (response.type === 'complete') {
			if (
				!sawFinalProgress ||
				lastBytesRead !== file.size ||
				response.trackCount !== tracks.length ||
				response.trackCount !== lastParsedTracks ||
				response.entriesDeclared !== lastEntriesDeclared ||
				response.parserPolicyVersion !== parserConfig.parserPolicyVersion ||
				response.sanitizedSnapshotVersion !==
					parserConfig.sanitizedSnapshotVersion
			) {
				failInvalidResponse()
				return
			}
			resolve({
				parserPolicyVersion: response.parserPolicyVersion,
				sanitizedSnapshotVersion: response.sanitizedSnapshotVersion,
				tracks,
				entriesDeclared: response.entriesDeclared,
				warnings,
				errors: []
			})
			return
		}
		if (response.type === 'cancelled') {
			reject(new RekordboxXmlWorkerCancelledError())
			return
		}
		if (
			response.type !== 'error' ||
			!isResponseErrorCode(response.code) ||
			typeof response.message !== 'string' ||
			typeof response.retryable !== 'boolean'
		) {
			failInvalidResponse()
			return
		}
		const policy = CLIENT_ERROR_POLICY[response.code]
		reject(
			new RekordboxXmlWorkerParseError(
				response.code,
				policy.message,
				policy.retryable
			)
		)
	}

	const awaitChunkProgress = (chunkEnd: number) =>
		new Promise<void>((resolveAck, rejectAck) => {
			expectedChunkEnd = chunkEnd
			resolveChunk = resolveAck
			rejectChunk = rejectAck
		})

	const pump = async () => {
		if (file.size > parserConfig.limits.maxFileBytes) {
			reject(
				new RekordboxXmlWorkerParseError(
					'file_too_large',
					`Rekordbox XML must be ${Math.floor(parserConfig.limits.maxFileBytes / 1024 / 1024)} MiB or smaller.`
				)
			)
			return
		}
		try {
			worker = (options.createWorker ?? defaultWorkerFactory)()
			worker.onmessage = (event: MessageEvent<RekordboxXmlWorkerResponse>) => {
				onResponse(event.data)
			}
			worker.onerror = () => {
				reject(
					new RekordboxXmlWorkerParseError(
						'worker_failed',
						'The Rekordbox parser stopped unexpectedly.',
						true
					)
				)
			}
			post(worker, {
				type: 'start',
				operationId,
				totalBytes: file.size,
				parserPolicyVersion: parserConfig.parserPolicyVersion
			})

			for (
				let offset = 0;
				offset < file.size;
				offset += parserConfig.limits.chunkBytes
			) {
				if (cancelled || settled || !worker) return
				const bytes = await file
					.slice(offset, offset + parserConfig.limits.chunkBytes)
					.arrayBuffer()
				if (cancelled || settled || !worker) return
				const progress = awaitChunkProgress(offset + bytes.byteLength)
				post(worker, { type: 'chunk', operationId, bytes }, [bytes])
				await progress
			}
			if (!cancelled && !settled && worker) {
				endPosted = true
				post(worker, { type: 'end', operationId })
			}
		} catch (error) {
			if (error instanceof RekordboxXmlWorkerParseError) reject(error)
			else {
				reject(
					new RekordboxXmlWorkerParseError(
						'worker_failed',
						'The Rekordbox parser could not read this file.',
						true
					)
				)
			}
		}
	}

	const cancel = () => {
		if (settled || cancelled) return
		cancelled = true
		if (!worker) {
			reject(new RekordboxXmlWorkerCancelledError())
			return
		}
		try {
			post(worker, { type: 'cancel', operationId })
		} catch {
			reject(new RekordboxXmlWorkerCancelledError())
			return
		}
		cancellationTimer = setTimeout(
			() => {
				reject(new RekordboxXmlWorkerCancelledError())
			},
			Math.max(
				1,
				Math.floor(parserConfig.performanceBudgets.cancellationMs * 0.8)
			)
		)
	}

	void pump()
	return { operationId, promise, cancel }
}
