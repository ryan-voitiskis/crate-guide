import type {
	AdapterSnapshotSummary,
	BrowserLibraryAdapterHarness
} from './browserLibraryAdapterHarness'

type ProbeWindow = Window & {
	__browserLibraryAdapterHarness?: BrowserLibraryAdapterHarness
}

type ProbeResult = {
	abortedUpgrade: {
		blocked: boolean
		errorName: string
		upgradeStarted: boolean
	}
	broadcastEvents: number
	databaseVersion: number
	indexedDb: boolean
	persisted: boolean | null
	reloadSnapshot: AdapterSnapshotSummary
	storageEstimate: {
		quota: number | null
		usage: number | null
	} | null
	userAgent: string
	webLocks: boolean
}

const runButton = document.querySelector<HTMLButtonElement>('#run-probe')
const status = document.querySelector<HTMLElement>('#probe-status')
const environment = document.querySelector<HTMLElement>('#probe-environment')
const result = document.querySelector<HTMLElement>('#probe-result')

if (!runButton || !status || !environment || !result) {
	throw new Error('The physical Safari probe controls are missing.')
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message)
}

async function waitFor(
	predicate: () => boolean,
	message: string,
	timeoutMs = 15_000
) {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		try {
			if (predicate()) return
		} catch {
			// A same-origin secondary window can be temporarily inaccessible while
			// Safari replaces its document during reload.
		}
		await new Promise((resolve) => setTimeout(resolve, 25))
	}
	throw new Error(message)
}

async function waitForHarness(target: ProbeWindow) {
	await waitFor(
		() =>
			target.document.documentElement.dataset.browserLibraryAdapterHarness ===
				'ready' && Boolean(target.__browserLibraryAdapterHarness),
		'The adapter harness did not become ready.'
	)
	return target.__browserLibraryAdapterHarness as BrowserLibraryAdapterHarness
}

async function waitForRepositoryEvent(
	harness: BrowserLibraryAdapterHarness,
	eventKey: string,
	repositoryId: string
) {
	await waitFor(
		() =>
			harness
				.events(eventKey)
				.some(
					(event) =>
						event.type === 'reset' && event.repositoryId === repositoryId
				),
		'The secondary Safari window did not receive the repository reset.'
	)
}

async function storageEstimate() {
	if (!navigator.storage?.estimate) return null
	const estimate = await navigator.storage.estimate()
	return {
		quota: estimate.quota ?? null,
		usage: estimate.usage ?? null
	}
}

