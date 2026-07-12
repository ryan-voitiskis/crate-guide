import type {
	LocalAudioAnalysis,
	LocalAudioTagMetadata,
	LocalAudioTrackSource
} from '~/types/localAudio'
import { parseRekordboxTonality } from './rekordboxXml'
import { isValidBPM } from './track-validation'

export const LOCAL_AUDIO_ANALYZER_VERSION = 'essentia.js@0.1.3'
export const LOCAL_AUDIO_CONFIGURATION_VERSION = 'center-180s-44k1-v1'
export const LOCAL_AUDIO_METADATA_VERSION = 'native-tags-v2'
export const LOCAL_AUDIO_SAMPLE_RATE = 44_100
export const LOCAL_AUDIO_MAX_ANALYSIS_SECONDS = 180
export const LOCAL_AUDIO_MIN_BPM_CONFIDENCE = 1.5
export const LOCAL_AUDIO_MIN_KEY_STRENGTH = 0.8

const AUDIO_EXTENSIONS = new Set([
	'aac',
	'aif',
	'aiff',
	'alac',
	'ape',
	'flac',
	'm4a',
	'mp3',
	'ogg',
	'opus',
	'wav',
	'wv'
])

export function getAudioExtension(name: string): string {
	return name.split('.').pop()?.toLowerCase() ?? ''
}

export function isSupportedAudioFile(name: string): boolean {
	return AUDIO_EXTENSIONS.has(getAudioExtension(name))
}

export function getLocalAudioCacheKey(input: {
	relativePath: string
	size: number
	lastModified: number
}): string {
	return [
		LOCAL_AUDIO_ANALYZER_VERSION,
		LOCAL_AUDIO_CONFIGURATION_VERSION,
		LOCAL_AUDIO_METADATA_VERSION,
		input.relativePath,
		input.size,
		input.lastModified
	].join('|')
}

export function getLocalAudioAnalysisWindow(durationSeconds: number): {
	analyzedDurationSeconds: number
	analysisOffsetSeconds: number
} {
	const analyzedDurationSeconds = Math.min(
		Math.max(0, durationSeconds),
		LOCAL_AUDIO_MAX_ANALYSIS_SECONDS
	)
	return {
		analyzedDurationSeconds,
		analysisOffsetSeconds: Math.max(
			0,
			(durationSeconds - analyzedDurationSeconds) / 2
		)
	}
}

type NativeAudioTag = {
	id: string
	value: unknown
}

export function findNativeAudioTag(
	nativeTags: Record<string, NativeAudioTag[]>,
	acceptedIds: string[]
): string | null {
	const normalizedIds = new Set(
		acceptedIds.map((id) => id.toUpperCase().replace(/[^A-Z0-9]/g, ''))
	)
	for (const tags of Object.values(nativeTags)) {
		for (const tag of tags) {
			const normalizedId = tag.id.toUpperCase().replace(/[^A-Z0-9]/g, '')
			if (!normalizedIds.has(normalizedId)) continue
			const value = Array.isArray(tag.value) ? tag.value[0] : tag.value
			if (typeof value === 'number' && Number.isFinite(value)) {
				return String(value)
			}
			if (typeof value === 'string' && value.trim()) return value.trim()
		}
	}
	return null
}

export async function readLocalAudioTags(
	file: File
): Promise<LocalAudioTagMetadata> {
	const { parseBlob } = await import('music-metadata')
	const metadata = await parseBlob(file, { duration: false, skipCovers: true })
	const nativeBpm = findNativeAudioTag(metadata.native, [
		'BPM',
		'TBPM',
		'TEMPO'
	])
	const parsedNativeBpm = nativeBpm ? Number.parseFloat(nativeBpm) : null
	const nativeKey = findNativeAudioTag(metadata.native, [
		'INITIALKEY',
		'KEY',
		'TKEY'
	])

	return {
		title: metadata.common.title?.trim() || null,
		artist:
			metadata.common.artist?.trim() ||
			metadata.common.artists?.filter(Boolean).join(', ').trim() ||
			null,
		album: metadata.common.album?.trim() || null,
		genres: metadata.common.genre?.filter(Boolean) ?? [],
		durationSeconds:
			typeof metadata.format.duration === 'number'
				? metadata.format.duration
				: null,
		bpm:
			typeof metadata.common.bpm === 'number'
				? metadata.common.bpm
				: parsedNativeBpm !== null && Number.isFinite(parsedNativeBpm)
					? parsedNativeBpm
					: null,
		key: metadata.common.key?.trim() || nativeKey
	}
}

function stripExtension(fileName: string): string {
	return fileName.replace(/\.[^.]+$/, '')
}

function deriveArtist(relativePath: string, fileName: string): string | null {
	const segments = relativePath.split('/').filter(Boolean)
	if (segments.length >= 3) return segments.at(-3) ?? null

	const nameParts = stripExtension(fileName).split(/\s+-\s+/)
	return nameParts.length > 1 ? nameParts[0]?.trim() || null : null
}

