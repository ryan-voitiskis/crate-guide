import { requiresCloudWorkbenchRuntime } from '~/utils/workbenchRuntimeAvailability'

export default defineNuxtPlugin(async () => {
	const pinia = usePinia()
	let loadOperation: Promise<void> | null = null

	function loadCloudWorkbenchRuntime(): Promise<void> {
		if (getWorkbenchRuntime(pinia)) return Promise.resolve()
		if (loadOperation) return loadOperation
		loadOperation = import('~/utils/cloudWorkbenchRuntime').then(
			({ ensureCloudWorkbenchRuntime }) => {
				registerWorkbenchRuntimeFactory(ensureCloudWorkbenchRuntime)
				ensureCloudWorkbenchRuntime(pinia)
			}
		)
		return loadOperation
	}

	const router = useRouter()
	router.beforeEach(async (to) => {
		if (requiresCloudWorkbenchRuntime(to.path)) {
			await loadCloudWorkbenchRuntime()
		}
	})

	if (requiresCloudWorkbenchRuntime(window.location.pathname)) {
		await loadCloudWorkbenchRuntime()
	}
})
