import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
	applyCanonicalClassFixes,
	createCanonicalClassChecker,
	discoverTailwindSourceFiles
} from './check-tailwind-canonical.mjs'

const evaluateContents = await createCanonicalClassChecker()
const MIN_WIDTH_1260 = ['min-w-', '[1260px]'].join('')
const MIN_WIDTH_680 = ['min-w-', '[680px]'].join('')
const TRACKING_WIDE = ['tracking-', '[0.1em]'].join('')
const BACKGROUND_SIZE = ['[background-size:', '100%_100%]'].join('')

function withTemporaryRepository(callback) {
	const root = mkdtempSync(join(tmpdir(), 'crate-guide-tailwind-'))
	const write = (path, contents = '') => {
		const absolutePath = join(root, path)
		mkdirSync(dirname(absolutePath), { recursive: true })
		writeFileSync(absolutePath, contents)
	}

	try {
		execFileSync('git', ['init', '--quiet'], { cwd: root })
		callback({ root, write })
	} finally {
		rmSync(root, { force: true, recursive: true })
	}
}

test('reports the same canonical spacing and tracking classes as Tailwind IntelliSense', () => {
	const contents = `<div class="${MIN_WIDTH_1260} ${TRACKING_WIDE} ${MIN_WIDTH_680}" />`

	assert.deepEqual(
		evaluateContents(contents, 'vue').map(
			({ candidate, canonicalCandidate, line, column }) => ({
				candidate,
				canonicalCandidate,
				line,
				column
			})
		),
		[
			{
				candidate: MIN_WIDTH_1260,
				canonicalCandidate: 'min-w-315',
				column: 13,
				line: 1
			},
			{
				candidate: TRACKING_WIDE,
				canonicalCandidate: 'tracking-widest',
				column: 28,
				line: 1
			},
			{
				candidate: MIN_WIDTH_680,
				canonicalCandidate: 'min-w-170',
				column: 45,
				line: 1
			}
		]
	)
})

test('scans Tailwind strings outside template class attributes', () => {
	const diagnostics = evaluateContents(
		`const texture = '${BACKGROUND_SIZE}'`,
		'ts'
	)

	assert.equal(diagnostics.length, 1)
	assert.equal(diagnostics[0].candidate, BACKGROUND_SIZE)
	assert.equal(diagnostics[0].canonicalCandidate, 'bg-size-[100%_100%]')
})

test('ignores source tokens that canonicalize syntactically but are not valid utilities', () => {
	assert.deepEqual(evaluateContents('if (!row || !column) return', 'ts'), [])
})

test('applies multiple replacements without invalidating later positions', () => {
	const contents = `<div class="${MIN_WIDTH_680} ${TRACKING_WIDE}" />`
	const diagnostics = evaluateContents(contents, 'vue')

	assert.equal(
		applyCanonicalClassFixes(contents, diagnostics),
		'<div class="min-w-170 tracking-widest" />'
	)
})

test('discovers tracked and untracked source files without ignored or unsupported files', () => {
	withTemporaryRepository(({ root, write }) => {
		write('app/CardTracked.vue', '<template />')
		write('app/ignored.ts', '')
		write('notes.txt', MIN_WIDTH_680)
		write('.gitignore', 'app/ignored.ts\n')
		execFileSync('git', ['add', '.gitignore', 'app/CardTracked.vue'], {
			cwd: root
		})
		write('app/untracked.ts', `const classes = '${MIN_WIDTH_680}'`)

		assert.deepEqual(discoverTailwindSourceFiles(root), [
			'app/CardTracked.vue',
			'app/untracked.ts'
		])
	})
})
