import { describe, expect, it } from 'vitest'
import {
	inspectTrackEnrichmentDraftPrivacy,
	sanitizeTrackEnrichmentDraftLabel,
	sanitizeTrackEnrichmentDraftRelativePath
} from './trackEnrichmentDraftPrivacy'

describe('track enrichment draft relative paths', () => {
	it.each([
		['Artist/Release/Track.mp3', 'Artist/Release/Track.mp3'],
		['/Users/alice/Music/Artist/Track.mp3', 'Music/Artist/Track.mp3'],
		['/home/alice/Music/Track.mp3', 'Music/Track.mp3'],
		['C:\\Users\\Alice\\Music\\Track.mp3', 'Music/Track.mp3'],
		['\\\\NAS\\share\\Music\\Track.mp3', 'Music/Track.mp3'],
		['file:///Users/alice/Music/Track%20One.mp3', 'Music/Track One.mp3'],
		['file://nas/share/Music/Track.mp3', 'Music/Track.mp3'],
		['/Volumes/External/Music/Track.mp3', 'Music/Track.mp3'],
		['FiLe:///UsErS/ALICE/Music/Track.mp3', 'Music/Track.mp3']
	])('sanitizes %s without retaining its absolute root', (input, expected) => {
		expect(sanitizeTrackEnrichmentDraftRelativePath(input)).toBe(expected)
	})

	it.each([
		'',
		'../Music/Track.mp3',
		'Music/../Secrets/Track.mp3',
		'blob:https://crate.guide/private',
		'data:audio/mpeg;base64,AAAA',
		'https:/example.test/Music/Track.mp3',
		'custom://provider/Music/Track.mp3',
		'%68%74%74%70%73%3A%2F%2Fexample.test%2FTrack.mp3',
		'Artist/Track\u0000.mp3',
		`${'segment/'.repeat(65)}track.mp3`
	])('rejects an unsafe or unbounded path: %s', (input) => {
		expect(sanitizeTrackEnrichmentDraftRelativePath(input)).toBeNull()
	})

	it('reduces a selected source label to a basename', () => {
		expect(
			sanitizeTrackEnrichmentDraftLabel(
				'/Users/alice/Music/Rekordbox/collection.xml'
			)
		).toBe('collection.xml')
	})
})

describe('track enrichment draft recursive privacy audit', () => {
	it('accepts bounded JSON-only sanitized evidence', () => {
		expect(
			inspectTrackEnrichmentDraftPrivacy({
				fileIdentity: { relativePath: 'Artist/Release/Track.mp3' },
				locationHint: 'Release/Track.mp3',
				sourceBinding: { sourceFingerprint: 'source-a' }
			})
		).toEqual([])
	})

	it('accepts only the bounded evidence-only approval binding, not Evidence payloads', () => {
		expect(
			inspectTrackEnrichmentDraftPrivacy({
				kind: 'evidence-only',
				sourceBinding: {
					sourceSnapshotId: 'track-id:42',
					sourceFingerprint: 'source-a',
					observationFingerprint: 'b'.repeat(64)
				},
				targetBinding: { trackId: 'track-a' },
				preconditionBinding: {
					currentEvidenceFingerprint: {
						version: 'track-enrichment-current-evidence-v1',
						digest: 'c'.repeat(64)
					}
				}
			})
		).toEqual([])

		expect(
			inspectTrackEnrichmentDraftPrivacy({
				kind: 'evidence-only',
				preconditionBinding: {
					currentEvidenceFingerprint: { digest: 'c'.repeat(64) },
					rawAudio: '/Users/alice/Music/Track.wav'
				}
			})
		).toEqual(
			expect.arrayContaining([
				{
					code: 'forbidden-field',
					path: '/preconditionBinding/rawAudio'
				}
			])
		)
	})

	it.each([
		[{ nested: { RaW_XmL: '<DJ_PLAYLISTS />' } }, '/nested/RaW_XmL'],
		[{ nested: { aUdIo_FiLe_HaNdLe: {} } }, '/nested/aUdIo_FiLe_HaNdLe'],
		[{ rows: [] }, '/rows'],
		[{ target: { record: {} } }, '/target/record'],
		[{ state: { Object_URL: 'https://example.test' } }, '/state/Object_URL']
	])(
		'rejects forbidden fields recursively without echoing values',
		(value, path) => {
			expect(inspectTrackEnrichmentDraftPrivacy(value)).toContainEqual({
				code: 'forbidden-field',
				path
			})
		}
	)

	it.each([
		['/UsErS/ALICE/Music/Track.mp3'],
		['c:\\uSeRs\\ALICE\\Music\\Track.mp3'],
		['FiLe:///UsErS/ALICE/Music/Track.mp3'],
		['https:/example.test/private/Track.mp3'],
		['CuStOm://provider/private/Track.mp3'],
		['%68%74%74%70%73%3A%2F%2Fexample.test%2FTrack.mp3'],
		['%2FUsers%2Falice%2FMusic%2FTrack.mp3'],
		['Failed to read /home/alice/Music/Track.mp3']
	])('detects mixed-case and encoded absolute paths: %s', (privateValue) => {
		expect(
			inspectTrackEnrichmentDraftPrivacy({ hint: privateValue })
		).toContainEqual({ code: 'absolute-path', path: '/hint' })
	})

	it('rejects non-JSON runtime objects, functions, and cycles', () => {
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		const value = {
			date: new Date('2026-07-22T00:00:00.000Z'),
			callback: () => undefined,
			cyclic
		}

		expect(inspectTrackEnrichmentDraftPrivacy(value)).toEqual(
			expect.arrayContaining([
				{ code: 'non-json-value', path: '/date' },
				{ code: 'non-json-value', path: '/callback' },
				{ code: 'cyclic-value', path: '/cyclic/self' }
			])
		)
	})

	it('keeps recursive privacy work depth-bounded', () => {
		let nested: Record<string, unknown> = { value: 'safe' }
		for (let depth = 0; depth < 65; depth++) nested = { nested }

		expect(inspectTrackEnrichmentDraftPrivacy(nested)).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'scan-limit' })])
		)
	})
})
