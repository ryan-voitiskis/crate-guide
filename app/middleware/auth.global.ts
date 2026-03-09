export default defineNuxtRouteMiddleware(async (to) => {
	const user = useSupabaseUser()
	const supabase = useSupabaseClient()

	const publicRoutes = ['/login', '/signup', '/reset-password']
	const isPublicRoute =
		publicRoutes.includes(to.path) ||
		to.path.startsWith('/auth/') ||
		to.path.startsWith('/demo')

	if (user.value && publicRoutes.includes(to.path)) {
		return navigateTo('/')
	}

	if (!user.value && !isPublicRoute) {
		const { data } = await supabase.auth.getSession()
		if (data.session?.user) return
		return navigateTo('/login')
	}
})
