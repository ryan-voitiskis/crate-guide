import { useTestContext } from '@nuxt/test-utils'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadClientBundleReport } from '../../scripts/check-client-bundle-budget.mjs'
import {
	mockAuthenticatedSupabase,
	setupWorkbenchE2E,
	signInViaForm,
	waitForWorkbenchShell
} from './fixtures/authenticatedWorkbench'
import { createErrorAwarePage } from './fixtures/errorAwarePage'

type ClientBundleConfig = {
	expectedLazyModules: string[]
	wasmAssetPatterns: string[]
	workerAssetPatterns: string[]
}

type ObservedAsset = {
	pathname: string
	sequence: number
}

type SemanticAssets = {
	cloudRuntime: string
	deviceDraftRepository: string
	enrichmentPage: string
	localAudioWorker: string
	localAudioWasm: string
}

const CLOUD_RUNTIME_MODULE = 'utils/cloudWorkbenchRuntime.ts'
const DEVICE_DRAFT_REPOSITORY_MODULE =
	'repositories/library/browser/browserDeviceDraftRepository.ts'
const ENRICHMENT_PAGE_MODULE = 'pages/enrichment.vue'
const LOCAL_AUDIO_WORKER_PATTERN = 'localAudioAnalysis.worker-'
const LOCAL_AUDIO_WASM_PATTERN = 'essentia-wasm.es-'
const AUDIO_DURATION_SECONDS = 12
const AUDIO_SAMPLE_RATE = 44_100

await setupWorkbenchE2E()

let semanticAssets: SemanticAssets
let audioFixtureDirectory = ''

function assetPath(file: string) {
	return `/_nuxt/${file}`
}

function onlyMatchingAsset(
	files: string[],
	pattern: string,
	label: string
): string {
	const matches = files.filter((file) => file.includes(pattern))
	expect(
		matches,
		`Expected exactly one ${label} asset for ${pattern}`
	).toHaveLength(1)
	return matches[0]!
}

async function loadSemanticAssets(): Promise<SemanticAssets> {
	const outputDirectory = useTestContext().nuxt?.options.nitro.output.dir
	if (!outputDirectory) {
		throw new Error('Nuxt E2E output directory is unavailable')
	}
	const config = JSON.parse(
		await readFile(resolve('shared/config/clientBundleBudget.json'), 'utf8')
	) as ClientBundleConfig

	expect(config.expectedLazyModules).toContain(CLOUD_RUNTIME_MODULE)
	expect(config.expectedLazyModules).toContain(DEVICE_DRAFT_REPOSITORY_MODULE)
	expect(config.expectedLazyModules).toContain(ENRICHMENT_PAGE_MODULE)
	expect(config.workerAssetPatterns).toContain(LOCAL_AUDIO_WORKER_PATTERN)
	expect(config.wasmAssetPatterns).toContain(LOCAL_AUDIO_WASM_PATTERN)

	const report = await loadClientBundleReport({
		assetDirectory: resolve(outputDirectory, 'public/_nuxt'),
		config,
		manifestDirectory: resolve(outputDirectory, 'server/chunks/build')
	})
	const cloudRuntime = report.semanticLazyBoundaries[CLOUD_RUNTIME_MODULE]
	const deviceDraftRepository =
		report.semanticLazyBoundaries[DEVICE_DRAFT_REPOSITORY_MODULE]
	const enrichmentPage = report.semanticLazyBoundaries[ENRICHMENT_PAGE_MODULE]
	expect(cloudRuntime?.isInitial).toBe(false)
	expect(cloudRuntime?.isPrefetched).toBe(false)
	expect(deviceDraftRepository?.isInitial).toBe(false)
	expect(deviceDraftRepository?.isPrefetched).toBe(false)
	expect(enrichmentPage?.isInitial).toBe(false)
	expect(enrichmentPage?.isPrefetched).toBe(false)

	const workerFiles = report.metrics
		.filter((asset) => asset.category === 'worker')
		.map((asset) => asset.file)
	const wasmFiles = report.metrics
		.filter((asset) => asset.category === 'wasm')
		.map((asset) => asset.file)

	return {
		cloudRuntime: assetPath(cloudRuntime.file),
		deviceDraftRepository: assetPath(deviceDraftRepository.file),
		enrichmentPage: assetPath(enrichmentPage.file),
		localAudioWorker: assetPath(
			onlyMatchingAsset(
				workerFiles,
				LOCAL_AUDIO_WORKER_PATTERN,
				'local-audio Worker'
			)
		),
		localAudioWasm: assetPath(
			onlyMatchingAsset(wasmFiles, LOCAL_AUDIO_WASM_PATTERN, 'local-audio WASM')
		)
	}
}

