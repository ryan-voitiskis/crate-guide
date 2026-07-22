import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { getSavedAnonymousThemePreference, setTheme } from '~/utils/setTheme'
import {
	type WorkbenchRuntime,
	ensureWorkbenchRuntime,
	getWorkbenchRuntime,
	getWorkbenchStorePinia
} from '~/utils/workbenchPinia'
import { writeWorkspaceThemeMirror } from '~/utils/workspaceThemeMirror'
import type { LibraryPreferences } from '~~/shared/types/library'

export const DEFAULT_LIBRARY_PREFERENCES: LibraryPreferences = {
	ui_theme: 'auto',
	key_format: 'key',
	list_layout: 'cover',
	selected_crate: '',
	turntable_pitch_range: 8,
	turntable_theme: 'silver'
}

type CapturedWorkbench = ReturnType<WorkbenchRuntime['capture']>

type PendingPreferenceUpdate = {
	id: number
	stateGeneration: number
	captured: CapturedWorkbench
	patch: Partial<LibraryPreferences>
}

const MAX_READ_ATTEMPTS = 3

export const useLibraryPreferencesStore = defineStore(
	'library-preferences',
	() => {
		const pinia = getWorkbenchStorePinia()
		const runtime = getWorkbenchRuntime(pinia) ?? ensureWorkbenchRuntime(pinia!)
		const authoritativePreferences = ref<LibraryPreferences>({
			...DEFAULT_LIBRARY_PREFERENCES
		})
		const preferences = ref<LibraryPreferences>({
			...DEFAULT_LIBRARY_PREFERENCES
		})
		const ephemeralOverrides = ref<Partial<LibraryPreferences>>({})
		const hydratedWorkspaceId = ref<string | null>(null)
		const isLoadingPreferences = ref(false)
		const isUpdatingPreferences = ref(false)
		const pendingUpdates = new Map<number, PendingPreferenceUpdate>()
		let stateGeneration = 0
		let nextUpdateId = 0
		let loadOperation: {
			context: CapturedWorkbench['context']
			promise: Promise<boolean>
		} | null = null
		let updateQueue: Promise<boolean> = Promise.resolve(true)

		function isSameContext(
			left: CapturedWorkbench['context'],
			right: CapturedWorkbench['context']
		): boolean {
			return (
				left.workspaceId === right.workspaceId &&
				left.repositoryId === right.repositoryId &&
				left.activationGeneration === right.activationGeneration
			)
		}

		function isCurrentOperation(
			captured: CapturedWorkbench,
			operationGeneration: number
		): boolean {
			return (
				operationGeneration === stateGeneration &&
				runtime.isCurrent(captured.context)
			)
		}

		function getEffectivePreferences(
			captured: CapturedWorkbench,
			base: LibraryPreferences
		): LibraryPreferences {
			let effective = { ...base }
			if (captured.descriptor.location === 'demo') {
				effective = { ...effective, ...ephemeralOverrides.value }
			}
			for (const pending of pendingUpdates.values()) {
				if (
					pending.stateGeneration === stateGeneration &&
					isSameContext(pending.captured.context, captured.context)
				) {
					effective = { ...effective, ...pending.patch }
				}
			}
			return effective
		}

		function publishEffective(
			captured: CapturedWorkbench,
			options: { mirrorAuthoritativeTheme?: boolean } = {}
		): boolean {
			if (!runtime.isCurrent(captured.context)) return false
			const effective = getEffectivePreferences(
				captured,
				authoritativePreferences.value
			)
			preferences.value = effective
			hydratedWorkspaceId.value = captured.descriptor.id
			setTheme(effective.ui_theme)
			if (options.mirrorAuthoritativeTheme) {
				writeWorkspaceThemeMirror(
					captured.descriptor.id,
					authoritativePreferences.value.ui_theme
				)
			}
			return true
		}

		function publishAuthoritative(
			captured: CapturedWorkbench,
			nextPreferences: LibraryPreferences,
			options: { mirrorTheme?: boolean } = {}
		): boolean {
			if (!runtime.isCurrent(captured.context)) return false
			authoritativePreferences.value = { ...nextPreferences }
			return publishEffective(captured, {
				mirrorAuthoritativeTheme: options.mirrorTheme
			})
		}

		async function readWithRetry(
			initial: CapturedWorkbench,
			operationGeneration: number
		): Promise<{
			captured: CapturedWorkbench
			value: LibraryPreferences
		} | null> {
			let attempt = initial
			for (
				let attemptIndex = 0;
				attemptIndex < MAX_READ_ATTEMPTS;
				attemptIndex += 1
			) {
				if (!isCurrentOperation(attempt, operationGeneration)) return null
				const outcome = await attempt.repositories.preferences.read(
					attempt.context
				)
				if (!isCurrentOperation(attempt, operationGeneration)) return null
				if (outcome.status === 'success') {
					if (
						!runtime.acceptRepositoryRevision(
							attempt.context,
							outcome.repositoryRevision
						)
					)
						return null
					return { captured: attempt, value: outcome.value }
				}
				if (outcome.status !== 'stale') return null
				const nextAttempt = runtime.capture()
				if (
					!isSameContext(initial.context, nextAttempt.context) ||
					!isCurrentOperation(nextAttempt, operationGeneration)
				)
					return null
				attempt = nextAttempt
			}
			return null
		}

		function replacePreferences(nextPreferences: LibraryPreferences): void {
			const captured = runtime.capture()
			ephemeralOverrides.value = {}
			publishAuthoritative(captured, nextPreferences, {
				mirrorTheme: captured.descriptor.location !== 'demo'
			})
		}

		function fetchPreferences(): Promise<boolean> {
			const captured = runtime.capture()
			if (
				loadOperation &&
				isSameContext(loadOperation.context, captured.context)
			) {
				return loadOperation.promise
			}
			const operationGeneration = stateGeneration
			isLoadingPreferences.value = true
			const created = readWithRetry(captured, operationGeneration)
				.then((result) => {
					if (!result) return false
					return publishAuthoritative(result.captured, result.value, {
						mirrorTheme: result.captured.descriptor.location !== 'demo'
					})
				})
				.finally(() => {
					if (loadOperation?.promise !== created) return
					loadOperation = null
					isLoadingPreferences.value = false
				})
			loadOperation = { context: captured.context, promise: created }
			return created
		}

		function hasCurrentPendingUpdates(): boolean {
			const current = runtime.capture()
			return [...pendingUpdates.values()].some(
				(pending) =>
					pending.stateGeneration === stateGeneration &&
					isSameContext(pending.captured.context, current.context)
			)
		}

		function removePendingUpdate(update: PendingPreferenceUpdate): void {
			pendingUpdates.delete(update.id)
			isUpdatingPreferences.value = hasCurrentPendingUpdates()
		}

		function updatePreferences(
			patch: Partial<LibraryPreferences>
		): Promise<boolean> {
			const captured = runtime.capture()
			const requestedPatch = { ...patch }
			if (captured.descriptor.location === 'demo') {
				ephemeralOverrides.value = {
					...ephemeralOverrides.value,
					...requestedPatch
				}
				publishEffective(captured)
				return Promise.resolve(true)
			}
			if (captured.descriptor.readOnly) return Promise.resolve(false)

			const update: PendingPreferenceUpdate = {
				id: ++nextUpdateId,
				stateGeneration,
				captured,
				patch: requestedPatch
			}
			pendingUpdates.set(update.id, update)
			isUpdatingPreferences.value = true
			publishEffective(captured)

			const run = async (): Promise<boolean> => {
				if (!isCurrentOperation(captured, update.stateGeneration)) {
					removePendingUpdate(update)
					return false
				}
				try {
					const outcome = await captured.repositories.preferences.update(
						captured.context,
						requestedPatch
					)
					if (!isCurrentOperation(captured, update.stateGeneration)) {
						removePendingUpdate(update)
						return false
					}
					if (
						outcome.status === 'success' &&
						runtime.acceptRepositoryRevision(
							captured.context,
							outcome.repositoryRevision
						)
					) {
						removePendingUpdate(update)
						return publishAuthoritative(captured, outcome.value, {
							mirrorTheme: true
						})
					}

					removePendingUpdate(update)
					const recovery = await readWithRetry(captured, update.stateGeneration)
					if (!isCurrentOperation(captured, update.stateGeneration))
						return false
					if (recovery) {
						publishAuthoritative(recovery.captured, recovery.value, {
							mirrorTheme: true
						})
					} else {
						publishEffective(captured)
					}
					toast.error('Your preferences could not be saved. Please try again.')
					return false
				} catch (error) {
					removePendingUpdate(update)
					if (!isCurrentOperation(captured, update.stateGeneration))
						return false
					console.error('Failed to update library preferences:', error)
					const recovery = await readWithRetry(captured, update.stateGeneration)
					if (!isCurrentOperation(captured, update.stateGeneration))
						return false
					if (recovery) {
						publishAuthoritative(recovery.captured, recovery.value, {
							mirrorTheme: true
						})
					} else {
						publishEffective(captured)
					}
					toast.error('Your preferences could not be saved. Please try again.')
					return false
				}
			}
			updateQueue = updateQueue.then(run, run)
			return updateQueue
		}

		function clearPreferences(): void {
			stateGeneration += 1
			loadOperation = null
			updateQueue = Promise.resolve(true)
			pendingUpdates.clear()
			ephemeralOverrides.value = {}
			isLoadingPreferences.value = false
			isUpdatingPreferences.value = false
			hydratedWorkspaceId.value = null
			authoritativePreferences.value = {
				...DEFAULT_LIBRARY_PREFERENCES
			}
			preferences.value = { ...DEFAULT_LIBRARY_PREFERENCES }
			setTheme(getSavedAnonymousThemePreference() ?? 'auto')
		}

		const currentTheme = computed(() => preferences.value.ui_theme)
		const currentKeyFormat = computed(() => preferences.value.key_format)

		return {
			preferences,
			hydratedWorkspaceId,
			isLoadingPreferences,
			isUpdatingPreferences,
			currentTheme,
			currentKeyFormat,
			fetchPreferences,
			updatePreferences,
			replacePreferences,
			clearPreferences
		}
	}
)
