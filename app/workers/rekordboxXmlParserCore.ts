import type {
	RekordboxXmlSanitizedSnapshot,
	RekordboxXmlSanitizedTrack,
	RekordboxXmlWorkerErrorCode
} from '~/types/rekordboxXmlWorker'
import {
	type RekordboxXmlTrack,
	buildRekordboxXmlTrack,
	cleanRekordboxXmlString,
	getRekordboxPathSegments,
	parseRekordboxNullableInteger,
	toRekordboxRelativeLocationHintFromSegments
} from '~/utils/rekordboxXml'
import {
	IncrementalXmlTokenizer,
	IncrementalXmlTokenizerError
} from '~/utils/rekordboxXmlTokenizer'
import parserConfig from '../../shared/config/rekordboxXmlParser.json'

export const REKORDBOX_XML_PARSER_POLICY_VERSION =
	parserConfig.parserPolicyVersion
export const REKORDBOX_XML_SANITIZED_SNAPSHOT_VERSION =
	parserConfig.sanitizedSnapshotVersion
export const REKORDBOX_XML_PARSER_LIMITS = parserConfig.limits

export type RekordboxXmlParserLimits = typeof REKORDBOX_XML_PARSER_LIMITS

type PendingTrack = RekordboxXmlTrack & {
	locationSegments: string[] | null
}

type ParserErrorCode = Exclude<
	RekordboxXmlWorkerErrorCode,
	'cancelled' | 'file_too_large' | 'worker_failed'
>

const textEncoder = new TextEncoder()

export class RekordboxXmlParserError extends Error {
	readonly code: ParserErrorCode

	constructor(code: ParserErrorCode, message: string) {
		super(message)
		this.name = 'RekordboxXmlParserError'
		this.code = code
	}
}

function toParserError(error: unknown): RekordboxXmlParserError {
	if (error instanceof RekordboxXmlParserError) return error
	if (error instanceof IncrementalXmlTokenizerError) {
		return new RekordboxXmlParserError(error.code, error.message)
	}
	return new RekordboxXmlParserError(
		'malformed_xml',
		'Unable to parse Rekordbox XML.'
	)
}

function boundedUtf8(value: string, maxBytes: number): string {
	if (textEncoder.encode(value).byteLength <= maxBytes) return value
	let bounded = ''
	for (const character of value) {
		const candidate = `${bounded}${character}`
		if (textEncoder.encode(`${candidate}…`).byteLength > maxBytes) break
		bounded = candidate
	}
	return `${bounded}…`
}

function commonPrefix(left: string[], right: string[]): string[] {
	const prefix: string[] = []
	for (let index = 0; index < Math.min(left.length, right.length); index++) {
		if (left[index] !== right[index]) break
		prefix.push(left[index]!)
	}
	return prefix
}

export class IncrementalRekordboxXmlParser {
	private readonly tokenizer: IncrementalXmlTokenizer
	private readonly tracks: PendingTrack[] = []
	private readonly warnings: string[] = []
	private collectionDepth: number | null = null
	private collectionClosed = false
	private entriesDeclared: number | null = null
	private commonDirectory: string[] | null = null
	private directoryPathCount = 0
	private warningCount = 0
	private warningsTruncated = false
	private finished = false

	constructor(
		private readonly limits: RekordboxXmlParserLimits = REKORDBOX_XML_PARSER_LIMITS
	) {
		this.tokenizer = new IncrementalXmlTokenizer(limits, {
			onStartElement: (element) => {
				this.onStartElement(element.name, element.attributes, element.depth)
			},
			onEndElement: (element) => {
				if (
					element.name === 'COLLECTION' &&
					element.depth === this.collectionDepth
				) {
					this.collectionClosed = true
				}
			},
			onXmlDeclaration: (attributes) => {
				this.validateXmlDeclaration(attributes)
			}
		})
	}

	get parsedTracks(): number {
		return this.tracks.length
	}

	get declaredEntries(): number | null {
		return this.entriesDeclared
	}

	write(chunk: string): void {
		if (this.finished) {
			throw new RekordboxXmlParserError(
				'malformed_xml',
				'Unable to parse Rekordbox XML.'
			)
		}
		try {
			this.tokenizer.write(chunk)
		} catch (error) {
			throw toParserError(error)
		}
	}

