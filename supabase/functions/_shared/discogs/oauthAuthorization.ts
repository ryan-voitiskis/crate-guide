export function encodeOAuthComponent(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	)
}

export function buildOAuthAuthorizationHeader(
	parameters: Readonly<Record<string, string>>
): string {
	const fields = Object.entries(parameters)
		.map(([key, value]) => {
			if (key.length === 0 || !key.startsWith('oauth_')) {
				throw new TypeError(
					'OAuth Authorization parameters must use oauth_ keys.'
				)
			}
			return [key, value] as const
		})
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(
			([key, value]) =>
				`${encodeOAuthComponent(key)}="${encodeOAuthComponent(value)}"`
		)

	return `OAuth ${fields.join(', ')}`
}
