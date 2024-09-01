import { customAlphabet } from 'https://deno.land/x/nanoid@v3.0.0/async.ts'

export async function generateToken(): Promise<string> {
	return (
		await customAlphabet(
			'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
			21
		)
	)()
}
