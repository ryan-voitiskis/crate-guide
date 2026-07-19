import { __unstable__loadDesignSystem } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { execFileSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const SOURCE_EXTENSIONS = new Set([
	'.cjs',
	'.css',
	'.cts',
	'.html',
	'.js',
	'.jsx',
	'.md',
	'.mdx',
	'.mjs',
	'.mts',
	'.ts',
	'.tsx',
	'.vue'
])

function toRepositoryPath(path) {
	return path.split(sep).join('/')
}

function getLocation(contents, position) {
	const precedingContents = contents.slice(0, position)
	const precedingLineBreak = precedingContents.lastIndexOf('\n')

	return {
		column: position - precedingLineBreak,
		line: precedingContents.split('\n').length
	}
}

function canCompileCandidate(designSystem, candidate) {
	try {
		return designSystem.candidatesToCss([candidate])[0] !== null
	} catch {
		return false
	}
}

export function discoverTailwindSourceFiles(root = process.cwd()) {
	const output = execFileSync(
		'git',
		['ls-files', '-co', '--exclude-standard', '-z'],
		{ cwd: root }
	)

	return [...new Set(output.toString('utf8').split('\0').filter(Boolean))]
		.filter((path) => SOURCE_EXTENSIONS.has(extname(path).toLowerCase()))
		.filter((path) => {
			try {
				return lstatSync(resolve(root, path)).isFile()
			} catch {
				return false
			}
		})
		.sort()
}

export async function createCanonicalClassChecker({
	root = process.cwd(),
	cssPath = 'app/assets/css/main.css',
	rootFontSize = 16
} = {}) {
	const absoluteCssPath = resolve(root, cssPath)
	const stylesheet = await readFile(absoluteCssPath, 'utf8')
	const designSystem = await __unstable__loadDesignSystem(stylesheet, {
		base: dirname(absoluteCssPath)
	})
	const scanner = new Scanner({})

	return function evaluateContents(contents, extension) {
		const diagnostics = []
		const seenCandidates = new Set()

		for (const { candidate, position } of scanner.getCandidatesWithPositions({
			content: contents,
			extension
		})) {
			const candidateKey = `${position}\0${candidate}`
			if (seenCandidates.has(candidateKey)) continue
			seenCandidates.add(candidateKey)

			if (!canCompileCandidate(designSystem, candidate)) continue

			const canonicalCandidates = designSystem.canonicalizeCandidates(
				[candidate],
				{ rem: rootFontSize }
			)
			if (
				canonicalCandidates.length !== 1 ||
				canonicalCandidates[0] === candidate
			)
				continue

			diagnostics.push({
				...getLocation(contents, position),
				candidate,
				canonicalCandidate: canonicalCandidates[0],
				position
			})
		}

		return diagnostics
	}
}

export function applyCanonicalClassFixes(contents, diagnostics) {
	let fixedContents = contents
	for (const diagnostic of diagnostics.toSorted(
		(left, right) => right.position - left.position
	)) {
		fixedContents = `${fixedContents.slice(0, diagnostic.position)}${diagnostic.canonicalCandidate}${fixedContents.slice(diagnostic.position + diagnostic.candidate.length)}`
	}

	return fixedContents
}

export async function checkTailwindCanonicalClasses({
	root = process.cwd(),
	cssPath = 'app/assets/css/main.css',
	rootFontSize = 16,
	fix = false
} = {}) {
	const evaluateContents = await createCanonicalClassChecker({
		root,
		cssPath,
		rootFontSize
	})
	const diagnostics = []
	let fixedFileCount = 0

	for (const path of discoverTailwindSourceFiles(root)) {
		const absolutePath = resolve(root, path)
		const contents = await readFile(absolutePath, 'utf8')
		const fileDiagnostics = evaluateContents(
			contents,
			extname(path).slice(1)
		).map((diagnostic) => ({ path, ...diagnostic }))
		diagnostics.push(...fileDiagnostics)

		if (fix && fileDiagnostics.length > 0) {
			await writeFile(
				absolutePath,
				applyCanonicalClassFixes(contents, fileDiagnostics)
			)
			fixedFileCount += 1
		}
	}

	return { diagnostics, fixedFileCount }
}

async function run() {
	const root = process.cwd()
	const fix = process.argv.includes('--fix')
	const { diagnostics, fixedFileCount } = await checkTailwindCanonicalClasses({
		root,
		fix
	})

	if (diagnostics.length === 0) {
		console.log('Canonical Tailwind classes passed.')
		return
	}

	if (fix) {
		console.log(
			`Fixed ${diagnostics.length} non-canonical Tailwind ${diagnostics.length === 1 ? 'class' : 'classes'} across ${fixedFileCount} ${fixedFileCount === 1 ? 'file' : 'files'}.`
		)
		return
	}

	for (const diagnostic of diagnostics) {
		console.error(
			`${toRepositoryPath(relative(root, resolve(root, diagnostic.path)))}:${diagnostic.line}:${diagnostic.column}: The class \`${diagnostic.candidate}\` can be written as \`${diagnostic.canonicalCandidate}\``
		)
	}
	process.exitCode = 1
}

const isDirectRun =
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) await run()
