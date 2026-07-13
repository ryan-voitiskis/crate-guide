import { describe, expect, it } from 'vitest'
import { emailSchema, newPasswordSchema } from './authValidation'

function firstIssueMessage(value: string) {
	return newPasswordSchema.safeParse(value).error?.issues[0]?.message
}

describe('emailSchema', () => {
	it('trims and accepts a valid email address', () => {
		expect(emailSchema.parse(' user@example.com ')).toBe('user@example.com')
	})

	it.each([
		['', 'Email is required'],
		['not-an-email', 'Enter a valid email address'],
		[`${'a'.repeat(243)}@example.com`, 'Email cannot exceed 254 characters']
	])('rejects %j with a stable message', (value, message) => {
		expect(emailSchema.safeParse(value).error?.issues[0]?.message).toBe(message)
	})
})

describe('newPasswordSchema', () => {
	it.each([
		['Pass1', 'Password must be at least 8 characters'],
		[`Password1${'a'.repeat(56)}`, 'Password cannot exceed 64 characters'],
		['PASSWORD123', 'Password must include a lowercase letter'],
		['password123', 'Password must include an uppercase letter'],
		['PasswordOnly', 'Password must include a digit']
	])('rejects %j with a stable message', (value, message) => {
		expect(firstIssueMessage(value)).toBe(message)
	})

	it.each(['Password123', 'password1A', 'NoSymbols8'])(
		'accepts %j',
		(value) => {
			expect(newPasswordSchema.safeParse(value).success).toBe(true)
		}
	)
})
