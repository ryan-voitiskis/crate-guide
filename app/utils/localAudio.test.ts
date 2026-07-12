import { describe, expect, it } from 'vitest'
import type {
	LocalAudioAnalysis,
	LocalAudioTagMetadata
} from '~/types/localAudio'
import {
	LOCAL_AUDIO_ANALYZER_VERSION,
	LOCAL_AUDIO_CONFIGURATION_VERSION,
	LOCAL_AUDIO_KEY_EXTRACTOR_ARGS,
	LOCAL_AUDIO_MAX_ANALYSIS_SECONDS,
	LOCAL_AUDIO_METADATA_VERSION,
	LOCAL_AUDIO_MIN_BPM_CONFIDENCE,
	LOCAL_AUDIO_MIN_KEY_STRENGTH,
	LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS,
	LOCAL_AUDIO_SAMPLE_RATE,
	createLocalAudioTrackSource,
	findNativeAudioTag,
	getLocalAudioAnalysisWindow,
	getLocalAudioCacheKey,
	isSupportedAudioFile
} from './localAudio'

const blankTags: LocalAudioTagMetadata = {
	title: null,
	artist: null,
	album: null,
	genres: [],
	durationSeconds: 240,
	bpm: null,
	key: null
}

const analysis: LocalAudioAnalysis = {
	analyzerVersion: LOCAL_AUDIO_ANALYZER_VERSION,
	configurationVersion: 'center-180s-44k1-v1',
	bpm: 127.4,
	bpmConfidence: 2.5,
	bpmEstimates: [127.4, 127.2],
	key: 'C',
	scale: 'minor',
	keyStrength: 0.72,
	sampleRate: 44_100,
	durationSeconds: 240,
	analyzedDurationSeconds: 180,
	analysisOffsetSeconds: 30,
	warnings: []
}

describe('localAudio', () => {
	it('preserves the analyzer configuration values', () => {
		expect({
			analyzerVersion: LOCAL_AUDIO_ANALYZER_VERSION,
			configurationVersion: LOCAL_AUDIO_CONFIGURATION_VERSION,
			metadataVersion: LOCAL_AUDIO_METADATA_VERSION,
			sampleRate: LOCAL_AUDIO_SAMPLE_RATE,
			maxAnalysisSeconds: LOCAL_AUDIO_MAX_ANALYSIS_SECONDS,
			minBpmConfidence: LOCAL_AUDIO_MIN_BPM_CONFIDENCE,
			minKeyStrength: LOCAL_AUDIO_MIN_KEY_STRENGTH
		}).toEqual({
			analyzerVersion: 'essentia.js@0.1.3',
			configurationVersion: 'center-180s-44k1-v1',
			metadataVersion: 'native-tags-v2',
			sampleRate: 44_100,
			maxAnalysisSeconds: 180,
			minBpmConfidence: 1.5,
			minKeyStrength: 0.8
		})
	})

	it('preserves Essentia positional argument values and order', () => {
		expect(LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS).toEqual([208, 'multifeature', 40])
		expect(LOCAL_AUDIO_KEY_EXTRACTOR_ARGS).toEqual([
			true,
			4096,
			4096,
			12,
			3500,
			60,
			25,
			0.2,
			'edma',
			44_100,
			0.0001,
			440,
			'cosine',
			'hann'
		])
	})

	it('recognizes supported extensions case-insensitively', () => {
		expect(isSupportedAudioFile('Track.FLAC')).toBe(true)
		expect(isSupportedAudioFile('cover.jpg')).toBe(false)
	})

	it('versions cache keys by analyzer, configuration, and tag reader', () => {
		expect(
			getLocalAudioCacheKey({
				relativePath: 'Artist/Album/Track.flac',
				size: 123,
				lastModified: 456
			})
		).toBe(
			'essentia.js@0.1.3|center-180s-44k1-v1|native-tags-v2|Artist/Album/Track.flac|123|456'
		)
	})

	it('reads common BPM and key names from native audio tags', () => {
		const nativeTags = {
			vorbis: [
				{ id: 'INITIALKEY', value: '3A' },
				{ id: 'BPM', value: '127.45' }
			]
		}

		expect(findNativeAudioTag(nativeTags, ['INITIALKEY', 'KEY'])).toBe('3A')
		expect(findNativeAudioTag(nativeTags, ['BPM', 'TBPM'])).toBe('127.45')
	})

	it('bounds analysis to a centered three-minute window', () => {
		expect(getLocalAudioAnalysisWindow(470)).toEqual({
			analyzedDurationSeconds: 180,
			analysisOffsetSeconds: 145
		})
		expect(getLocalAudioAnalysisWindow(90)).toEqual({
			analyzedDurationSeconds: 90,
			analysisOffsetSeconds: 0
		})
		expect(getLocalAudioAnalysisWindow(-1)).toEqual({
			analyzedDurationSeconds: 0,
			analysisOffsetSeconds: 0
		})
	})

	it('prefers embedded BPM and key over analyzer output', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: '01 Artist - Track.flac',
			relativePath: 'Artist/Album/01 Artist - Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: { ...blankTags, bpm: 128, key: '8A' },
			analysis
		})

		expect(source).toMatchObject({
			name: 'Track',
			artist: 'Artist',
			album: 'Album',
			averageBpm: 128,
			bpmSource: 'embeddedTags',
			keyModeSource: 'embeddedTags',
			requiresManualReview: false
		})
	})

	it('derives the artist from the directory above the album', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: '01 Artist - Track.flac',
			relativePath: 'collection/Artist/Album/01 Artist - Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: blankTags,
			analysis: null
		})

		expect(source).toMatchObject({
			artist: 'Artist',
			album: 'Album',
			name: 'Track'
		})
	})

	it('marks Essentia fallback values for manual confirmation', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: '01 Artist - Track.flac',
			relativePath: 'Artist/Album/01 Artist - Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: blankTags,
			analysis
		})

		expect(source.bpmSource).toBe('essentiaBrowser')
		expect(source.keyModeSource).toBeNull()
		expect(source.requiresManualReview).toBe(true)
		expect(source.warnings).toContain(
			'Essentia BPM requires manual confirmation (confidence 2.50)'
		)
		expect(source.warnings).toContain(
			'Essentia key strength 0.72 is below the 0.8 proposal threshold'
		)
	})

	it('keeps strong analyzer key estimates in manual review', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: 'Track.flac',
			relativePath: 'Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: blankTags,
			analysis: { ...analysis, keyStrength: 0.9 }
		})

		expect(source.keyModeSource).toBe('essentiaBrowser')
		expect(source.requiresManualReview).toBe(true)
		expect(source.warnings).toContain(
			'Essentia key requires manual confirmation (strength 0.90)'
		)
	})

	it('suppresses low-confidence analyzer BPM', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: 'Track.flac',
			relativePath: 'Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: blankTags,
			analysis: { ...analysis, bpmConfidence: 1.49 }
		})

		expect(source.averageBpm).toBeNull()
		expect(source.bpmSource).toBeNull()
		expect(source.warnings.join(' ')).toContain(
			'below the 1.5 proposal threshold'
		)
	})

	it('keeps invalid analyzer BPM out of proposed values', () => {
		const source = createLocalAudioTrackSource({
			index: 0,
			fileName: 'Track.flac',
			relativePath: 'Track.flac',
			fileSize: 123,
			lastModified: 456,
			tags: blankTags,
			analysis: { ...analysis, bpm: 738.3 }
		})

		expect(source.averageBpm).toBeNull()
		expect(source.bpmSource).toBeNull()
	})
})