async function runPhysicalSafariProbe(secondary: ProbeWindow) {
	const primary = await waitForHarness(window)
	const databaseName = `crate-guide-physical-safari-${crypto.randomUUID()}`
	let secondaryHarness: BrowserLibraryAdapterHarness | null = null

	try {
		secondaryHarness = await waitForHarness(secondary)
		const identity = await primary.createWorkspace(
			databaseName,
			'workspace-a',
			'Physical Safari probe'
		)

		await primary.openRepository('primary-reload', databaseName, identity)
		assert(
			(
				await primary.replaceSnapshot(
					'primary-reload',
					'Physical Safari persisted record',
					'physical-safari-cover'
				)
			).status === 'success',
			'Initial repository snapshot did not commit.'
		)
		primary.closeRepository('primary-reload')

		await secondaryHarness.openRepository(
			'secondary-reload',
			databaseName,
			identity
		)
		const beforeReload = await secondaryHarness.readSnapshot('secondary-reload')
		assert(
			beforeReload.status === 'success' &&
				beforeReload.recordTitle === 'Physical Safari persisted record' &&
				beforeReload.cover?.text === 'physical-safari-cover',
			'The secondary Safari window could not read the committed graph and Blob.'
		)
		secondaryHarness.closeRepository('secondary-reload')

		const documentBeforeReload = secondary.document
		secondary.location.reload()
		await waitFor(
			() => secondary.document !== documentBeforeReload,
			'The secondary Safari window did not replace its document on reload.'
		)
		secondaryHarness = await waitForHarness(secondary)
		await secondaryHarness.openRepository(
			'secondary-after-reload',
			databaseName,
			identity
		)
		const reloadSnapshot = await secondaryHarness.readSnapshot(
			'secondary-after-reload'
		)
		assert(
			reloadSnapshot.status === 'success' &&
				reloadSnapshot.recordCount === 1 &&
				reloadSnapshot.trackCount === 1 &&
				reloadSnapshot.trackRecordId === 'record-a' &&
				reloadSnapshot.crateRecordIds?.[0] === 'record-a' &&
				reloadSnapshot.cover?.type === 'image/webp' &&
				reloadSnapshot.cover.text === 'physical-safari-cover',
			'The graph or managed cover did not survive a physical Safari reload.'
		)
		secondaryHarness.closeRepository('secondary-after-reload')

		await Promise.all([
			primary.openRepository('primary-multipage', databaseName, identity),
			secondaryHarness.openRepository(
				'secondary-multipage',
				databaseName,
				identity
			)
		])
		secondaryHarness.subscribeRepository(
			'secondary-multipage',
			'secondary-events'
		)
		assert(
			(
				await primary.replaceSnapshot(
					'primary-multipage',
					'Physical Safari multi-page record',
					'physical-safari-multipage-cover'
				)
			).status === 'success',
			'The primary Safari window could not commit the multi-page reset.'
		)
		await waitForRepositoryEvent(
			secondaryHarness,
			'secondary-events',
			identity.repositoryId
		)

		const staleWrite = await secondaryHarness.updatePreferences(
			'secondary-multipage',
			{ ui_theme: 'dark' }
		)
		assert(
			staleWrite.status === 'conflict' &&
				staleWrite.reason === 'revision-mismatch',
			'A stale secondary Safari write was not rejected.'
		)
		const recovery = (await secondaryHarness.recoverRepository(
			'secondary-multipage'
		)) as { status?: string }
		assert(
			recovery.status === 'recovered',
			'The stale secondary Safari repository did not recover.'
		)
		assert(
			(
				await secondaryHarness.updatePreferences('secondary-multipage', {
					ui_theme: 'dark'
				})
			).status === 'success',
			'The recovered secondary Safari repository could not commit.'
		)

		const finalSnapshot = await secondaryHarness.readSnapshot(
			'secondary-multipage'
		)
		assert(
			finalSnapshot.status === 'success' &&
				finalSnapshot.recordTitle === 'Physical Safari multi-page record' &&
				finalSnapshot.preferences?.ui_theme === 'dark',
			'The recovered multi-page state was not coherent.'
		)

		const broadcastEvents = secondaryHarness.events('secondary-events').length
		await Promise.all([primary.closeAll(), secondaryHarness.closeAll()])
		const abortedUpgrade = await primary.triggerAbortedUpgrade(databaseName)
		assert(
			abortedUpgrade.upgradeStarted &&
				abortedUpgrade.errorName === 'AbortError',
			'The deliberately aborted Safari schema upgrade did not fail closed.'
		)
		const databaseVersion = await primary.databaseVersion(databaseName)
		const persisted = navigator.storage?.persisted
			? await navigator.storage.persisted()
			: null

		const probeResult: ProbeResult = {
			abortedUpgrade,
			broadcastEvents,
			databaseVersion,
			indexedDb: typeof indexedDB !== 'undefined',
			persisted,
			reloadSnapshot,
			storageEstimate: await storageEstimate(),
			userAgent: navigator.userAgent,
			webLocks: Boolean(navigator.locks?.request)
		}
		await primary.deleteDatabase(databaseName)
		return probeResult
	} finally {
		await Promise.allSettled([
			primary.closeAll(),
			secondaryHarness?.closeAll() ?? Promise.resolve()
		])
		secondary.close()
	}
}

if (new URLSearchParams(location.search).has('secondary')) {
	runButton.hidden = true
	status.textContent = 'Secondary Safari probe window ready.'
	document.documentElement.dataset.physicalSafariProbe = 'secondary'
} else {
	runButton.addEventListener('click', () => {
		const secondary = window.open(
			`${location.pathname}?secondary=1`,
			'crate-guide-physical-safari-secondary'
		) as ProbeWindow | null
		if (!secondary) {
			status.textContent = 'FAIL: Safari blocked the secondary probe window.'
			document.documentElement.dataset.physicalSafariProbe = 'fail'
			return
		}

		runButton.disabled = true
		status.textContent = 'Running physical Safari probe…'
		environment.textContent = ''
		result.textContent = ''
		document.documentElement.dataset.physicalSafariProbe = 'running'
		void runPhysicalSafariProbe(secondary)
			.then((probeResult) => {
				status.textContent = 'PASS: physical Safari library probe completed.'
				environment.textContent = [
					probeResult.userAgent,
					`IndexedDB: ${probeResult.indexedDb ? 'supported' : 'missing'}`,
					`cross-window events: ${probeResult.broadcastEvents}`,
					`Web Locks: ${probeResult.webLocks ? 'supported' : 'unavailable'}`,
					`persistent-storage grant: ${String(probeResult.persisted)}`
				].join(' · ')
				result.textContent = JSON.stringify(probeResult, null, 2)
				document.documentElement.dataset.physicalSafariProbe = 'pass'
			})
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error)
				status.textContent = `FAIL: ${message}`
				result.textContent =
					error instanceof Error && error.stack ? error.stack : message
				document.documentElement.dataset.physicalSafariProbe = 'fail'
			})
			.finally(() => {
				runButton.disabled = false
			})
	})
}
