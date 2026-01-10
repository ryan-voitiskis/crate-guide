export default defineNuxtRouteMiddleware((to) => {
	const user = useSupabaseUser()

	const publicRoutes = ['/login', '/signup', '/demo', '/reset-password']
	const isPublicRoute =
		publicRoutes.includes(to.path) || to.path.startsWith('/auth/')

	if (!user.value && !isPublicRoute) {
		return navigateTo('/login')
	}
})
