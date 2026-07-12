export default defineNuxtRouteMiddleware(async (to) => {
	const user = useSupabaseUser()
	const supabase = useSupabaseClient()

	const publicRoutes = ['/login', '/signup', '/reset-password']
	const isPublicRoute =
		publicRoutes.includes(to.path) ||
		to.path.startsWith('/auth/') ||
		to.path === '/demo' ||
		to.path.startsWith('/demo/')

	if (user.value && publicRoutes.includes(to.path)) {
		return navigateTo('/')
	}

	if (!user.value && !isPublicRoute) {
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