function createGeneratedPcmWav(): Buffer {
	const channels = 2
	const bitsPerSample = 16
	const bytesPerSample = bitsPerSample / 8
	const frameCount = AUDIO_DURATION_SECONDS * AUDIO_SAMPLE_RATE
	const blockAlign = channels * bytesPerSample
	const dataBytes = frameCount * blockAlign
	const bytes = Buffer.alloc(44 + dataBytes)

	bytes.write('RIFF', 0, 'ascii')
	bytes.writeUInt32LE(36 + dataBytes, 4)
	bytes.write('WAVE', 8, 'ascii')
	bytes.write('fmt ', 12, 'ascii')
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(channels, 22)
	bytes.writeUInt32LE(AUDIO_SAMPLE_RATE, 24)
	bytes.writeUInt32LE(AUDIO_SAMPLE_RATE * blockAlign, 28)
	bytes.writeUInt16LE(blockAlign, 32)
	bytes.writeUInt16LE(bitsPerSample, 34)
	bytes.write('data', 36, 'ascii')
	bytes.writeUInt32LE(dataBytes, 40)

	const impulseSpacing = AUDIO_SAMPLE_RATE / 2
	const impulseLength = Math.round(AUDIO_SAMPLE_RATE * 0.005)
	for (let frame = 0; frame < frameCount; frame += 1) {
		const time = frame / AUDIO_SAMPLE_RATE
		const tonalSample =
			0.04 *
			[261.625565, 329.627557, 391.995436].reduce(
				(sum, frequency) => sum + Math.sin(2 * Math.PI * frequency * time),
				0
			)
		const impulseOffset = frame % impulseSpacing
		const impulseSample =
			impulseOffset < impulseLength ? 0.2 * Math.exp(-impulseOffset / 30) : 0
		const sample = Math.max(-1, Math.min(1, tonalSample + impulseSample))
		const value = Math.round(sample * 0x7fff)
		for (let channel = 0; channel < channels; channel += 1) {
			bytes.writeInt16LE(
				value,
				44 + (frame * channels + channel) * bytesPerSample
			)
		}
	}

	return bytes
}

function findSequence(observed: ObservedAsset[], pathname: string): number {
	return observed.find((entry) => entry.pathname === pathname)?.sequence ?? -1
}

function expectNotRequested(observed: ObservedAsset[], pathname: string) {
	expect(observed.some((entry) => entry.pathname === pathname)).toBe(false)
}

beforeAll(async () => {
	semanticAssets = await loadSemanticAssets()
	audioFixtureDirectory = await mkdtemp(join(tmpdir(), 'crate-guide-audio-'))
	await writeFile(
		join(audioFixtureDirectory, 'generated-local-audio.wav'),
		createGeneratedPcmWav()
	)
})

afterAll(async () => {
	if (audioFixtureDirectory) {
		await rm(audioFixtureDirectory, { force: true, recursive: true })
	}
})

describe('production client bundle loading', () => {
	it('requests Cloud, enrichment, Worker, and WASM boundaries only when opened', async () => {
		const observed: ObservedAsset[] = []
		const page = await createErrorAwarePage('/login', {
			beforeNavigate(page) {
				page.on('response', (response) => {
					if (response.status() < 200 || response.status() >= 400) return
					const pathname = new URL(response.url()).pathname
					observed.push({ pathname, sequence: observed.length })
				})
			}
		})

		await page.waitForLoadState('networkidle')
		expectNotRequested(observed, semanticAssets.cloudRuntime)
		expectNotRequested(observed, semanticAssets.deviceDraftRepository)
		expectNotRequested(observed, semanticAssets.enrichmentPage)
		expectNotRequested(observed, semanticAssets.localAudioWorker)
		expectNotRequested(observed, semanticAssets.localAudioWasm)

		await mockAuthenticatedSupabase(page)
		await page.route('**/functions/v1/cleanup-record-covers', async (route) => {
			await route.fulfill({
				contentType: 'application/json',
				json: { processed: 0, removed: 0, deferred: 0 },
				status: 200
			})
		})
		await signInViaForm(page)
		await waitForWorkbenchShell(page)
		await page.waitForLoadState('networkidle')

		const cloudRuntimeSequence = findSequence(
			observed,
			semanticAssets.cloudRuntime
		)
		expect(cloudRuntimeSequence).toBeGreaterThanOrEqual(0)
		expectNotRequested(observed, semanticAssets.deviceDraftRepository)
		expectNotRequested(observed, semanticAssets.enrichmentPage)
		expectNotRequested(observed, semanticAssets.localAudioWorker)
		expectNotRequested(observed, semanticAssets.localAudioWasm)

		await page.getByRole('link', { name: 'BPM & Key' }).first().click()
		await page.waitForURL((currentUrl) => currentUrl.pathname === '/enrichment')
		await page.getByRole('radio', { name: 'Local audio' }).waitFor()
		await page.waitForLoadState('networkidle')

		const enrichmentSequence = findSequence(
			observed,
			semanticAssets.enrichmentPage
		)
		expect(enrichmentSequence).toBeGreaterThan(cloudRuntimeSequence)
		const deviceDraftRepositorySequence = findSequence(
			observed,
			semanticAssets.deviceDraftRepository
		)
		expect(deviceDraftRepositorySequence).toBeGreaterThan(enrichmentSequence)
		expectNotRequested(observed, semanticAssets.localAudioWorker)
		expectNotRequested(observed, semanticAssets.localAudioWasm)

		await page.getByRole('radio', { name: 'Local audio' }).click()
		await page
			.locator('input[type="file"][webkitdirectory]')
			.setInputFiles(audioFixtureDirectory)
		const analyzeButton = page.getByRole('button', {
			name: 'Analyze 10 missing'
		})
		await analyzeButton.waitFor()
		expectNotRequested(observed, semanticAssets.localAudioWorker)
		expectNotRequested(observed, semanticAssets.localAudioWasm)

		const interactionSequence = observed.length
		await analyzeButton.click()
		const stopButton = page.getByRole('button', { name: 'Stop analysis' })
		await stopButton.waitFor({ timeout: 10_000 })
		await stopButton.waitFor({
			state: 'detached',
			timeout: 60_000
		})
		await page.waitForLoadState('networkidle')

		const workerSequence = findSequence(
			observed,
			semanticAssets.localAudioWorker
		)
		const wasmSequence = findSequence(observed, semanticAssets.localAudioWasm)
		expect(workerSequence).toBeGreaterThanOrEqual(interactionSequence)
		expect(wasmSequence).toBeGreaterThan(workerSequence)
	}, 120_000)
})
