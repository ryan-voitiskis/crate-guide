export default defineNuxtRouteMiddleware((to) => {
	const user = useSupabaseUser()

	const publicRoutes = ['/login', '/signup', '/reset-password']
	const isPublicRoute =
		publicRoutes.includes(to.path) ||
		to.path.startsWith('/auth/') ||
		to.path.startsWith('/demo')

	if (!user.value && !isPublicRoute) {
		return navigateTo('/login')
	}
})
