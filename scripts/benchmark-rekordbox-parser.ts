import { Window } from 'happy-dom'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
	REKORDBOX_XML_SCALE_FIXTURE_COUNTS,
	generateRekordboxXmlScaleFixture
} from '../test/fixtures/rekordboxXmlScale'

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

function outputChecksum(value: {
	entriesDeclared: number | null
	warnings: string[]
	errors: string[]
	tracks: unknown[]
}): string {
	const hash = createHash('sha256')
	hash.update(JSON.stringify(value.entriesDeclared))
	hash.update(JSON.stringify(value.warnings))
	hash.update(JSON.stringify(value.errors))
	for (const track of value.tracks) hash.update(JSON.stringify(track))
	return hash.digest('hex')
}

const manifestOnly = process.argv.includes('--manifest')
const requestedCounts = process.argv
	.slice(2)
	.filter((value) => value !== '--manifest')
	.map((value) => Number.parseInt(value, 10))
	.filter(Number.isSafeInteger)
const counts =
	requestedCounts.length > 0
		? requestedCounts
		: [...REKORDBOX_XML_SCALE_FIXTURE_COUNTS]

const window = manifestOnly ? null : new Window({ url: 'https://crate.guide/' })
if (window) Object.assign(globalThis, { DOMParser: window.DOMParser })
const parseRekordboxXml = window
	? (await import('../app/utils/rekordboxXml')).parseRekordboxXml
	: null

for (const trackCount of counts) {
	globalThis.gc?.()
	const heapBeforeBytes = process.memoryUsage().heapUsed
	const buildStartedAt = performance.now()
	const xml = generateRekordboxXmlScaleFixture(trackCount)
	const xmlBuildMs = performance.now() - buildStartedAt
	const heapAfterInputBytes = process.memoryUsage().heapUsed
	if (!parseRekordboxXml) {
		console.info(
			JSON.stringify({
				trackCount,
				inputBytes: Buffer.byteLength(xml),
				inputSha256: sha256(xml)
			})
		)
		continue
	}
	const parseStartedAt = performance.now()
	const result = parseRekordboxXml(xml)
	const parseMs = performance.now() - parseStartedAt
	const heapAfterParseBytes = process.memoryUsage().heapUsed

	console.info(
		JSON.stringify({
			kind: 'rekordbox-xml-synchronous-baseline',
			trackCount,
			inputBytes: Buffer.byteLength(xml),
			inputSha256: sha256(xml),
			outputChecksum: outputChecksum(result),
			parsedTracks: result.tracks.length,
			errors: result.errors,
			warnings: result.warnings,
			xmlBuildMs: Math.round(xmlBuildMs * 100) / 100,
			parseMs: Math.round(parseMs * 100) / 100,
			firstProgressMs: null,
			cancellationSupported: false,
			heapBeforeBytes,
			heapAfterInputBytes,
			heapAfterParseBytes,
			observedHeapGrowthBytes: Math.max(
				0,
				heapAfterInputBytes - heapBeforeBytes,
				heapAfterParseBytes - heapBeforeBytes
			)
		})
	)
}

await window?.close()
