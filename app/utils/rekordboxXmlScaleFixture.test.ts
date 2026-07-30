import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import parserConfig from '../../shared/config/rekordboxXmlParser.json'
import {
	REKORDBOX_XML_SCALE_FIXTURE_COUNTS,
	iterateRekordboxXmlScaleFixture
} from '../../test/fixtures/rekordboxXmlScale'
import fixtureManifest from '../../test/fixtures/rekordboxXmlScale.manifest.json'

describe('Rekordbox XML scale fixtures', () => {
	it.each(fixtureManifest.fixtures)(
		'generates the checked-in $tracks-track corpus',
		({ tracks, bytes, sha256 }) => {
			const hash = createHash('sha256')
			let generatedBytes = 0
			for (const chunk of iterateRekordboxXmlScaleFixture(tracks)) {
				hash.update(chunk)
				generatedBytes += Buffer.byteLength(chunk)
			}

			expect(generatedBytes).toBe(bytes)
			expect(hash.digest('hex')).toBe(sha256)
		}
	)

	it('keeps the fixture, parser-policy, and sanitized-snapshot versions explicit', () => {
		expect(fixtureManifest.fixtures.map(({ tracks }) => tracks)).toEqual([
			...REKORDBOX_XML_SCALE_FIXTURE_COUNTS
		])
		expect(fixtureManifest.generatorVersion).toBe(
			parserConfig.fixtureGeneratorVersion
		)
		expect(parserConfig.parserPolicyVersion).not.toBe(
			parserConfig.sanitizedSnapshotVersion
		)
	})
})
