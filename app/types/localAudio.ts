export type LocalAudioValueSource = 'embeddedTags' | 'essentiaBrowser' | null

export type LocalAudioTagMetadata = {
	title: string | null
	artist: string | null
	album: string | null
	genres: string[]
	durationSeconds: number | null
	bpm: number | null
	key: string | null
}

export type LocalAudioAnalysis = {
	analyzerVersion: string
	configurationVersion: string
	bpm: number | null
	bpmConfidence: number | null
	bpmEstimates: number[]
	key: string | null
	scale: string | null
	keyStrength: number | null
	sampleRate: number
	durationSeconds: number
	analyzedDurationSeconds: number
	analysisOffsetSeconds: number
	warnings: string[]
}

export type LocalAudioTrackSource = {
	sourceType: 'localAudio'
	index: number
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	locationHint: string | null
	totalTimeSeconds: number | null
	averageBpm: number | null
	tonality: string | null
	parsedKey: number | null
	parsedMode: number | null
	warnings: string[]
	fileName: string
	fileSize: number
	lastModified: number
	tags: LocalAudioTagMetadata
	analysis: LocalAudioAnalysis | null
	bpmSource: LocalAudioValueSource
	keyModeSource: LocalAudioValueSource
	requiresManualReview: boolean
}

export type LocalAudioReviewSelection = {
	sources: LocalAudioTrackSource[]
	totalFiles: number
	processedFiles: number
}

export type LocalAudioFileStatus =
	| 'queued'
	| 'reading-tags'
	| 'decoding'
	| 'analyzing'
	| 'cached'
	| 'complete'
	| 'error'

export type LocalAudioFileEntry = {
	id: string
	file: File
	relativePath: string
	status: LocalAudioFileStatus
	fromCache: boolean
	source: LocalAudioTrackSource | null
	error: string | null
}

export type LocalAudioWorkerRequest = {
	id: string
	samples: ArrayBuffer
	durationSeconds: number
	analyzedDurationSeconds: number
	analysisOffsetSeconds: number
}

export type LocalAudioWorkerResponse =
	| { id: string; result: LocalAudioAnalysis }
	| { id: string; error: string }