function deriveTitle(fileName: string, artist: string | null): string {
	let title = stripExtension(fileName)
		.replace(/^\s*(?:\d{1,3}|[a-z]\d{1,2})[\s._)-]+/i, '')
		.trim()

	if (artist) {
		const artistPrefix = new RegExp(
			`^${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+-\\s+`,
			'i'
		)
		title = title.replace(artistPrefix, '').trim()
	}

	return title || stripExtension(fileName)
}

function deriveAlbum(relativePath: string): string | null {
	const segments = relativePath.split('/').filter(Boolean)
	return segments.length >= 2 ? (segments.at(-2) ?? null) : null
}

function normalizeBpm(value: number | null): number | null {
	if (value === null || !isValidBPM(value.toString())) return null
	return Math.round(value * 10) / 10
}

export function createLocalAudioTrackSource(input: {
	index: number
	fileName: string
	relativePath: string
	fileSize: number
	lastModified: number
	tags: LocalAudioTagMetadata
	analysis: LocalAudioAnalysis | null
}): LocalAudioTrackSource {
	const { tags, analysis } = input
	const artist = tags.artist ?? deriveArtist(input.relativePath, input.fileName)
	const embeddedBpm = normalizeBpm(tags.bpm)
	const analyzedBpm =
		analysis?.bpmConfidence !== null &&
		analysis?.bpmConfidence !== undefined &&
		analysis.bpmConfidence >= LOCAL_AUDIO_MIN_BPM_CONFIDENCE
			? normalizeBpm(analysis.bpm)
			: null
	const bpmSource = embeddedBpm
		? ('embeddedTags' as const)
		: analyzedBpm
			? ('essentiaBrowser' as const)
			: null
	const bpm = embeddedBpm ?? analyzedBpm

	const embeddedKey = parseRekordboxTonality(tags.key)
	const analysisTonality =
		analysis?.key && analysis.scale
			? `${analysis.key} ${analysis.scale}`
			: (analysis?.key ?? null)
	const analyzedKey = parseRekordboxTonality(analysisTonality)
	const hasEmbeddedKey = embeddedKey.key !== null && embeddedKey.mode !== null
	const hasReliableAnalyzedKey =
		analysis?.keyStrength !== null &&
		analysis?.keyStrength !== undefined &&
		analysis.keyStrength >= LOCAL_AUDIO_MIN_KEY_STRENGTH &&
		analyzedKey.key !== null &&
		analyzedKey.mode !== null
	const keyModeSource = hasEmbeddedKey
		? ('embeddedTags' as const)
		: hasReliableAnalyzedKey
			? ('essentiaBrowser' as const)
			: null
	const selectedKey = hasEmbeddedKey ? embeddedKey : analyzedKey
	const warnings = [
		...(embeddedKey.warning ? [embeddedKey.warning] : []),
		...(analysis?.warnings ?? []),
		...(analysis?.bpm !== null &&
		analysis?.bpmConfidence !== null &&
		analysis?.bpmConfidence !== undefined &&
		analysis.bpmConfidence < LOCAL_AUDIO_MIN_BPM_CONFIDENCE
			? [
					`Essentia BPM confidence ${analysis.bpmConfidence.toFixed(2)} is below the ${LOCAL_AUDIO_MIN_BPM_CONFIDENCE.toFixed(1)} proposal threshold`
				]
			: []),
		...(analysis && bpmSource === 'essentiaBrowser'
			? [
					`Essentia BPM requires manual confirmation (confidence ${analysis.bpmConfidence?.toFixed(2) ?? 'unavailable'})`
				]
			: []),
		...(analysis?.key &&
		analysis?.keyStrength !== null &&
		analysis?.keyStrength !== undefined &&
		analysis.keyStrength < LOCAL_AUDIO_MIN_KEY_STRENGTH
			? [
					`Essentia key strength ${analysis.keyStrength.toFixed(2)} is below the ${LOCAL_AUDIO_MIN_KEY_STRENGTH.toFixed(1)} proposal threshold`
				]
			: []),
		...(analysis && keyModeSource === 'essentiaBrowser'
			? [
					`Essentia key requires manual confirmation (strength ${analysis.keyStrength?.toFixed(2) ?? 'unavailable'})`
				]
			: [])
	]

	return {
		sourceType: 'localAudio',
		index: input.index,
		name: tags.title ?? deriveTitle(input.fileName, artist),
		artist,
		album: tags.album ?? deriveAlbum(input.relativePath),
		genre: tags.genres[0] ?? null,
		locationHint: input.relativePath,
		totalTimeSeconds: tags.durationSeconds,
		averageBpm: bpm,
		tonality: tags.key ?? analysisTonality,
		parsedKey:
			hasEmbeddedKey || hasReliableAnalyzedKey ? selectedKey.key : null,
		parsedMode:
			hasEmbeddedKey || hasReliableAnalyzedKey ? selectedKey.mode : null,
		warnings: Array.from(new Set(warnings)),
		fileName: input.fileName,
		fileSize: input.fileSize,
		lastModified: input.lastModified,
		tags,
		analysis,
		bpmSource,
		keyModeSource,
		requiresManualReview:
			bpmSource === 'essentiaBrowser' || keyModeSource === 'essentiaBrowser'
	}
}
