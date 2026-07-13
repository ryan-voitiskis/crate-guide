import { isPublicRoute, isSignedOutOnlyRoute } from '../utils/authRoutes'

export default defineNuxtRouteMiddleware(async (to) => {
	const user = useSupabaseUser()
	const supabase = useSupabaseClient()

	if (user.value && isSignedOutOnlyRoute(to.path)) {
		return navigateTo('/')
	}

	if (!user.value && !isPublicRoute(to.path)) {
		const { data, error } = await supabase.auth.getSession()
		if (error) {
			console.error('Failed to restore session:', error)
			throw createError({
				statusCode: 503,
				statusMessage: 'Failed to verify session'
			})
		}
		if (data.session?.user) return
		return navigateTo('/login')
	}
})
