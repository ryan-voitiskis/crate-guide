import { reactive } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DialogDiscogsImport from '~/components/import/DialogDiscogsImport.vue'
import type { DiscogsImportFailure } from '~~/shared/types/discogs'

const factories = vi.hoisted(() => ({ discogs: vi.fn() }))
mockNuxtImport('useDiscogsStore', () => factories.discogs)

const retryFailedReleases = vi.hoisted(() => vi.fn())
const wrappers = new Set<VueWrapper>()

function failure(
	overrides: Partial<DiscogsImportFailure> = {}
): DiscogsImportFailure {
	return {
		releaseId: 42,
		label: 'Autechre – Draft 7.30',
		error: 'Discogs is temporarily unavailable.',
		code: 'discogs_unavailable',
		stage: 'fetch',
		retryable: true,
		attempts: 3,
		...overrides
	}
}

function createStore(overrides: Record<string, unknown> = {}) {
	const failed = [failure()]
	return reactive({
		showImportProgressDialog: true,
		isImporting: false,
		transferStatus: 'completed',
		transferMode: 'import',
		importPhase: null,
		importProgress: 0,
		releaseBeingImported: null,
		retryStatus: null,
		retrySummary: null,
		importResults: { successful: 179, skipped: [], failed },
		retryableFailures: failed,
		canRetryFailed: true,
		openTransferMonitor: vi.fn(),
		minimizeTransferMonitor: vi.fn(),
		dismissTransferMonitor: vi.fn(),
		cancelImport: vi.fn(),
		retryFailedReleases,
		...overrides
	})
}

const layoutStubs = {
	Dialog: { template: '<div><slot /></div>' },
	DialogContent: { template: '<section><slot /></section>' },
	DialogHeader: { template: '<header><slot /></header>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<footer><slot /></footer>' },
	ScrollArea: { template: '<div><slot /></div>' },
	ProgressDiscogsImport: { template: '<div data-testid="progress" />' }
}

async function mountMonitor(store = createStore()) {
	factories.discogs.mockReturnValue(store)
	const wrapper = await mountSuspended(DialogDiscogsImport, {
		global: { stubs: layoutStubs }
	})
	wrappers.add(wrapper)
	return { store, wrapper }
}

describe('Discogs transfer monitor', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		for (const wrapper of wrappers) wrapper.unmount()
		wrappers.clear()
		document.body.innerHTML = ''
	})

	it('opens failed-record details and exposes dense diagnostic metadata', async () => {
		const { wrapper } = await mountMonitor()

		expect(wrapper.text()).toContain('Import completed with issues')
		expect(wrapper.text()).toContain('Autechre – Draft 7.30')
		expect(wrapper.text()).toContain('Discogs fetch')
		expect(wrapper.text()).toContain('3 attempts')
		expect(wrapper.text()).toContain('Discogs is temporarily unavailable.')
		expect(wrapper.text()).toContain('Hide details')
	})

	it('retries only failed records from a clear primary action', async () => {
		const { wrapper } = await mountMonitor()
		const retry = wrapper.get('[data-testid="retry-failed-records"]')

		expect(retry.text()).toContain('Retry 1 failed record')
		await retry.trigger('click')

		expect(retryFailedReleases).toHaveBeenCalledOnce()
	})

	it('explains nonretryable pipeline failures without offering a dead action', async () => {
		const pipelineFailure = failure({
			releaseId: null,
			label: 'Discogs import',
			stage: 'pipeline',
			code: 'internal_error',
			retryable: false,
			attempts: 1
		})
		const { wrapper } = await mountMonitor(
			createStore({
				importResults: {
					successful: 0,
					skipped: [],
					failed: [pipelineFailure]
				},
				retryableFailures: [],
				canRetryFailed: false
			})
		)

		expect(wrapper.text()).toContain('New import required')
		expect(wrapper.find('[data-testid="retry-failed-records"]').exists()).toBe(
			false
		)
	})

	it('uses retry-specific progress and cancellation language', async () => {
		const { wrapper } = await mountMonitor(
			createStore({
				isImporting: true,
				transferStatus: 'running',
				transferMode: 'retry',
				importPhase: 'fetching',
				canRetryFailed: false
			})
		)

		expect(wrapper.text()).toContain('Retrying failed records…')
		expect(wrapper.text()).toContain(
			'Refetching only the records that previously failed.'
		)
		expect(wrapper.text()).toContain('Cancel retry')
	})
})
