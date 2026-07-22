import assert from 'node:assert/strict'
import { generateToken } from './generateToken.ts'

Deno.test(
	'generates a cryptographically random token from the public alphabet',
	async () => {
		const first = await generateToken(64)
		const second = await generateToken(64)

		assert.match(first, /^[0-9A-Za-z]{64}$/)
		assert.match(second, /^[0-9A-Za-z]{64}$/)
		assert.notEqual(first, second)
	}
)
