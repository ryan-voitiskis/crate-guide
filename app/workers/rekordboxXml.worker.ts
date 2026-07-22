import type {
	RekordboxXmlSanitizedTrack,
	RekordboxXmlWorkerRequest,
	RekordboxXmlWorkerResponse
} from '~/types/rekordboxXmlWorker'
import {
	IncrementalRekordboxXmlParser,
	REKORDBOX_XML_PARSER_LIMITS,
	REKORDBOX_XML_PARSER_POLICY_VERSION,
	RekordboxXmlParserError
} from './rekordboxXmlParserCore'

type ActiveSession = {
	operationId: string
	totalBytes: number
	bytesRead: number
	decoder: TextDecoder
	parser: IncrementalRekordboxXmlParser
	phase: 'receiving' | 'completing'
	cancelled: boolean
	cancelNotified: boolean
}

let activeSession: ActiveSession | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWorkerRequest(value: unknown): value is RekordboxXmlWorkerRequest {
	if (
		!isRecord(value) ||
		typeof value.operationId !== 'string' ||
		value.operationId.length === 0 ||
		value.operationId.length > 128
	) {
		return false
	}
	if (value.type === 'start') {
		return (
			typeof value.totalBytes === 'number' &&
			typeof value.parserPolicyVersion === 'string'
		)
	}
	if (value.type === 'chunk') return value.bytes instanceof ArrayBuffer
	return value.type === 'end' || value.type === 'cancel'
}

function post(response: RekordboxXmlWorkerResponse): void {
	self.postMessage(response)
}

function postCancelled(session: ActiveSession): void {
	if (session.cancelNotified) return
	session.cancelNotified = true
	post({ type: 'cancelled', operationId: session.operationId })
}

function clearSession(session: ActiveSession): void {
	if (activeSession === session) activeSession = null
}

function failSession(session: ActiveSession, error: unknown): void {
	clearSession(session)
	if (session.cancelled) {
		postCancelled(session)
		return
	}
	if (error instanceof RekordboxXmlParserError) {
		post({
			type: 'error',
			operationId: session.operationId,
			code: error.code,
			message: error.message,
			retryable: false
		})
		return
	}
	if (error instanceof TypeError) {
		post({
			type: 'error',
			operationId: session.operationId,
			code: 'invalid_encoding',
			message: 'Only valid UTF-8 Rekordbox XML exports are supported.',
			retryable: false
		})
		return
	}
	post({
		type: 'error',
		operationId: session.operationId,
		code: 'worker_failed',
		message: 'The Rekordbox parser stopped unexpectedly.',
		retryable: true
	})
}

