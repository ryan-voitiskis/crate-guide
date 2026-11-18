import { describe, expect, it } from 'vitest'
import {
	CanonicalJsonUndefinedError,
	canonicalJson,
	sha256Hex
} from './canonicalJson'

// Verbatim pre-consolidation implementations used as exactness oracles.

// trackEnrichmentDraftFingerprint.ts and trackEnrichmentDraftEvidencePrecondition.ts
function legacyDraftCanonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) {
		return `[${value.map((item) => legacyDraftCanonicalize(item)).join(',')}]`
	}
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(
			([key, nested]) =>
				`${JSON.stringify(key)}:${legacyDraftCanonicalize(nested)}`
		)
		.join(',')}}`
}

// trackEvidenceObservationId.ts
function legacyObservationIdCanonicalize(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		const serialized = JSON.stringify(value)
		if (serialized === undefined) {
			throw new TypeError('Track Evidence identity input must be JSON.')
		}
		return serialized
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => legacyObservationIdCanonicalize(item)).join(',')}]`
	}
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(
			([key, nested]) =>
				`${JSON.stringify(key)}:${legacyObservationIdCanonicalize(nested)}`
		)
		.join(',')}}`
}

async function legacySha256Hex(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value)
	)
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
}

// eslint-disable-next-line no-sparse-arrays
const sparse = [1, , 3]

const jsonInputs: unknown[] = [
	null,
	true,
	0,
	-0,
	1.5e-7,
	Number.MAX_SAFE_INTEGER,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	'',
	'Ünïcode   "quoted" \\ \n',
	[],
	{},
	sparse,
	[{ b: 1, a: [2, { d: null, c: 'x' }] }],
	{ Z: 1, a: 2, B: 3, b: 4, é: 5, e: 6, '10': 7, '2': 8, '': 9 },
	{ nested: { deeper: { deepest: [null, false, 'é'] } } },
	new Date(0),
	{ date: new Date(0), list: [new Map([[1, 2]])] }
]

const undefinedInputs: unknown[] = [
	undefined,
	{ present: 1, missing: undefined },
	[undefined, 1],
	{ fn: () => 1, symbol: Symbol('x') },
	[() => 1],
	{ nested: [{ value: undefined }] }
]

describe('canonicalJson', () => {
	it.each(jsonInputs.map((value) => [value]))(
		'matches every legacy encoding for JSON-shaped input %#',
		(value) => {
			const legacy = legacyDraftCanonicalize(value)
			expect(canonicalJson(value, { onUndefined: 'token' })).toBe(legacy)
			expect(canonicalJson(value, { onUndefined: 'throw' })).toBe(
				legacyObservationIdCanonicalize(value)
			)
			expect(canonicalJson(value, { onUndefined: 'throw' })).toBe(legacy)
		}
	)

	it.each(undefinedInputs.map((value) => [value]))(
		'keeps the draft-fingerprint undefined token for input %#',
		(value) => {
			expect(canonicalJson(value, { onUndefined: 'token' })).toBe(
				`${legacyDraftCanonicalize(value)}`
			)
		}
	)

	it.each(undefinedInputs.map((value) => [value]))(
		'rejects undefined leaves like the observation-ID encoder for input %#',
		(value) => {
			expect(() => legacyObservationIdCanonicalize(value)).toThrow(TypeError)
			expect(() => canonicalJson(value, { onUndefined: 'throw' })).toThrow(
				CanonicalJsonUndefinedError
			)
		}
	)

	it('omits undefined members the way JSON.stringify does', () => {
		expect(
			canonicalJson(
				{ b: undefined, a: [undefined, () => 1, 1], c: { z: 1, y: undefined } },
				{ onUndefined: 'omit' }
			)
		).toBe('{"a":[null,null,1],"c":{"z":1}}')
		expect(canonicalJson(sparse, { onUndefined: 'omit' })).toBe('[1,null,3]')
		expect(() => canonicalJson(undefined, { onUndefined: 'omit' })).toThrow(
			CanonicalJsonUndefinedError
		)
	})

	it('sorts keys by UTF-16 code unit independent of insertion order', () => {
		const first = canonicalJson({ b: 1, a: 2, B: 3 }, { onUndefined: 'throw' })
		const second = canonicalJson({ B: 3, a: 2, b: 1 }, { onUndefined: 'throw' })
		expect(first).toBe('{"B":3,"a":2,"b":1}')
		expect(second).toBe(first)
	})
})

describe('sha256Hex', () => {
	it('matches the legacy lowercase hex digests', async () => {
		for (const value of ['', 'abc', 'Ünïcode 🎧', 'x'.repeat(10_000)]) {
			expect(await sha256Hex(value)).toBe(await legacySha256Hex(value))
		}
		expect(await sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		)
	})
})
