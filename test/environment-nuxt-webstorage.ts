import nuxtEnvironment from '@nuxt/test-utils/vitest-environment'
import type { Environment } from 'vitest/environments'

const webStorageNames = ['localStorage', 'sessionStorage'] as const

type WebStorageName = (typeof webStorageNames)[number]
type RemovedDescriptor = readonly [WebStorageName, PropertyDescriptor]

const nodeWebStorageDescriptors = new Map<
	WebStorageName,
	PropertyDescriptor | undefined
>(
	webStorageNames.map(
		(name): [WebStorageName, PropertyDescriptor | undefined] => [
			name,
			Object.getOwnPropertyDescriptor(globalThis, name)
		]
	)
)

function isNodeWebStorageAccessor(
	name: WebStorageName,
	descriptor: PropertyDescriptor
): boolean {
	const nodeDescriptor = nodeWebStorageDescriptors.get(name)
	if (!nodeDescriptor) return false

	return (
		descriptor.configurable === true &&
		nodeDescriptor.configurable === true &&
		!Object.hasOwn(descriptor, 'value') &&
		!Object.hasOwn(nodeDescriptor, 'value') &&
		typeof descriptor.get === 'function' &&
		typeof descriptor.set === 'function' &&
		descriptor.get === nodeDescriptor.get &&
		descriptor.set === nodeDescriptor.set
	)
}

function removeNodeWebStorageAccessors(
	global: typeof globalThis
): RemovedDescriptor[] {
	const removed: RemovedDescriptor[] = []

	for (const name of webStorageNames) {
		const descriptor = Object.getOwnPropertyDescriptor(global, name)
		if (!descriptor || !isNodeWebStorageAccessor(name, descriptor)) continue

		if (!Reflect.deleteProperty(global, name) || Object.hasOwn(global, name)) {
			throw new Error(`Could not remove Node's ${name} accessor`)
		}

		removed.push([name, descriptor])
	}

	return removed
}

function restoreNodeWebStorageAccessors(
	global: typeof globalThis,
	removed: RemovedDescriptor[]
): void {
	for (const [name, descriptor] of removed) {
		if (Object.hasOwn(global, name)) {
			throw new Error(`Refusing to overwrite an environment-owned ${name}`)
		}

		Object.defineProperty(global, name, descriptor)
	}
}

const environment: Environment = {
	...nuxtEnvironment,
	async setup(global, options) {
		const removed = removeNodeWebStorageAccessors(global)

		let nuxtSetup
		try {
			nuxtSetup = await nuxtEnvironment.setup(global, options)
		} catch (error) {
			restoreNodeWebStorageAccessors(global, removed)
			throw error
		}

		return {
			async teardown(teardownGlobal) {
				try {
					await nuxtSetup.teardown(teardownGlobal)
				} finally {
					restoreNodeWebStorageAccessors(global, removed)
				}
			}
		}
	}
}

export default environment