function yieldToWorkerQueue(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

function startSession(
	request: Extract<RekordboxXmlWorkerRequest, { type: 'start' }>
) {
	if (activeSession) {
		activeSession.cancelled = true
		postCancelled(activeSession)
	}
	if (request.parserPolicyVersion !== REKORDBOX_XML_PARSER_POLICY_VERSION) {
		post({
			type: 'error',
			operationId: request.operationId,
			code: 'parser_policy_mismatch',
			message: 'The Rekordbox parser version changed. Retry the import.',
			retryable: true
		})
		activeSession = null
		return
	}
	if (
		!Number.isSafeInteger(request.totalBytes) ||
		request.totalBytes < 0 ||
		request.totalBytes > REKORDBOX_XML_PARSER_LIMITS.maxFileBytes
	) {
		post({
			type: 'error',
			operationId: request.operationId,
			code: 'file_too_large',
			message: `Rekordbox XML must be ${Math.floor(REKORDBOX_XML_PARSER_LIMITS.maxFileBytes / 1024 / 1024)} MiB or smaller.`,
			retryable: false
		})
		activeSession = null
		return
	}

	activeSession = {
		operationId: request.operationId,
		totalBytes: request.totalBytes,
		bytesRead: 0,
		decoder: new TextDecoder('utf-8', { fatal: true }),
		parser: new IncrementalRekordboxXmlParser(),
		phase: 'receiving',
		cancelled: false,
		cancelNotified: false
	}
}

function processChunk(
	session: ActiveSession,
	request: Extract<RekordboxXmlWorkerRequest, { type: 'chunk' }>
): void {
	if (!(request.bytes instanceof ArrayBuffer)) {
		throw new Error('Invalid Worker chunk.')
	}
	if (
		session.bytesRead + request.bytes.byteLength > session.totalBytes ||
		session.bytesRead + request.bytes.byteLength >
			REKORDBOX_XML_PARSER_LIMITS.maxFileBytes
	) {
		throw new RekordboxXmlParserError(
			'resource_limit_exceeded',
			'Rekordbox XML exceeded its declared byte limit.'
		)
	}
	const decoded = session.decoder.decode(new Uint8Array(request.bytes), {
		stream: true
	})
	session.parser.write(decoded)
	session.bytesRead += request.bytes.byteLength
	post({
		type: 'progress',
		operationId: session.operationId,
		bytesRead: session.bytesRead,
		totalBytes: session.totalBytes,
		parsedTracks: session.parser.parsedTracks,
		entriesDeclared: session.parser.declaredEntries
	})
}

async function completeSession(session: ActiveSession): Promise<void> {
	if (session.bytesRead !== session.totalBytes) {
		throw new Error('File stream ended before its declared byte length.')
	}
	const finalText = session.decoder.decode()
	if (finalText) session.parser.write(finalText)
	const snapshot = session.parser.finish()
	post({
		type: 'progress',
		operationId: session.operationId,
		bytesRead: session.bytesRead,
		totalBytes: session.totalBytes,
		parsedTracks: snapshot.tracks.length,
		entriesDeclared: snapshot.entriesDeclared
	})

	for (
		let offset = 0;
		offset < snapshot.warnings.length;
		offset += REKORDBOX_XML_PARSER_LIMITS.warningBatchSize
	) {
		if (session.cancelled || activeSession !== session) {
			postCancelled(session)
			return
		}
		const warnings = snapshot.warnings.slice(
			offset,
			offset + REKORDBOX_XML_PARSER_LIMITS.warningBatchSize
		)
		post({
			type: 'warnings',
			operationId: session.operationId,
			warnings,
			truncated: warnings.some((warning) =>
				warning.startsWith('Additional track warnings were omitted')
			)
		})
		await yieldToWorkerQueue()
	}

	const trackCount = snapshot.tracks.length
	for (
		let startIndex = 0;
		startIndex < trackCount;
		startIndex += REKORDBOX_XML_PARSER_LIMITS.resultBatchTracks
	) {
		if (session.cancelled || activeSession !== session) {
			postCancelled(session)
			return
		}
		const endIndex = Math.min(
			trackCount,
			startIndex + REKORDBOX_XML_PARSER_LIMITS.resultBatchTracks
		)
		const tracks = snapshot.tracks.slice(startIndex, endIndex)
		post({
			type: 'tracks',
			operationId: session.operationId,
			startIndex,
			tracks
		})
		const releasable = snapshot.tracks as Array<
			RekordboxXmlSanitizedTrack | undefined
		>
		for (let index = startIndex; index < endIndex; index += 1) {
			releasable[index] = undefined
		}
		await yieldToWorkerQueue()
	}

	if (session.cancelled || activeSession !== session) {
		postCancelled(session)
		return
	}
	clearSession(session)
	post({
		type: 'complete',
		operationId: session.operationId,
		trackCount,
		entriesDeclared: snapshot.entriesDeclared,
		parserPolicyVersion: snapshot.parserPolicyVersion,
		sanitizedSnapshotVersion: snapshot.sanitizedSnapshotVersion
	})
}

async function handleRequest(
	request: RekordboxXmlWorkerRequest
): Promise<void> {
	if (request.type === 'start') {
		startSession(request)
		return
	}
	const session = activeSession
	if (!session || session.operationId !== request.operationId) return
	if (request.type === 'cancel') {
		session.cancelled = true
		clearSession(session)
		postCancelled(session)
		return
	}
	if (session.cancelled || session.phase !== 'receiving') return

	try {
		if (request.type === 'chunk') {
			processChunk(session, request)
			return
		}
		session.phase = 'completing'
		await completeSession(session)
	} catch (error) {
		failSession(session, error)
	}
}

self.onmessage = (event: MessageEvent<unknown>) => {
	if (isWorkerRequest(event.data)) void handleRequest(event.data)
}
