// Active device-draft API. The storage kernel remains shared with the deferred
// browser-library adapter so existing databases retain their upgrade path.
export { BROWSER_DRAFT_LEASE_RENEW_INTERVAL_MS } from '../library/browser/browserLibraryTypes'
export type {
	BrowserClaimedDraft,
	BrowserClaimedDraftState,
	BrowserDeviceDraftCas,
	BrowserDeviceDraftLeaseCas,
	BrowserDeviceDraftReadResult,
	BrowserDeviceDraftReplaceCas,
	BrowserDeviceDraftRepository,
	BrowserDeviceDraftWriteCas,
	BrowserDraftLease,
	BrowserLibraryDependencies,
	BrowserWorkflowDraft,
	BrowserWorkflowDraftEntry,
	BrowserWorkspaceIdentity,
	OpenBrowserDeviceDraftRepositoryOptions
} from '../library/browser/browserLibraryTypes'
