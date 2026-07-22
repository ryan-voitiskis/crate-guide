function percentEncode(value: string) {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	)
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary)
}

export async function generateOAuthSignature(
	method: string,
	baseUrl: string,
	parameters: Record<string, string> | ReadonlyArray<readonly [string, string]>,
	consumerSecret: string,
	tokenSecret: string
) {
	const normalizedParameters = (
		Array.isArray(parameters) ? parameters : Object.entries(parameters)
	)
		.map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
		.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
			if (leftKey < rightKey) return -1
			if (leftKey > rightKey) return 1
			if (leftValue < rightValue) return -1
			if (leftValue > rightValue) return 1
			return 0
		})
		.map(([key, value]) => `${key}=${value}`)
		.join('&')
	const signatureBase = [
		method.toUpperCase(),
		percentEncode(baseUrl),
		percentEncode(normalizedParameters)
	].join('&')
	const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(signingKey),
		{ hash: 'SHA-1', name: 'HMAC' },
		false,
		['sign']
	)
	const signature = await crypto.subtle.sign(
		'HMAC',
		cryptoKey,
		new TextEncoder().encode(signatureBase)
	)
	return bytesToBase64(new Uint8Array(signature))
}
