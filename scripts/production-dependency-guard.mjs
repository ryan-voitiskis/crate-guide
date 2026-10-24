const excludedPackages = ['node-forge', 'listhen']

export function assertProductionModules(moduleIds) {
	for (const id of moduleIds) {
		const normalized = id.replaceAll('\\', '/').replace(/^\0/, '').split('?')[0]
		for (const name of excludedPackages) {
			if (
				normalized === name ||
				normalized.startsWith(`${name}/`) ||
				normalized.includes(`/node_modules/${name}/`) ||
				normalized.endsWith(`/node_modules/${name}`)
			)
				throw new Error(`${name} must not enter a production bundle.`)
		}
	}
}

export function productionDependencyGuard(target) {
	return {
		name: `crate-guide-production-dependencies-${target}`,
		generateBundle(_options, bundle) {
			let modules = 0
			for (const chunk of Object.values(bundle)) {
				if (chunk.type !== 'chunk') continue
				const ids = Object.keys(chunk.modules)
				assertProductionModules([
					...ids,
					...chunk.imports,
					...chunk.dynamicImports
				])
				modules += ids.length
			}
			console.log(
				`Production dependency guard passed for ${target} (${modules} rendered modules).`
			)
		}
	}
}
