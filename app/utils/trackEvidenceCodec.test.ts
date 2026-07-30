import { describe, expect, it } from 'vitest'
import {
	currentTrackEvidenceV2Golden,
	legacyTrackAudioFeaturesV1Golden,
	migratedTrackEvidenceV2Golden,
	mixedTrackEvidenceV2Golden
} from '../../test/fixtures/trackEvidence'
import {
	TRACK_EVIDENCE_MAX_SERIALIZED_BYTES,
	type TrackEvidenceDecodeResult,
	decodeTrackEvidence,
	decodeTrackEvidenceV2,
	migrateTrackAudioFeaturesV1
} from './trackEvidenceCodec'

type MutableObject = Record<string, unknown>

function mutableFixture(value: unknown): MutableObject {
	return structuredClone(value) as MutableObject
}

function nestedObject(root: MutableObject, path: string[]): MutableObject {
	let current = root
	for (const segment of path) {
		const next = current[segment]
		if (typeof next !== 'object' || next === null || Array.isArray(next)) {
			throw new Error(`Fixture path is not an object: ${path.join('.')}`)
		}
		current = next as MutableObject
	}
	return current
}

function setFixtureValue(
	root: MutableObject,
	path: string[],
	value: unknown
): MutableObject {
	const parent = nestedObject(root, path.slice(0, -1))
	const field = path.at(-1)
	if (!field) throw new Error('Fixture path must not be empty')
	parent[field] = value
	return root
}

function deleteFixtureValue(
	root: MutableObject,
	path: string[]
): MutableObject {
	const parent = nestedObject(root, path.slice(0, -1))
	const field = path.at(-1)
	if (!field) throw new Error('Fixture path must not be empty')
	Reflect.deleteProperty(parent, field)
	return root
}

function expectSuccess(result: TrackEvidenceDecodeResult) {
	expect(result.ok).toBe(true)
	if (!result.ok) throw new Error('Expected Evidence decoding to succeed')
	return result
}

function expectFailure(result: TrackEvidenceDecodeResult) {
	expect(result.ok).toBe(false)
	if (result.ok) throw new Error('Expected Evidence decoding to fail')
	return result
}

