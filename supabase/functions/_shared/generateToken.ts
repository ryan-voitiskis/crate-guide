import { customAlphabet } from 'https://deno.land/x/nanoid@v3.0.0/async.ts'

export async function generateToken(size?: number): Promise<string> {
	return (
		await customAlphabet(
			'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
			size || 21
		)
	)()
}
