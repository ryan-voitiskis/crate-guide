import type {
	RekordboxXmlParseResult,
	RekordboxXmlTrack
} from '~/utils/rekordboxXml'

export type RekordboxXmlSanitizedTrack = Omit<RekordboxXmlTrack, 'location'> & {
	location: null
}

export type RekordboxXmlSanitizedSnapshot = Omit<
	RekordboxXmlParseResult,
	'tracks'
> & {
	parserPolicyVersion: string
	sanitizedSnapshotVersion: string
	tracks: RekordboxXmlSanitizedTrack[]
}

export type RekordboxXmlWorkerErrorCode =
	| 'cancelled'
	| 'declared_count_exceeded'
	| 'doctype_forbidden'
	| 'file_too_large'
	| 'invalid_encoding'
	| 'malformed_xml'
	| 'missing_collection'
	| 'parser_policy_mismatch'
	| 'resource_limit_exceeded'
	| 'track_limit_exceeded'
	| 'worker_failed'

export type RekordboxXmlWorkerRequest =
	| {
			type: 'start'
			operationId: string
			fileName: string
			totalBytes: number
			parserPolicyVersion: string
	  }
	| {
			type: 'chunk'
			operationId: string
			bytes: ArrayBuffer
	  }
	| { type: 'end'; operationId: string }
	| { type: 'cancel'; operationId: string }

export type RekordboxXmlWorkerResponse =
	| {
			type: 'progress'
			operationId: string
			bytesRead: number
			totalBytes: number
			parsedTracks: number
			entriesDeclared: number | null
	  }
	| {
			type: 'warnings'
			operationId: string
			warnings: string[]
			truncated: boolean
	  }
	| {
			type: 'complete'
			operationId: string
			snapshot: RekordboxXmlSanitizedSnapshot
	  }
	| {
			type: 'cancelled'
			operationId: string
	  }
	| {
			type: 'error'
			operationId: string
			code: Exclude<RekordboxXmlWorkerErrorCode, 'cancelled'>
			message: string
			retryable: boolean
	  }
