import {
	buildLoginRedirectPath,
	isPublicRoute,
	isSignedOutOnlyRoute,
	sanitizeAuthReturnPath
} from '../utils/authRoutes'

export default defineNuxtRouteMiddleware(async (to) => {
	const user = useSupabaseUser()
	const supabase = useSupabaseClient()

	if (user.value && isSignedOutOnlyRoute(to.path)) {
		return navigateTo(sanitizeAuthReturnPath(to.query.redirect))
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
		return navigateTo(buildLoginRedirectPath(to.fullPath))
	}
})
