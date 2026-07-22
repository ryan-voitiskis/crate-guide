import { type InjectionKey, type Ref, readonly, shallowRef } from 'vue'
import { type Pinia, getActivePinia, setActivePinia } from 'pinia'
import type {
	LibraryRepositoryBundle,
	WorkbenchCapabilities,
	WorkspaceDescriptor,
	WorkspaceOperationContext
} from '~/repositories/library/contracts'

export const appWorkbenchCapabilities: WorkbenchCapabilities = {
	location: 'cloud',
	canPersistSessions: true,
	canMutateLibrary: true,
	canManageCrates: true,
	canConnectDiscogs: true,
	canEnrichTracks: true,
	canManageAccount: true
}

export const demoWorkbenchCapabilities: WorkbenchCapabilities = {
	location: 'demo',
	canPersistSessions: false,
	canMutateLibrary: false,
	canManageCrates: false,
	canConnectDiscogs: false,
	canEnrichTracks: false,
	canManageAccount: false
}

export const browserUnavailableWorkbenchCapabilities: WorkbenchCapabilities = {
	location: 'browser',
	canPersistSessions: false,
	canMutateLibrary: false,
	canManageCrates: false,
	canConnectDiscogs: false,
	canEnrichTracks: false,
	canManageAccount: false
}

export type CapturedWorkbench = Readonly<{
	context: WorkspaceOperationContext
	descriptor: WorkspaceDescriptor
	repositories: LibraryRepositoryBundle
}>

export type WorkbenchRuntime = {
	readonly descriptor: Readonly<Ref<WorkspaceDescriptor>>
	capture(): CapturedWorkbench
	isCurrent(context: WorkspaceOperationContext): boolean
	acceptRepositoryRevision(
		context: WorkspaceOperationContext,
		repositoryRevision: number
	): boolean
	replaceWorkspace(
		descriptor: WorkspaceDescriptor,
		repositories: LibraryRepositoryBundle
	): void
	invalidate(): void
}

export function createWorkbenchRuntime(
	initialDescriptor: WorkspaceDescriptor,
	initialRepositories: LibraryRepositoryBundle
): WorkbenchRuntime {
	const descriptor = shallowRef(initialDescriptor)
	let repositories = initialRepositories
	let activationGeneration = 0

	function capture(): CapturedWorkbench {
		const capturedDescriptor = descriptor.value
		return {
			descriptor: capturedDescriptor,
			repositories,
			context: {
				workspaceId: capturedDescriptor.id,
				repositoryId: capturedDescriptor.repositoryId,
				activationGeneration
			}
		}
	}

	function isCurrent(context: WorkspaceOperationContext): boolean {
		return (
			context.activationGeneration === activationGeneration &&
			context.workspaceId === descriptor.value.id &&
			context.repositoryId === descriptor.value.repositoryId &&
			context.repositoryId === repositories.id
		)
	}

	function acceptRepositoryRevision(
		context: WorkspaceOperationContext,
		repositoryRevision: number
	): boolean {
		if (!isCurrent(context)) return false
		if (
			!Number.isSafeInteger(repositoryRevision) ||
			repositoryRevision < descriptor.value.repositoryRevision
		)
			return false
		descriptor.value = { ...descriptor.value, repositoryRevision }
		return true
	}

	function replaceWorkspace(
		nextDescriptor: WorkspaceDescriptor,
		nextRepositories: LibraryRepositoryBundle
	): void {
		activationGeneration += 1
		repositories = nextRepositories
		descriptor.value = nextDescriptor
	}

	function invalidate(): void {
		activationGeneration += 1
	}

	return {
		descriptor: readonly(descriptor),
		capture,
		isCurrent,
		acceptRepositoryRevision,
		replaceWorkspace,
		invalidate
	}
}

export const workbenchPiniaKey: InjectionKey<Pinia> = Symbol('workbench-pinia')
export const workbenchCapabilitiesKey: InjectionKey<WorkbenchCapabilities> =
	Symbol('workbench-capabilities')
export const workbenchRuntimeKey: InjectionKey<WorkbenchRuntime> =
	Symbol('workbench-runtime')

const runtimeByPinia = new WeakMap<Pinia, WorkbenchRuntime>()
type WorkbenchRuntimeFactory = (pinia: Pinia) => WorkbenchRuntime
let workbenchRuntimeFactory: WorkbenchRuntimeFactory | null = null
let explicitStorePinia: Pinia | undefined

export function bindWorkbenchRuntime(
	pinia: Pinia,
	runtime: WorkbenchRuntime
): void {
	runtimeByPinia.set(pinia, runtime)
}

export function getWorkbenchRuntime(
	pinia: Pinia | undefined
): WorkbenchRuntime | null {
	return pinia ? (runtimeByPinia.get(pinia) ?? null) : null
}

export function registerWorkbenchRuntimeFactory(
	factory: WorkbenchRuntimeFactory
): void {
	workbenchRuntimeFactory = factory
}

export function ensureWorkbenchRuntime(pinia: Pinia): WorkbenchRuntime {
	const existing = getWorkbenchRuntime(pinia)
	if (existing) return existing
	if (!workbenchRuntimeFactory) {
		throw new Error(
			'No workbench runtime is available. The route runtime must load before its stores.'
		)
	}
	return workbenchRuntimeFactory(pinia)
}

/**
 * Pinia's global active instance can differ from an explicitly selected
 * workbench. Store setup reads must run with the owning Pinia active so a Demo
 * store can never capture the application runtime or auth client.
 */
export function runWithActivePinia<T>(pinia: Pinia, operation: () => T): T {
	const previousPinia = getActivePinia()
	const previousExplicitPinia = explicitStorePinia
	explicitStorePinia = pinia
	setActivePinia(pinia)
	try {
		return operation()
	} finally {
		explicitStorePinia = previousExplicitPinia
		setActivePinia(previousPinia)
	}
}

export function getWorkbenchStorePinia(): Pinia | undefined {
	return explicitStorePinia ?? getActivePinia()
}

export function requireWorkbenchRuntime(
	pinia: Pinia | undefined
): WorkbenchRuntime {
	const runtime = getWorkbenchRuntime(pinia)
	if (!runtime)
		throw new Error('Workbench runtime has not been bound to Pinia.')
	return runtime
}

// Compatibility only while stores are migrated one at a time. The final store
// migration removes every call site in favor of the bound runtime.
const demoPiniaMarker = Symbol.for('crate-guide.demo-workbench')
type DemoPinia = Pinia & { [demoPiniaMarker]?: true }

export function markDemoWorkbenchPinia(pinia: Pinia): Pinia {
	Object.defineProperty(pinia, demoPiniaMarker, {
		value: true,
		enumerable: false
	})
	return pinia
}

export function isDemoWorkbenchPinia(pinia: Pinia | undefined): boolean {
	return Boolean((pinia as DemoPinia | undefined)?.[demoPiniaMarker])
}
