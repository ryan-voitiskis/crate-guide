import type { User } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { createDeleteAccountHandler } from './handler.ts'

interface StorageEntry {
	id: string | null
	name: string
}

function request(
	confirmation: unknown = 'listener@example.com',
	method = 'POST'
): Request {
	return new Request('http://localhost', {
		method,
		headers: { Authorization: 'Bearer valid' },
		body: method === 'POST' ? JSON.stringify({ confirmation }) : undefined
	})
}

function dependencies(
	overrides: {
		deleteUser?: (userId: string) => Promise<void>
		listFolder?: (path: string, offset: number) => Promise<StorageEntry[]>
		removeObjects?: (paths: string[]) => Promise<void>
	} = {}
) {
	return {
		authenticate: () =>
			Promise.resolve({
				id: 'user-id',
				email: 'listener@example.com'
			} as User),
		createAdmin: () => ({
			deleteUser: overrides.deleteUser ?? (() => Promise.resolve()),
			listFolder: overrides.listFolder ?? (() => Promise.resolve([])),
			removeObjects: overrides.removeObjects ?? (() => Promise.resolve())
		})
	}
}

Deno.test(
	'delete-account rejects an incorrect email confirmation',
	async () => {
		let didCreateAdmin = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			{
				...dependencies(),
				createAdmin: () => {
					didCreateAdmin = true
					throw new Error('must not create admin')
				}
			}
		)

		const response = await handler(request('someone@example.com'))

		assert.equal(response.status, 400)
		assert.equal(didCreateAdmin, false)
		assert.equal((await response.json()).code, 'confirmation_mismatch')
	}
)

Deno.test(
	'delete-account removes nested covers before the auth user',
	async () => {
		const steps: string[] = []
		let didRemoveObjects = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listFolder: (path) => {
					steps.push(`list:${path}`)
					if (path === 'user-id') {
						return Promise.resolve([
							{ id: null, name: 'record-one' },
							{ id: null, name: 'record-two' }
						])
					}
					if (path === 'user-id/record-one') {
						return Promise.resolve(
							didRemoveObjects ? [] : [{ id: 'one', name: 'cover.webp' }]
						)
					}
					if (path === 'user-id/record-two') {
						return Promise.resolve(
							didRemoveObjects ? [] : [{ id: 'two', name: 'cover.webp' }]
						)
					}
					return Promise.resolve([])
				},
				removeObjects: (paths) => {
					steps.push(`remove:${paths.join(',')}`)
					didRemoveObjects = true
					return Promise.resolve()
				},
				deleteUser: (userId) => {
					steps.push(`delete:${userId}`)
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request(' LISTENER@example.com '))

		assert.equal(response.status, 200)
		assert.deepEqual(steps, [
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two',
			'remove:user-id/record-one/cover.webp,user-id/record-two/cover.webp',
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two',
			'delete:user-id',
			'list:user-id',
			'list:user-id/record-one',
			'list:user-id/record-two'
		])
	}
)

Deno.test(
	'delete-account preserves the user when cover cleanup fails',
	async () => {
		let didDeleteUser = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				listFolder: () =>
					Promise.resolve([{ id: 'cover-id', name: 'cover.webp' }]),
				removeObjects: () => Promise.reject(new Error('storage unavailable')),
				deleteUser: () => {
					didDeleteUser = true
					return Promise.resolve()
				}
			})
		)

		const response = await handler(request())

		assert.equal(response.status, 503)
		assert.equal(didDeleteUser, false)
		assert.equal((await response.json()).code, 'storage_cleanup_failed')
	}
)

Deno.test(
	'delete-account describes auth deletion partial failure safely',
	async () => {
		const privateMessage = 'private auth service detail'
		const logs: unknown[][] = []
		const originalConsoleError = console.error
		console.error = (...values: unknown[]) => logs.push(values)
		try {
			const handler = createDeleteAccountHandler(
				{ 'Content-Type': 'application/json' },
				dependencies({
					deleteUser: () => Promise.reject(new Error(privateMessage))
				})
			)

			const response = await handler(request())
			const payload = await response.json()

			assert.equal(response.status, 503)
			assert.equal(payload.code, 'account_delete_failed')
			assert.match(payload.error, /cover images may already have been removed/i)
			assert.equal(JSON.stringify(payload).includes(privateMessage), false)
			assert.equal(JSON.stringify(logs).includes(privateMessage), false)
		} finally {
			console.error = originalConsoleError
		}
	}
)

Deno.test(
	'delete-account reports a final cover cleanup race after deletion',
	async () => {
		let didDeleteUser = false
		const handler = createDeleteAccountHandler(
			{ 'Content-Type': 'application/json' },
			dependencies({
				deleteUser: () => {
					didDeleteUser = true
					return Promise.resolve()
				},
				listFolder: () =>
					Promise.resolve(
						didDeleteUser ? [{ id: 'late-cover', name: 'late.webp' }] : []
					),
				removeObjects: () => Promise.reject(new Error('storage unavailable'))
			})
		)

		const response = await handler(request())
		const payload = await response.json()

		assert.equal(response.status, 200)
		assert.equal(didDeleteUser, true)
		assert.equal(payload.success, true)
		assert.equal(payload.cover_cleanup_complete, false)
	}
)
