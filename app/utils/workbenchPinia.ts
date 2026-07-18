import type { InjectionKey } from 'vue'
import type { Pinia } from 'pinia'

export type WorkbenchCapabilities = {
	mode: 'app' | 'demo'
	canPersistSessions: boolean
	canMutateLibrary: boolean
	canManageCrates: boolean
	canConnectDiscogs: boolean
	canEnrichTracks: boolean
	canManageAccount: boolean
}

export const appWorkbenchCapabilities: WorkbenchCapabilities = {
	mode: 'app',
	canPersistSessions: true,
	canMutateLibrary: true,
	canManageCrates: true,
	canConnectDiscogs: true,
	canEnrichTracks: true,
	canManageAccount: true
}

export const demoWorkbenchCapabilities: WorkbenchCapabilities = {
	mode: 'demo',
	canPersistSessions: false,
	canMutateLibrary: false,
	canManageCrates: false,
	canConnectDiscogs: false,
	canEnrichTracks: false,
	canManageAccount: false
}

export const workbenchPiniaKey: InjectionKey<Pinia> = Symbol('workbench-pinia')
export const workbenchCapabilitiesKey: InjectionKey<WorkbenchCapabilities> =
	Symbol('workbench-capabilities')

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
