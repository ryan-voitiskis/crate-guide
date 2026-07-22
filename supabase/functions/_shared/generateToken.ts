const TOKEN_ALPHABET =
	'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const MAX_UNBIASED_BYTE = 256 - (256 % TOKEN_ALPHABET.length)

export function generateToken(size?: number): Promise<string> {
	const tokenSize = size || 21
	let token = ''
	while (token.length < tokenSize) {
		const randomBytes = crypto.getRandomValues(
			new Uint8Array(Math.ceil((tokenSize - token.length) * 1.2))
		)
		for (const byte of randomBytes) {
			if (byte >= MAX_UNBIASED_BYTE) continue
			token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
			if (token.length === tokenSize) break
		}
	}
	return Promise.resolve(token)
}
