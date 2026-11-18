/**
 * Deterministic JSON text for hashing and identity: object keys are sorted by
 * UTF-16 code unit, arrays keep their order, and primitive leaves use
 * `JSON.stringify` (so non-finite numbers become `null`). `toJSON` is not
 * consulted; class instances serialize their own enumerable properties.
 *
 * `onUndefined` decides what happens to a leaf that has no JSON form
 * (`undefined`, a function, or a symbol):
 *
 * - `throw`: reject the input with {@link CanonicalJsonUndefinedError}.
 * - `omit`: follow `JSON.stringify`: drop such object properties and write
 *   `null` for such array entries. A top-level leaf still throws.
 * - `token`: the historical draft-fingerprint encoding. An object property is
 *   written as the bare token `undefined`, an array entry as an empty slot, and
 *   a top-level leaf as `undefined`. This is not valid JSON; it exists only so
 *   persisted draft and current-Evidence fingerprints stay byte-identical.
 */
export type CanonicalJsonOptions = {
	onUndefined: 'throw' | 'omit' | 'token'
}

export class CanonicalJsonUndefinedError extends TypeError {
	constructor() {
		super('Canonical JSON input contains a value with no JSON form.')
		this.name = 'CanonicalJsonUndefinedError'
	}
}

function compareKeys(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0
}

function encode(
	value: unknown,
	onUndefined: CanonicalJsonOptions['onUndefined']
): string | undefined {
	if (value === null || typeof value !== 'object') {
		const serialized = JSON.stringify(value) as string | undefined
		if (serialized === undefined && onUndefined === 'throw') {
			throw new CanonicalJsonUndefinedError()
		}
		return serialized
	}
	if (Array.isArray(value)) {
		if (onUndefined === 'omit') {
			return `[${Array.from(value, (item) => encode(item, onUndefined) ?? 'null').join(',')}]`
		}
		// map() skips holes and join() writes undefined as an empty slot; both
		// are part of the pinned historical encodings.
		return `[${value.map((item) => encode(item, onUndefined)).join(',')}]`
	}
	const members: string[] = []
	for (const [key, nested] of Object.entries(
		value as Record<string, unknown>
	).sort(([left], [right]) => compareKeys(left, right))) {
		const serialized = encode(nested, onUndefined)
		if (serialized === undefined && onUndefined === 'omit') continue
		members.push(`${JSON.stringify(key)}:${serialized}`)
	}
	return `{${members.join(',')}}`
}

export function canonicalJson(
	value: unknown,
	options: CanonicalJsonOptions
): string {
	const serialized = encode(value, options.onUndefined)
	if (serialized !== undefined) return serialized
	if (options.onUndefined === 'token') return 'undefined'
	throw new CanonicalJsonUndefinedError()
}

/**
 * Lowercase hexadecimal SHA-256 of the UTF-8 encoding of `value`. Callers that
 * need a specific error when Web Crypto is unavailable check for it first.
 */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(value)
	)
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('')
}
