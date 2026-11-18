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

// The device-draft runtime may only reach the shared IndexedDB storage kernel
// (schema, codecs, broadcast, draft reads/writes) and the files it already
// depended on. Anything new in this graph is coupling to non-draft code.
const ALLOWED_RUNTIME_MODULES = [
	'app/repositories/deviceDrafts/index.ts',
	'app/repositories/library/browser/browserDeviceDraftRepository.ts',
	'app/repositories/library/browser/browserDraftReads.ts',
	'app/repositories/library/browser/browserDraftRevision.ts',
	'app/repositories/library/browser/browserLibraryBroadcast.ts',
	'app/repositories/library/browser/browserLibraryCodecs.ts',
	'app/repositories/library/browser/browserLibraryErrors.ts',
	'app/repositories/library/browser/browserLibraryRuntime.ts',
	'app/repositories/library/browser/browserLibrarySchema.ts',
	'app/repositories/library/browser/browserLibraryTypes.ts',
	'app/repositories/library/browser/browserWorkspaceDrafts.ts',
	'app/types/trackEnrichmentDraft.ts',
	'app/utils/trackEnrichmentDraftCodec.ts',
	'app/utils/trackEnrichmentDraftPrivacy.ts',
	// Reached through the shared codecs' record decoders.
	'app/utils/recordCover.ts'
]

describe('active device-draft dependency boundary', () => {
	it('reaches only the device-draft storage kernel at runtime', () => {
		const graph = runtimeGraph('app/repositories/deviceDrafts/index.ts')
		expect(graph).toContain(
			'app/repositories/library/browser/browserDraftReads.ts'
		)
		expect(graph).toContain(
			'app/repositories/library/browser/browserLibrarySchema.ts'
		)
		const unexpected = graph
			.filter(
				(file) =>
					!ALLOWED_RUNTIME_MODULES.includes(file) && !file.startsWith('shared/')
			)
			.sort()
		expect(
			unexpected,
			'non-draft modules crossed the active draft boundary'
		).toEqual([])
		for (const file of graph) {
			expect(file, 'draft runtime must not reach UI or app state').not.toMatch(
				/^app\/(?:components|composables|pages|stores|layouts|plugins)\//
			)
		}
	})

	it('keeps the active application consumers on the explicit draft API', () => {
		for (const file of [
			'app/composables/useTrackEnrichmentDraftSession.ts',
			'app/utils/trackEnrichmentDraftOwnership.ts',
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
