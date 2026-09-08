import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function localModule(importer: string, specifier: string): string | null {
	const base = specifier.startsWith('~/')
		? resolve(root, 'app', specifier.slice(2))
		: specifier.startsWith('~~/')
			? resolve(root, specifier.slice(3))
			: specifier.startsWith('.')
				? resolve(dirname(importer), specifier)
				: null
	if (!base) return null
	const file = [
		base + '.ts',
		base + '.mjs',
		resolve(base, 'index.ts'),
		base
	].find(
		(candidate) => existsSync(candidate) && /\.(?:ts|mjs|json)$/.test(candidate)
	)
	if (!file)
		throw new Error(
			`Cannot resolve ${specifier} from ${relative(root, importer)}`
		)
	return file
}

function dependencies(file: string, runtimeOnly: boolean) {
	const parsed = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true
	)
	const results: string[] = []
	function visit(node: ts.Node) {
		let specifier: ts.Expression | undefined
		if (ts.isImportDeclaration(node)) {
			const clause = node.importClause
			const bindings = clause?.namedBindings
			const typesOnly =
				clause?.isTypeOnly ||
				(clause &&
					!clause.name &&
					bindings &&
					ts.isNamedImports(bindings) &&
					bindings.elements.length > 0 &&
					bindings.elements.every((entry) => entry.isTypeOnly))
			if (!(runtimeOnly && typesOnly)) specifier = node.moduleSpecifier
		} else if (ts.isExportDeclaration(node)) {
			const typesOnly =
				node.isTypeOnly ||
				(node.exportClause &&
					ts.isNamedExports(node.exportClause) &&
					node.exportClause.elements.length > 0 &&
					node.exportClause.elements.every((entry) => entry.isTypeOnly))
			if (!(runtimeOnly && typesOnly)) specifier = node.moduleSpecifier
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword
		) {
			specifier = node.arguments[0]
		}
		if (specifier && ts.isStringLiteral(specifier)) {
			const dependency = localModule(file, specifier.text)
			if (dependency) results.push(dependency)
		}
		ts.forEachChild(node, visit)
	}
	visit(parsed)
	return results
}

function runtimeGraph(entry: string) {
	const seen = new Set<string>()
	const pending = [resolve(root, entry)]
	while (pending.length) {
		const file = pending.pop()!
		if (seen.has(file)) continue
		seen.add(file)
		pending.push(...dependencies(file, true))
	}
	return [...seen].map((file) => relative(root, file))
}

describe('active device-draft dependency boundary', () => {
	it('has no runtime dependency on deferred workspace catalog, library, or export/copy operations', () => {
		const graph = runtimeGraph('app/repositories/deviceDrafts/index.ts')
		expect(graph).toContain(
			'app/repositories/library/browser/browserDraftReads.ts'
		)
		expect(graph).toContain(
			'app/repositories/library/browser/browserLibrarySchema.ts'
		)
		for (const module of [
			'browserWorkspaceCatalog.ts',
			'browserLibraryRepository.ts',
			'browserWorkspaceOperations.ts'
		]) {
			expect(
				graph.some((file) => file.endsWith('/' + module)),
				`${module} crossed the active draft boundary`
			).toBe(false)
		}
	})

	it('keeps the active application consumers on the explicit draft API', () => {
		for (const file of [
			'app/composables/useTrackEnrichmentDraftSession.ts',
			'app/utils/trackEnrichmentDraftWorkspaceIdentity.ts'
		]) {
			const imports = dependencies(resolve(root, file), false).map((path) =>
				relative(root, path)
			)
			expect(
				imports.some((path) =>
					path.startsWith('app/repositories/library/browser/')
				),
				file
			).toBe(false)
			expect(imports).toContain('app/repositories/deviceDrafts/contracts.ts')
		}
	})
})
