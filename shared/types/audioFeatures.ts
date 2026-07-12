export type AudioFeatureSourceKey = keyof TrackAudioFeatures['sources']

export type TrackAudioFeatures = {
	version: 1
	updatedAt: string
	applied: {
		bpm: { source: AudioFeatureSourceKey; appliedAt: string } | null
		keyMode: { source: AudioFeatureSourceKey; appliedAt: string } | null
	}
	match: {
		confidence: 'high' | 'medium' | 'manual'
		score: number
		reasons: string[]
		warnings: string[]
	}
	sources: {
		rekordboxXml?: RekordboxXmlSource
		embeddedTags?: EmbeddedTagsSource
		essentiaBrowser?: EssentiaBrowserSource
	}
}

export type RekordboxXmlSource = {
	importedAt: string
	fileName: string
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	locationHint: string | null
	averageBpm: number | null
	tonality: string | null
	parsedKey: number | null
	parsedMode: number | null
	totalTimeSeconds: number | null
	year: number | null
	kind: string | null
	sampleRate: number | null
	bitRate: number | null
	rating: number | null
	playCount: number | null
	comments: string | null
	remixer: string | null
	label: string | null
	dateAdded: string | null
}

export type EmbeddedTagsSource = {
	importedAt: string
	fileName: string
	locationHint: string | null
	fileSize: number
	lastModified: number
	title: string | null
	artist: string | null
	album: string | null
	genres: string[]
	durationSeconds: number | null
	bpm: number | null
	key: string | null
}

export type EssentiaBrowserSource = {
	importedAt: string
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
