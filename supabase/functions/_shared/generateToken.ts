import { customAlphabet } from 'nanoid/async.ts'

export async function generateToken(size?: number): Promise<string> {
	return (
		await customAlphabet(
			'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
			size || 21
		)
	)()
}