describe('track Evidence compatibility codec', () => {
	it('round-trips a strict current v2 golden value', () => {
		const serialized = JSON.stringify(currentTrackEvidenceV2Golden)
		const decoded = expectSuccess(
			decodeTrackEvidence(JSON.parse(serialized) as unknown)
		)

		expect(decoded).toEqual({
			ok: true,
			sourceVersion: 2,
			evidence: currentTrackEvidenceV2Golden
		})
		expect(decodeTrackEvidenceV2(decoded.evidence)).toEqual(decoded)
	})

	it('round-trips a lossless incremental v1 upgrade with mixed source slots', () => {
		const decoded = expectSuccess(
			decodeTrackEvidenceV2(
				JSON.parse(JSON.stringify(mixedTrackEvidenceV2Golden)) as unknown
			)
		)

		expect(decoded).toEqual({
			ok: true,
			sourceVersion: 2,
			evidence: mixedTrackEvidenceV2Golden
		})
		expect(decoded.evidence.sources.rekordboxXml).toMatchObject({
			kind: 'observation',
			observationId: 'obs-rbx-20260721-001'
		})
		expect(decoded.evidence.sources.embeddedTags).toMatchObject({
			kind: 'legacy-v1',
			observationId: null,
			unknownFields: { futureSourceField: ['tag-reader-vNext'] }
		})
		expect(decoded.evidence.legacy).toEqual(
			migratedTrackEvidenceV2Golden.legacy
		)
	})

	it('migrates v1 deterministically into the exact honest legacy golden', () => {
		const first = expectSuccess(
			migrateTrackAudioFeaturesV1(legacyTrackAudioFeaturesV1Golden)
		)
		const second = expectSuccess(
			decodeTrackEvidence(legacyTrackAudioFeaturesV1Golden)
		)

		expect(first).toEqual({
			ok: true,
			sourceVersion: 1,
			evidence: migratedTrackEvidenceV2Golden
		})
		expect(second).toEqual(first)
		expect(decodeTrackEvidenceV2(first.evidence)).toEqual({
			ok: true,
			sourceVersion: 2,
			evidence: migratedTrackEvidenceV2Golden
		})
	})

	it('preserves unknown v1 fields without inventing provenance', () => {
		const decoded = expectSuccess(
			migrateTrackAudioFeaturesV1(legacyTrackAudioFeaturesV1Golden)
		).evidence

		expect(decoded.origin).toBe('v1-migrated')
		if (decoded.origin !== 'v1-migrated') {
			throw new Error('Expected migrated v1 Evidence')
		}
		expect(decoded.applied).toEqual({ bpm: null, keyMode: null })
		expect(decoded.sources.rekordboxXml).toMatchObject({
			observationId: null,
			match: null,
			data: { rekordboxTrackId: null },
			unknownFields: { futureSourceField: { color: 'blue' } }
		})
		expect(decoded.sources.embeddedTags).toMatchObject({
			observationId: null,
			match: null
		})
		expect(decoded.legacy.globalMatch.unknownFields).toEqual({
			futureMatchField: { policy: 'legacy-policy' }
		})
		expect(decoded.legacy.unknownFields).toEqual(
			migratedTrackEvidenceV2Golden.legacy.unknownFields
		)
	})

	it('retains the numeric and timestamp domain accepted by the v1 reader', () => {
		const legacy = mutableFixture(legacyTrackAudioFeaturesV1Golden)
		setFixtureValue(legacy, ['updatedAt'], 'legacy-clock')
		setFixtureValue(legacy, ['match', 'score'], -42.5)
		setFixtureValue(
			legacy,
			['match', 'reasons'],
			Array.from({ length: 129 }, (_, index) => `legacy reason ${index}`)
		)
		setFixtureValue(
			legacy,
			['sources', 'rekordboxXml', 'fileName'],
			'legacy/export/collection.xml'
		)
		setFixtureValue(legacy, ['sources', 'embeddedTags', 'fileSize'], -0.5)
		setFixtureValue(legacy, ['sources', 'embeddedTags', 'lastModified'], 1.25)
		setFixtureValue(
			legacy,
			['sources', 'embeddedTags', 'fileName'],
			'legacy/folder/Asterism.wav'
		)
		setFixtureValue(
			legacy,
			['sources', 'essentiaBrowser', 'analyzerVersion'],
			''
		)
		setFixtureValue(
			legacy,
			['sources', 'rekordboxXml', 'comments'],
			'x'.repeat(600)
		)
		setFixtureValue(
			legacy,
			['sources', 'embeddedTags', 'importedAt'],
			'legacy-observed-time'
		)

		const decoded = expectSuccess(migrateTrackAudioFeaturesV1(legacy)).evidence
		expect(decoded.updatedAt).toBe('legacy-clock')
		if (decoded.origin !== 'v1-migrated') {
			throw new Error('Expected migrated v1 Evidence')
		}
		expect(decoded.legacy.globalMatch.score).toBe(-42.5)
		expect(decoded.legacy.globalMatch.reasons).toHaveLength(129)
		expect(decoded.sources.rekordboxXml?.data.fileName).toBe(
			'legacy/export/collection.xml'
		)
		expect(decoded.sources.rekordboxXml?.data.comments).toHaveLength(600)
		expect(decoded.sources.embeddedTags?.observedAt).toBe(
			'legacy-observed-time'
		)
		expect(decoded.sources.embeddedTags?.data.fileName).toBe(
			'legacy/folder/Asterism.wav'
		)
		expect(decoded.sources.embeddedTags?.data.fileSize).toBe(-0.5)
		expect(decoded.sources.embeddedTags?.data.lastModified).toBe(1.25)
		expect(decoded.sources.essentiaBrowser?.data.analyzerVersion).toBe('')
		expect(decodeTrackEvidenceV2(decoded).ok).toBe(true)
	})

	it.each([
		['bad current timestamp', ['updatedAt'], 'not-a-timestamp'],
		['empty observation ID', ['sources', 'rekordboxXml', 'observationId'], ''],
		[
			'missing matcher policy identity',
			['sources', 'embeddedTags', 'match', 'matcherPolicyVersion'],
			''
		],
		[
			'out-of-policy current match score',
			['sources', 'rekordboxXml', 'match', 'score'],
			100.01
		],
		[
			'empty current source filename',
			['sources', 'rekordboxXml', 'data', 'fileName'],
			''
		],
		[
			'current filename containing a relative path',
			['sources', 'embeddedTags', 'data', 'fileName'],
			'folder/Asterism.wav'
		],
		['wrong key mode domain', ['applied', 'keyMode', 'value', 'mode'], 2],
		['unsupported model generation', ['modelVersion'], 'latest-per-source-v2'],
		[
			'wrong analyzer identity type',
			['sources', 'essentiaBrowser', 'data', 'analyzerVersion'],
			7
		],
		[
			'too many analyzer estimates',
			['sources', 'essentiaBrowser', 'data', 'bpmEstimates'],
			Array.from({ length: 65 }, (_, index) => index)
		],
		[
			'too many match reasons',
			['sources', 'rekordboxXml', 'match', 'reasons'],
			Array.from({ length: 129 }, () => 'reason')
		]
	] as const)(
		'rejects malformed v2: %s',
		(_description, path, invalidValue) => {
			const candidate = setFixtureValue(
				mutableFixture(currentTrackEvidenceV2Golden),
				[...path],
				invalidValue
			)

			expect(
				expectFailure(decodeTrackEvidence(candidate)).issues
			).toContainEqual(expect.objectContaining({ code: 'invalid-shape' }))
		}
	)

	it('rejects missing required v2 fields', () => {
		const candidate = deleteFixtureValue(
			mutableFixture(currentTrackEvidenceV2Golden),
			['sources', 'rekordboxXml', 'observationId']
		)

		expect(expectFailure(decodeTrackEvidence(candidate)).issues).toContainEqual(
			{
				code: 'invalid-shape',
				path: '/sources/rekordboxXml/observationId'
			}
		)
	})

	it.each([
		['root', [], 'futureRoot'],
		['sources map', ['sources'], 'futureSource'],
		['observation', ['sources', 'rekordboxXml'], 'futureObservationField'],
		['source match', ['sources', 'rekordboxXml', 'match'], 'futureMatch'],
		['source data', ['sources', 'rekordboxXml', 'data'], 'futureData'],
		['application', ['applied', 'bpm'], 'futureApplication']
	] as const)(
		'rejects undeclared v2 extra keys in the %s object',
		(_description, parentPath, field) => {
			const candidate = mutableFixture(currentTrackEvidenceV2Golden)
			nestedObject(candidate, [...parentPath])[field] = 'not declared'
			const failed = expectFailure(decodeTrackEvidence(candidate))

			expect(failed.issues).toContainEqual({
				code: 'invalid-shape',
				path: parentPath.length === 0 ? '' : `/${parentPath.join('/')}`
			})
		}
	)

	it('rejects v2 source history arrays to keep one bounded slot per source', () => {
		const candidate = mutableFixture(currentTrackEvidenceV2Golden)
		nestedObject(candidate, ['sources', 'rekordboxXml']).history = []

		expect(expectFailure(decodeTrackEvidence(candidate)).issues).toContainEqual(
			{
				code: 'invalid-shape',
				path: '/sources/rekordboxXml'
			}
		)
	})

	it.each([
		['missing source slot', ['sources', 'rekordboxXml'], undefined],
		[
			'mismatched observation ID',
			['applied', 'bpm', 'observationId'],
			'obs-rbx-dangling'
		]
	] as const)(
		'accepts an applied snapshot with a %s',
		(_description, path, replacement) => {
			const candidate = mutableFixture(currentTrackEvidenceV2Golden)
			if (replacement === undefined) {
				deleteFixtureValue(candidate, [...path])
			} else {
				setFixtureValue(candidate, [...path], replacement)
			}

			const decoded = expectSuccess(decodeTrackEvidenceV2(candidate))
			expect(decoded.evidence.applied.bpm).toEqual({
				source: 'rekordboxXml',
				observationId:
					replacement === undefined
						? 'obs-rbx-20260721-001'
						: 'obs-rbx-dangling',
				value: 128,
				appliedAt: '2026-07-21T12:01:00.000Z'
			})
		}
	)

	it('requires the retained v1 envelope when current v2 keeps legacy source slots', () => {
		const candidate = setFixtureValue(
			mutableFixture(mixedTrackEvidenceV2Golden),
			['legacy'],
			null
		)

		expect(
			expectFailure(decodeTrackEvidenceV2(candidate)).issues
		).toContainEqual({
			code: 'invalid-shape',
			path: '/legacy'
		})
	})

	it.each([
		['a/..'],
		['a/%2e%2e'],
		['a\\..\\track.wav'],
		['a%2f..%2ftrack.wav'],
		['safe/%252e%252e/track.wav']
	])('rejects non-canonical or trailing traversal hint %s', (locationHint) => {
		const candidate = setFixtureValue(
			mutableFixture(currentTrackEvidenceV2Golden),
			['sources', 'embeddedTags', 'data', 'locationHint'],
			locationHint
		)

		expect(expectFailure(decodeTrackEvidence(candidate)).issues).toContainEqual(
			{
				code: 'invalid-shape',
				path: '/sources/embeddedTags/data/locationHint'
			}
		)
	})

	it.each([
		'/Users/private-person/Music/Asterism.wav',
		'C:\\Users\\private-person\\Music\\Asterism.wav',
		'file:///Users/private-person/Music/Asterism.wav',
		'%2FUsers%2Fprivate-person%2FMusic%2FAsterism.wav'
	])(
		'rejects private absolute path %s without reflecting it',
		(privatePath) => {
			const candidate = setFixtureValue(
				mutableFixture(currentTrackEvidenceV2Golden),
				['sources', 'embeddedTags', 'data', 'locationHint'],
				privatePath
			)
			const failed = expectFailure(decodeTrackEvidence(candidate))

			expect(failed.issues).toContainEqual({
				code: 'absolute-path',
				path: '/sources/embeddedTags/data/locationHint'
			})
			expect(JSON.stringify(failed)).not.toContain(privatePath)
			expect(JSON.stringify(failed)).not.toContain('private-person')
		}
	)

	it('rejects cyclic, BigInt, and other non-JSON inputs before schema parsing', () => {
		const cyclic: MutableObject = { version: 2 }
		cyclic.self = cyclic
		const withBigInt = mutableFixture(currentTrackEvidenceV2Golden)
		withBigInt.futureCounter = BigInt(1)
		const withFunction = mutableFixture(currentTrackEvidenceV2Golden)
		withFunction.futureCallback = () => undefined

		expect(expectFailure(decodeTrackEvidence(cyclic)).issues).toEqual([
			{ code: 'cyclic-value', path: '/self' }
		])
		expect(expectFailure(decodeTrackEvidence(withBigInt)).issues).toEqual([
			{ code: 'non-json-value', path: '/futureCounter' }
		])
		expect(expectFailure(decodeTrackEvidence(withFunction)).issues).toEqual([
			{ code: 'non-json-value', path: '/futureCallback' }
		])
	})

	it('rejects forbidden payload fields before permissive legacy parsing', () => {
		const legacy = mutableFixture(legacyTrackAudioFeaturesV1Golden)
		nestedObject(legacy, ['sources', 'embeddedTags']).rawAudio = [1, 2, 3]

		expect(expectFailure(decodeTrackEvidence(legacy)).issues).toEqual([
			{
				code: 'forbidden-field',
				path: '/sources/embeddedTags/rawAudio'
			}
		])
	})

	it('rejects serialized Evidence above the persisted JSON budget', () => {
		const candidate = mutableFixture(currentTrackEvidenceV2Golden)
		setFixtureValue(
			candidate,
			['sources', 'rekordboxXml', 'match', 'reasons'],
			['x'.repeat(TRACK_EVIDENCE_MAX_SERIALIZED_BYTES)]
		)

		expect(expectFailure(decodeTrackEvidence(candidate)).issues).toEqual([
			{ code: 'too-large', path: '' }
		])
	})

	it.each([
		[
			'v1 root with v2 identity',
			legacyTrackAudioFeaturesV1Golden,
			['modelVersion'],
			'latest-per-source-v1'
		],
		[
			'v1 source with a v2 observation timestamp',
			legacyTrackAudioFeaturesV1Golden,
			['sources', 'rekordboxXml', 'observedAt'],
			'2026-07-21T11:58:00.000Z'
		],
		[
			'v1 applied marker with a v2 observation ID',
			legacyTrackAudioFeaturesV1Golden,
			['applied', 'bpm', 'observationId'],
			'obs-mixed'
		],
		[
			'v2 root with a v1 global match',
			currentTrackEvidenceV2Golden,
			['match'],
			{ confidence: 'high', score: 90, reasons: [], warnings: [] }
		],
		[
			'v2 source slot with a v1 importedAt',
			currentTrackEvidenceV2Golden,
			['sources', 'rekordboxXml', 'importedAt'],
			'2026-07-21T11:58:00.000Z'
		]
	] as const)(
		'rejects mixed-version data: %s',
		(_description, fixture, path, value) => {
			const candidate = setFixtureValue(
				mutableFixture(fixture),
				[...path],
				value
			)
			expect(expectFailure(decodeTrackEvidence(candidate)).issues).toEqual([
				{ code: 'mixed-version', path: '' }
			])
		}
	)

	it('classifies missing and unsupported versions without exposing input', () => {
		expect(expectFailure(decodeTrackEvidence({})).issues).toEqual([
			{ code: 'invalid-shape', path: '/version' }
		])
		expect(expectFailure(decodeTrackEvidence({ version: 3 })).issues).toEqual([
			{ code: 'unsupported-version', path: '/version' }
		])
		expect(
			expectFailure(decodeTrackEvidenceV2(legacyTrackAudioFeaturesV1Golden))
				.issues
		).toEqual([{ code: 'unsupported-version', path: '/version' }])
		expect(
			expectFailure(migrateTrackAudioFeaturesV1(currentTrackEvidenceV2Golden))
				.issues
		).toEqual([{ code: 'unsupported-version', path: '/version' }])
	})
})