	finish(): RekordboxXmlSanitizedSnapshot {
		if (this.finished) {
			throw new RekordboxXmlParserError(
				'malformed_xml',
				'Unable to parse Rekordbox XML.'
			)
		}
		this.finished = true
		try {
			this.tokenizer.finish()
		} catch (error) {
			throw toParserError(error)
		}

		if (this.collectionDepth === null) {
			throw new RekordboxXmlParserError(
				'missing_collection',
				'Missing COLLECTION element.'
			)
		}

		if (
			this.entriesDeclared !== null &&
			this.entriesDeclared !== this.tracks.length
		) {
			this.addWarning(
				`COLLECTION Entries declares ${this.entriesDeclared} tracks, parsed ${this.tracks.length}`,
				this.warnings
			)
		}
		if (this.warningsTruncated) {
			this.warnings.push(
				boundedUtf8(
					`Additional track warnings were omitted after ${this.limits.maxWarnings.toLocaleString()} warnings.`,
					this.limits.maxWarningBytes
				)
			)
		}

		const commonDirectory =
			this.directoryPathCount >= 2 ? (this.commonDirectory ?? []) : []
		for (const track of this.tracks) {
			track.locationHint = track.locationSegments
				? toRekordboxRelativeLocationHintFromSegments(
						track.locationSegments,
						commonDirectory
					)
				: null
			if (
				track.locationHint &&
				textEncoder.encode(track.locationHint).byteLength >
					this.limits.maxLocationHintBytes
			) {
				throw new RekordboxXmlParserError(
					'resource_limit_exceeded',
					'Location hint exceeds the supported limit.'
				)
			}
			delete (track as Partial<PendingTrack>).locationSegments
		}

		return {
			parserPolicyVersion: REKORDBOX_XML_PARSER_POLICY_VERSION,
			sanitizedSnapshotVersion: REKORDBOX_XML_SANITIZED_SNAPSHOT_VERSION,
			tracks: this.tracks as unknown as RekordboxXmlSanitizedTrack[],
			entriesDeclared: this.entriesDeclared,
			warnings: this.warnings,
			errors: []
		}
	}

	private validateXmlDeclaration(
		attributes: ReadonlyMap<string, string>
	): void {
		const allowed = new Set(['version', 'encoding', 'standalone'])
		const attributeNames = [...attributes.keys()]
		if (
			attributeNames.some((key) => !allowed.has(key)) ||
			attributeNames[0] !== 'version' ||
			(attributeNames.includes('encoding') &&
				attributeNames.indexOf('encoding') !== 1) ||
			(attributeNames.includes('standalone') &&
				attributeNames.indexOf('standalone') !== attributeNames.length - 1)
		) {
			throw new RekordboxXmlParserError(
				'malformed_xml',
				'Unable to parse Rekordbox XML.'
			)
		}
		if (attributes.get('version') !== '1.0') {
			throw new RekordboxXmlParserError(
				'malformed_xml',
				'Only XML 1.0 Rekordbox exports are supported.'
			)
		}
		const encoding = cleanRekordboxXmlString(attributes.get('encoding') ?? null)
		if (encoding && !['utf-8', 'utf8'].includes(encoding.toLowerCase())) {
			throw new RekordboxXmlParserError(
				'invalid_encoding',
				'Only UTF-8 Rekordbox XML exports are supported.'
			)
		}
		const standalone = attributes.get('standalone')
		if (standalone && standalone !== 'yes' && standalone !== 'no') {
			throw new RekordboxXmlParserError(
				'malformed_xml',
				'Unable to parse Rekordbox XML.'
			)
		}
	}

	private onStartElement(
		name: string,
		attributes: ReadonlyMap<string, string>,
		depth: number
	): void {
		if (this.collectionDepth === null && name === 'COLLECTION') {
			this.collectionDepth = depth
			this.entriesDeclared = parseRekordboxNullableInteger(
				attributes.get('Entries') ?? null
			)
			if (
				this.entriesDeclared !== null &&
				(this.entriesDeclared < 0 ||
					this.entriesDeclared > this.limits.maxTracks)
			) {
				throw new RekordboxXmlParserError(
					'declared_count_exceeded',
					`COLLECTION declares more than ${this.limits.maxTracks.toLocaleString()} tracks.`
				)
			}
			return
		}

		if (
			name !== 'TRACK' ||
			this.collectionDepth === null ||
			this.collectionClosed ||
			depth <= this.collectionDepth
		) {
			return
		}
		if (this.tracks.length >= this.limits.maxTracks) {
			throw new RekordboxXmlParserError(
				'track_limit_exceeded',
				`Rekordbox XML contains more than ${this.limits.maxTracks.toLocaleString()} tracks.`
			)
		}

		const track = buildRekordboxXmlTrack(
			(attributeName) => attributes.get(attributeName) ?? null,
			this.tracks.length
		) as PendingTrack
		const locationSegments = track.location
			? getRekordboxPathSegments(track.location)
			: null
		track.location = null
		if (
			locationSegments &&
			locationSegments.length > this.limits.maxPathSegments
		) {
			throw new RekordboxXmlParserError(
				'resource_limit_exceeded',
				'Location path exceeds the supported segment limit.'
			)
		}
		track.locationSegments = locationSegments
		this.updateCommonDirectory(locationSegments)

		const boundedWarnings: string[] = []
		for (const warning of track.warnings) {
			this.addWarning(warning, boundedWarnings)
		}
		track.warnings = boundedWarnings
		this.tracks.push(track)
	}

	private updateCommonDirectory(segments: string[] | null): void {
		if (!segments || segments.length < 2) return
		const directory = segments.slice(0, -1)
		this.directoryPathCount += 1
		this.commonDirectory = this.commonDirectory
			? commonPrefix(this.commonDirectory, directory)
			: directory
	}

	private addWarning(message: string, target: string[]): void {
		const reservedLimit = Math.max(0, this.limits.maxWarnings - 1)
		if (this.warningCount >= reservedLimit) {
			this.warningsTruncated = true
			return
		}
		target.push(boundedUtf8(message, this.limits.maxWarningBytes))
		this.warningCount += 1
	}
}
