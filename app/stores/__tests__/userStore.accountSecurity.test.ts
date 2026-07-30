import { nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserStore as createPiniaUserStore } from '../userStore'
import {
	createDeferred,
	createMockProfile,
	createUserStoreHarness,
	drainLifecycleTasks
} from './harness/userStoreHarness'

const mockCreateSupabaseClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@supabase/supabase-js')>()),
	createClient: mockCreateSupabaseClient
}))

vi.mock('vue-sonner', () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn()
	}
}))

const mockToast = toast as unknown as {
	error: ReturnType<typeof vi.fn>
	success: ReturnType<typeof vi.fn>
	warning: ReturnType<typeof vi.fn>
}

const harness = createUserStoreHarness({
	createAccountClient: mockCreateSupabaseClient,
	createStore: createPiniaUserStore
})
const mockSupaUser = harness.supaUser
const mockRouter = harness.router
const mockPasswordRecovery = harness.passwordRecovery
const mockUseRecordsStore = harness.useRecordsStore
const mockUseTracksStore = harness.useTracksStore
const mockUseCratesStore = harness.useCratesStore
const mockUseSessionStore = harness.useSessionStore
const mockSupabaseClient = harness.supabaseClient
const mockAccountBoundSupabaseClient = harness.accountBoundSupabaseClient
const useUserStore = harness.useUserStore
let mockQueryBuilder = harness.queryBuilder
describe('userStore account security', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockQueryBuilder = harness.reset()
	})

	afterEach(() => harness.dispose())

	describe('deleteAccount', () => {
		it('signs out locally for reauthentication without normal login navigation', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()

			const result = await store.signOutForReauthentication()

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			expect(mockSupaUser.value).toBeNull()
			expect(store.profile).toBeNull()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('preserves account state when reauthentication sign-out fails', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Sign out failed')
			})

			const result = await store.signOutForReauthentication()

			expect(result).toBe(false)
			expect(mockSupaUser.value).not.toBeNull()
			expect(store.profile).not.toBeNull()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('revalidates the user and requires their account email', async () => {
			const store = useUserStore()

			const result = await store.deleteAccount('someone@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.getUser).toHaveBeenCalledOnce()
			expect(
				mockAccountBoundSupabaseClient.functions.invoke
			).not.toHaveBeenCalled()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Enter the email address for this account to confirm deletion.'
			)
		})

		it('deletes the account, clears the local session and opens login', async () => {
			const store = useUserStore()
			store.profile = createMockProfile()

			const result = await store.deleteAccount(' TEST@example.com ')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(
				mockAccountBoundSupabaseClient.functions.invoke
			).toHaveBeenCalledWith('delete-account', {
				body: { confirmation: ' TEST@example.com ' }
			})
			expect(mockCreateSupabaseClient).toHaveBeenCalledOnce()
			const clientOptions = mockCreateSupabaseClient.mock.calls[0]?.[2]
			await expect(clientOptions?.accessToken?.()).resolves.toBe(
				'token:test-user-id'
			)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledWith({
				scope: 'local'
			})
			expect(mockSupaUser.value).toBeNull()
			expect(store.profile).toBeNull()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')
			expect(mockToast.success).toHaveBeenCalledWith(
				'Your account and its data have been deleted.'
			)
		})

		it('shows the safe partial-failure message returned by the function', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error:
						'Your account was not deleted. Some cover images may already have been removed. Please try again.'
				}),
				{ status: 503 }
			)
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Your account was not deleted. Some cover images may already have been removed. Please try again.',
				{ duration: 30000 }
			)
		})

		it('truthfully reports success when local sign-out cleanup fails', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.signOut.mockResolvedValue({
				error: new Error('Local sign out failed')
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(mockSupaUser.value).toBeNull()
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Your account was deleted. Reload the page if you still appear signed in.',
				{ duration: 30000 }
			)
		})

		it('warns when the deleted account has a cover cleanup race', async () => {
			const store = useUserStore()
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: { success: true, cover_cleanup_complete: false },
				error: null
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: false
			})
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Your account was deleted, but server-side cover cleanup did not finish. Contact the project owner if a cover remains accessible.',
				{ duration: 30000 }
			)
		})

		it('warns when deleted-account cleanup jobs could not be removed', async () => {
			const store = useUserStore()
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: {
					success: true,
					cover_cleanup_complete: true,
					cleanup_queue_complete: false
				},
				error: null
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({
				status: 'deleted',
				coverCleanupComplete: false
			})
			expect(mockToast.warning).toHaveBeenCalledWith(
				'Your account was deleted, but server-side cover cleanup did not finish. Contact the project owner if a cover remains accessible.',
				{ duration: 30000 }
			)
		})

		it('returns a controlled result when recent authentication is required', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Sign in again before deleting your account.',
					code: 'recent_authentication_required'
				}),
				{ status: 403 }
			)
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'recent-auth-required' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).not.toHaveBeenCalledWith(
				'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
		})

		it('rejects the recent-auth code when the response is not HTTP 403', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Your account could not be deleted. Please try again.',
					code: 'recent_authentication_required'
				}),
				{ status: 500 }
			)
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockSupaUser.value).not.toBeNull()
			expect(mockToast.error).toHaveBeenCalledWith(
				'Your account could not be deleted. Please try again.',
				{ duration: 30000 }
			)
		})

		it('does not infer recent authentication from an uncontrolled error', async () => {
			const store = useUserStore()
			const response = new Response(
				JSON.stringify({
					error: 'Sign in again before deleting your account.'
				}),
				{ status: 403 }
			)
			mockAccountBoundSupabaseClient.functions.invoke.mockResolvedValue({
				data: null,
				error: { context: response }
			})

			const result = await store.deleteAccount('test@example.com')

			expect(result).toEqual({ status: 'failed' })
			expect(mockToast.error).toHaveBeenCalledWith(
				'Sign in again before deleting your account.',
				{ duration: 30000 }
			)
		})

		it('keeps account deletion single-flight', async () => {
			const store = useUserStore()
			const deletion = createDeferred<{
				data: { success: true }
				error: null
			}>()
			mockAccountBoundSupabaseClient.functions.invoke.mockReturnValueOnce(
				deletion.promise
			)

			const firstResult = store.deleteAccount('test@example.com')
			await Promise.resolve()
			await Promise.resolve()
			const secondResult = await store.deleteAccount('test@example.com')

			expect(secondResult).toEqual({ status: 'failed' })
			expect(
				mockAccountBoundSupabaseClient.functions.invoke
			).toHaveBeenCalledOnce()

			deletion.resolve({ data: { success: true }, error: null })
			await expect(firstResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
		})

		it('does not dispatch after the initiating identity is replaced', async () => {
			const getUserRequest = createDeferred<{
				data: { user: { id: string; email: string } }
				error: null
			}>()
			const store = useUserStore()
			mockSupabaseClient.auth.getUser.mockReturnValueOnce(
				getUserRequest.promise
			)

			const deletion = store.deleteAccount('test@example.com')
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			getUserRequest.resolve({
				data: {
					user: { id: 'test-user-id', email: 'test@example.com' }
				},
				error: null
			})

			await expect(deletion).resolves.toEqual({ status: 'failed' })
			expect(
				mockAccountBoundSupabaseClient.functions.invoke
			).not.toHaveBeenCalled()
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockRouter.replace).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('keeps replacement-account deletion active when stale success settles', async () => {
			const firstDeletion = createDeferred<{
				data: { success: true }
				error: null
			}>()
			const secondDeletion = createDeferred<{
				data: { success: true }
				error: null
			}>()
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				ui_theme: 'dark'
			})
			mockAccountBoundSupabaseClient.functions.invoke
				.mockReturnValueOnce(firstDeletion.promise)
				.mockReturnValueOnce(secondDeletion.promise)
			const store = useUserStore()

			const accountAResult = store.deleteAccount('test@example.com')
			await drainLifecycleTasks()
			expect(store.isDeletingAccount).toBe(true)

			mockQueryBuilder.single.mockResolvedValueOnce({
				data: replacementProfile,
				error: null
			})
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			expect(store.profile).toEqual(replacementProfile)
			expect(store.isDeletingAccount).toBe(false)

			const accountBResult = store.deleteAccount('replacement@example.com')
			await drainLifecycleTasks()
			expect(store.isDeletingAccount).toBe(true)

			firstDeletion.resolve({ data: { success: true }, error: null })
			await expect(accountAResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(store.isDeletingAccount).toBe(true)
			expect(store.profile).toEqual(replacementProfile)
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockRouter.replace).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()

			secondDeletion.resolve({ data: { success: true }, error: null })
			await expect(accountBResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(store.isDeletingAccount).toBe(false)
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledOnce()
			expect(mockRouter.replace).toHaveBeenCalledWith('/login')
		})

		it('does not clean up again when the initiating account signs out', async () => {
			const deletion = createDeferred<{
				data: { success: true }
				error: null
			}>()
			mockAccountBoundSupabaseClient.functions.invoke.mockReturnValueOnce(
				deletion.promise
			)
			const store = useUserStore()
			store.profile = createMockProfile({ id: 'test-user-id' })

			const accountAResult = store.deleteAccount('test@example.com')
			await drainLifecycleTasks()
			expect(store.isDeletingAccount).toBe(true)

			mockSupaUser.value = null
			await drainLifecycleTasks()
			expect(store.profile).toBeNull()
			expect(store.isDeletingAccount).toBe(false)

			deletion.resolve({ data: { success: true }, error: null })
			await expect(accountAResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(mockSupabaseClient.auth.signOut).not.toHaveBeenCalled()
			expect(mockRouter.replace).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})

		it('does not publish an old Edge failure into the replacement account', async () => {
			const deletion = createDeferred<{
				data: null
				error: { context: Response }
			}>()
			mockAccountBoundSupabaseClient.functions.invoke.mockReturnValueOnce(
				deletion.promise
			)
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				ui_theme: 'dark'
			})
			const store = useUserStore()
			const accountAResult = store.deleteAccount('test@example.com')
			await drainLifecycleTasks()

			mockQueryBuilder.single.mockResolvedValueOnce({
				data: replacementProfile,
				error: null
			})
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			deletion.resolve({
				data: null,
				error: {
					context: new Response(JSON.stringify({ error: 'Private failure' }), {
						status: 503
					})
				}
			})

			await expect(accountAResult).resolves.toEqual({ status: 'failed' })
			expect(store.profile).toEqual(replacementProfile)
			expect(mockToast.error).not.toHaveBeenCalled()
			expect(mockRouter.replace).not.toHaveBeenCalled()
		})

		it('does not clear a replacement account while local sign-out settles', async () => {
			const signOut = createDeferred<{ error: null }>()
			mockSupabaseClient.auth.signOut.mockReturnValueOnce(signOut.promise)
			const replacementProfile = createMockProfile({
				id: 'replacement-user-id',
				ui_theme: 'dark'
			})
			const store = useUserStore()
			const accountAResult = store.deleteAccount('test@example.com')
			await drainLifecycleTasks()
			expect(mockSupabaseClient.auth.signOut).toHaveBeenCalledOnce()

			mockQueryBuilder.single.mockResolvedValueOnce({
				data: replacementProfile,
				error: null
			})
			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await drainLifecycleTasks()
			signOut.resolve({ error: null })

			await expect(accountAResult).resolves.toEqual({
				status: 'deleted',
				coverCleanupComplete: true
			})
			expect(store.profile).toEqual(replacementProfile)
			expect(mockRouter.replace).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.warning).not.toHaveBeenCalled()
		})
	})

	describe('sendPasswordResetEmail', () => {
		it('returns true on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.sendPasswordResetEmail('test@example.com')

			expect(result).toBe(true)
		})

		it('sends to correct redirect URL', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			})

			await store.sendPasswordResetEmail('test@example.com')

			expect(
				mockSupabaseClient.auth.resetPasswordForEmail
			).toHaveBeenCalledWith('test@example.com', {
				redirectTo: 'https://example.com/update-password?redirect=%2F'
			})
		})

		it('preserves a safe destination in the recovery link', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: {},
				error: null
			})

			await store.sendPasswordResetEmail(
				'test@example.com',
				'/records?crate=house#release-1'
			)

			expect(
				mockSupabaseClient.auth.resetPasswordForEmail
			).toHaveBeenCalledWith('test@example.com', {
				redirectTo:
					'https://example.com/update-password?redirect=%2Frecords%3Fcrate%3Dhouse%23release-1'
			})
		})

		it('returns false on error', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.resetPasswordForEmail.mockResolvedValue({
				data: null,
				error: { message: 'Email not found' }
			})

			const result = await store.sendPasswordResetEmail('unknown@example.com')

			expect(result).toBe(false)
		})
	})

	describe('resetPassword', () => {
		it('returns true, navigates home, and consumes recovery on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.resetPassword('Password123')

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/')
			expect(mockPasswordRecovery.consume).toHaveBeenCalledOnce()
		})

		it('returns to the safe requested destination on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})

			await store.resetPassword('Password123', '/records?crate=house#release-1')

			expect(mockRouter.push).toHaveBeenCalledWith(
				'/records?crate=house#release-1'
			)
		})

		it('returns false and keeps recovery active on update errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: null,
				error: { message: 'Password too weak' }
			})

			const result = await store.resetPassword('weak')

			expect(result).toBe(false)
			expect(mockRouter.push).not.toHaveBeenCalled()
			expect(mockPasswordRecovery.consume).not.toHaveBeenCalled()
		})

		it('returns true and consumes recovery when navigation fails after update', async () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => undefined)
			const store = useUserStore()
			mockSupabaseClient.auth.updateUser.mockResolvedValue({
				data: {},
				error: null
			})
			mockRouter.push.mockRejectedValueOnce(new Error('Navigation unavailable'))

			try {
				const result = await store.resetPassword('Password123')

				expect(result).toBe(true)
				expect(mockPasswordRecovery.consume).toHaveBeenCalledOnce()
				expect(mockToast.success).not.toHaveBeenCalledWith(
					'Password reset successful!'
				)
				expect(mockToast.error).toHaveBeenCalledWith(
					'Your password was reset, but the requested page could not open.',
					{ duration: 30000 }
				)
			} finally {
				consoleError.mockRestore()
			}
		})
	})

	describe('verifyOtp', () => {
		it('navigates to home on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp('token-hash', 'email')

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/')
			expect(mockPasswordRecovery.activate).not.toHaveBeenCalled()
		})

		it('navigates to a safe requested destination on success', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp(
				'token-hash',
				'email',
				'/records?crate=house'
			)

			expect(result).toBe(true)
			expect(mockRouter.push).toHaveBeenCalledWith('/records?crate=house')
		})

		it('activates recovery and navigates to password update for recovery OTPs', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: {},
				error: null
			})

			const result = await store.verifyOtp('recovery-token-hash', 'recovery')

			expect(result).toBe(true)
			expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
				token_hash: 'recovery-token-hash',
				type: 'recovery'
			})
			expect(mockPasswordRecovery.activate).toHaveBeenCalledOnce()
			expect(mockRouter.push).toHaveBeenCalledWith(
				'/update-password?redirect=%2F'
			)
			expect(mockRouter.push).not.toHaveBeenCalledWith('/')
			expect(mockToast.success).not.toHaveBeenCalled()
		})

		it('handles verification errors', async () => {
			const store = useUserStore()
			mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
				data: null,
				error: { message: 'Invalid OTP' }
			})

			const result = await store.verifyOtp('invalid', 'email')

			expect(result).toBe(false)
			expect(mockRouter.push).not.toHaveBeenCalled()
		})
	})

	describe('deleteAllUserData', () => {
		it('returns false when user is not signed in', async () => {
			const store = useUserStore()
			mockSupaUser.value = null

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
		})

		it('calls the transactional delete-all RPC', async () => {
			const store = useUserStore()

			await store.deleteAllUserData()

			expect(mockAccountBoundSupabaseClient.rpc).toHaveBeenCalledWith(
				'delete_all_user_data'
			)
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
		})

		it('does not construct or mutate unrelated stores on success', async () => {
			const store = useUserStore()

			await store.deleteAllUserData()

			expect(mockUseRecordsStore).not.toHaveBeenCalled()
			expect(mockUseTracksStore).not.toHaveBeenCalled()
			expect(mockUseCratesStore).not.toHaveBeenCalled()
			expect(mockUseSessionStore).not.toHaveBeenCalled()
		})

		it('returns true on success', async () => {
			const store = useUserStore()

			const result = await store.deleteAllUserData()

			expect(result).toBe(true)
		})

		it('returns false on rpc error', async () => {
			const store = useUserStore()
			mockAccountBoundSupabaseClient.rpc.mockResolvedValue({
				data: null,
				error: new Error('Delete failed')
			})

			const result = await store.deleteAllUserData()

			expect(result).toBe(false)
			expect(mockUseRecordsStore).not.toHaveBeenCalled()
			expect(mockUseTracksStore).not.toHaveBeenCalled()
			expect(mockUseCratesStore).not.toHaveBeenCalled()
			expect(mockUseSessionStore).not.toHaveBeenCalled()
		})

		it.each([
			{ label: 'success', error: null },
			{ label: 'failure', error: new Error('Delete failed') }
		])(
			'rejects stale $label without replacement-account feedback',
			async ({ error }) => {
				const response = createDeferred<{ data: null; error: Error | null }>()
				mockAccountBoundSupabaseClient.rpc.mockReturnValueOnce(response.promise)
				const store = useUserStore()
				const deletion = store.deleteAllUserData('test-user-id')
				await vi.waitFor(() => {
					expect(mockAccountBoundSupabaseClient.rpc).toHaveBeenCalledWith(
						'delete_all_user_data'
					)
				})
				mockToast.success.mockClear()
				mockToast.error.mockClear()

				mockSupaUser.value = {
					id: 'replacement-user-id',
					email: 'replacement@example.com'
				}
				response.resolve({ data: null, error })

				await expect(deletion).resolves.toBe(false)
				expect(mockToast.success).not.toHaveBeenCalled()
				expect(mockToast.error).not.toHaveBeenCalled()
			}
		)

		it('keeps the destructive RPC bound to A when B arrives during token lookup', async () => {
			const beginTokenLookup = createDeferred<undefined>()
			let accessToken: (() => Promise<string>) | undefined
			let observedToken: string | undefined
			mockCreateSupabaseClient.mockImplementationOnce(
				(_url, _key, options: { accessToken: () => Promise<string> }) => {
					accessToken = options.accessToken
					return mockAccountBoundSupabaseClient
				}
			)
			mockAccountBoundSupabaseClient.rpc.mockImplementationOnce(async () => {
				await beginTokenLookup.promise
				observedToken = await accessToken?.()
				return { data: null, error: null }
			})
			const store = useUserStore()
			const deletion = store.deleteAllUserData('test-user-id')
			await vi.waitFor(() =>
				expect(mockAccountBoundSupabaseClient.rpc).toHaveBeenCalledWith(
					'delete_all_user_data'
				)
			)

			mockSupaUser.value = {
				id: 'replacement-user-id',
				email: 'replacement@example.com'
			}
			await nextTick()
			beginTokenLookup.resolve(undefined)

			await expect(deletion).resolves.toBe(false)
			expect(observedToken).toBe('token:test-user-id')
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
			expect(mockToast.success).not.toHaveBeenCalled()
			expect(mockToast.error).not.toHaveBeenCalled()
		})

		it('rejects an expected account mismatch before the RPC', async () => {
			const store = useUserStore()

			await expect(
				store.deleteAllUserData('replacement-user-id')
			).resolves.toBe(false)
			expect(mockAccountBoundSupabaseClient.rpc).not.toHaveBeenCalled()
			expect(mockSupabaseClient.rpc).not.toHaveBeenCalled()
		})
	})
})
