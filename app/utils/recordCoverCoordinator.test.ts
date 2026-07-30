import { createMockRecord } from 'test/mocks/fixtures/records'
import { describe, expect, it, vi } from 'vitest'
import {
	type RecordCoverAccountContext,
	createRecordCoverCoordinator
} from './recordCoverCoordinator'

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createCoordinatorHarness() {
	const context: RecordCoverAccountContext = {
		generation: 1,
		userId: 'user-a'
	}
	let currentContext: RecordCoverAccountContext | null = context
	const invoke = vi.fn().mockResolvedValue({
		data: { processed: 0, removed: 0, deferred: 0 },
		error: null
	})
	const upload = vi.fn().mockResolvedValue({ data: null, error: null })
	const remove = vi.fn().mockResolvedValue({ data: null, error: null })
	const maybeSingle = vi.fn().mockResolvedValue({
		data: { cover_storage_path: null },
		error: null
	})
	const recordQuery = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle
	}
	const accountClient = {
		from: vi.fn(() => recordQuery),
		functions: { invoke },
		storage: {
			from: vi.fn(() => ({ remove, upload }))
		}
	}
	const getSession = vi.fn(async () => ({
		data: {
			session: currentContext
				? {
						access_token: `token:${currentContext.userId}`,
						user: { id: currentContext.userId }
					}
				: null
		},
		error: null
	}))
	const processCoverFile = vi
		.fn()
		.mockResolvedValue(new Blob(['processed'], { type: 'image/webp' }))
	const onCleanupFailure = vi.fn()
	const coordinator = createRecordCoverCoordinator({
		supabase: { auth: { getSession } } as never,
		resolveAuthenticatedUserId: async () => currentContext?.userId ?? '',
		isCurrentAccountContext: (candidate) =>
			candidate.generation === currentContext?.generation &&
			candidate.userId === currentContext.userId,
		getSupabaseConfig: () => ({
			key: 'test-key',
			url: 'https://supabase.test.invalid'
		}),
		onCleanupFailure,
		createAccountBoundClient: () => accountClient as never,
		processCoverFile
	})

	return {
		accountClient,
		context,
		coordinator,
		invoke,
		maybeSingle,
		onCleanupFailure,
		processCoverFile,
		remove,
		setCurrentContext: (nextContext: RecordCoverAccountContext | null) => {
			currentContext = nextContext
		},
		upload
	}
}

describe('recordCoverCoordinator', () => {
	it('starts a cleanup request after the newest fresh epoch', async () => {
		const harness = createCoordinatorHarness()
		const firstPage = createDeferred<{
			data: { processed: number; removed: number; deferred: number }
			error: null
		}>()
		const freshPage = createDeferred<{
			data: { processed: number; removed: number; deferred: number }
			error: null
		}>()
		harness.invoke
			.mockReturnValueOnce(firstPage.promise)
			.mockReturnValueOnce(freshPage.promise)

		const backgroundDrain = harness.coordinator.drain(harness.context)
		await vi.waitFor(() => expect(harness.invoke).toHaveBeenCalledOnce())
		const freshDrain = harness.coordinator.drain(harness.context, {
			fresh: true
		})

		firstPage.resolve({
			data: { processed: 0, removed: 0, deferred: 0 },
			error: null
		})
		await vi.waitFor(() => expect(harness.invoke).toHaveBeenCalledTimes(2))
		freshPage.resolve({
			data: { processed: 0, removed: 0, deferred: 0 },
			error: null
		})

		await expect(Promise.all([backgroundDrain, freshDrain])).resolves.toEqual([
			true,
			true
		])
	})

	it('aborts cleanup from a stale account and allows the replacement account', async () => {
		const harness = createCoordinatorHarness()
		harness.invoke.mockImplementationOnce(
			(_functionName, options: { signal: AbortSignal }) =>
				new Promise((resolvePromise) => {
					options.signal.addEventListener(
						'abort',
						() =>
							resolvePromise({
								data: null,
								error: new Error('aborted')
							}),
						{ once: true }
					)
				})
		)

		const staleDrain = harness.coordinator.drain(harness.context)
		await vi.waitFor(() => expect(harness.invoke).toHaveBeenCalledOnce())
		const replacementContext = { generation: 2, userId: 'user-b' }
		harness.setCurrentContext(replacementContext)
		harness.coordinator.reset()

		await expect(staleDrain).resolves.toBe(false)
		await expect(harness.coordinator.drain(replacementContext)).resolves.toBe(
			true
		)
		expect(harness.invoke).toHaveBeenCalledTimes(2)
		expect(harness.onCleanupFailure).not.toHaveBeenCalled()
	})

	it('uploads, persists, and drains cleanup through the injected boundary', async () => {
		const harness = createCoordinatorHarness()
		const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })
		const record = createMockRecord({ id: 'record-1' })
		const persistCoverPath = vi.fn().mockResolvedValue(record)

		const outcome = await harness.coordinator.mutate({
			context: harness.context,
			recordId: record.id,
			change: {
				type: 'upload',
				file,
				crop: { positionX: 25, positionY: 50 }
			},
			persistCoverPath
		})

		expect(outcome).toEqual({ status: 'updated', record })
		expect(harness.processCoverFile).toHaveBeenCalledWith(file, {
			positionX: 25,
			positionY: 50
		})
		expect(harness.upload).toHaveBeenCalledWith(
			expect.stringMatching(/^user-a\/record-1\/.+\.webp$/),
			expect.any(Blob),
			{
				cacheControl: '300',
				contentType: 'image/webp',
				upsert: false
			}
		)
		expect(persistCoverPath).toHaveBeenCalledWith(
			expect.stringMatching(/^user-a\/record-1\/.+\.webp$/),
			expect.any(Function)
		)
		expect(harness.invoke).toHaveBeenCalledOnce()
	})

	it('reconciles an uploaded object when persistence cannot confirm it', async () => {
		const harness = createCoordinatorHarness()
		const persistCoverPath = vi.fn(
			async (_path: string | null, onResponseFailure?: () => Promise<void>) => {
				await onResponseFailure?.()
				return null
			}
		)

		const outcome = await harness.coordinator.mutate({
			context: harness.context,
			recordId: 'record-1',
			change: {
				type: 'upload',
				file: new File(['cover'], 'cover.jpg', { type: 'image/jpeg' }),
				crop: { positionX: 50, positionY: 50 }
			},
			persistCoverPath
		})

		expect(outcome).toEqual({ status: 'not-updated' })
		expect(harness.maybeSingle).toHaveBeenCalledOnce()
		expect(harness.remove).toHaveBeenCalledWith([
			expect.stringMatching(/^user-a\/record-1\/.+\.webp$/)
		])
		expect(harness.invoke).not.toHaveBeenCalled()
	})
})
