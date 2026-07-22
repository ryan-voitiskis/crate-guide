export default defineNuxtPlugin(() => {
	ensureCloudWorkbenchRuntime(usePinia())
})
