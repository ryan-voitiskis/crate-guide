# Authenticated workbench Chrome QA — 2026-07-18

## Outcome

The remediated authenticated workbench passed desktop, mobile, failure-recovery, and destructive Discogs import testing in the user's real signed-in Chrome session. The minimisable transfer monitor remained usable throughout a one-record delete and reimport, the final library returned to its original state without duplicates, and every concern found during the first walkthrough was addressed and retested.

## Test environment

- Branch: `codex/crate-guide-workbench`
- Starting commit: `6ac3970`; remediation tested from the current working tree
- Browser: the user's authenticated Chrome session
- App: `http://localhost:3000`
- Viewports: desktop `1534 × 898` and mobile `390 × 844`
- Initial data: 180 records and 759 tracks
- Local Supabase ports: `42820–42829`

## Coverage

| Area                       | Result | Notes                                                                                                                                                                                                                 |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session and home workbench | Pass   | Authenticated shell, deck loading, candidate list, and empty compatibility states rendered correctly. Missing BPM/key candidates use an em dash and an explanatory accessible label instead of a false `0` or `0.0%`. |
| Tracks                     | Pass   | 759 tracks loaded. Search, filtering, inspector, dense desktop table, mobile cards, mobile navigation, metadata counters, and the themed overflow region worked.                                                      |
| Records                    | Pass   | 180 records loaded. Search, inspector, desktop table, mobile cards, responsive inspector, and the themed overflow region worked.                                                                                      |
| Crates                     | Pass   | Empty state and Create Crate dialog worked; the dialog was cancelled without creating data.                                                                                                                           |
| BPM & Key                  | Pass   | Rekordbox and experimental local-audio source switching worked; the source was restored to Rekordbox.                                                                                                                 |
| Settings                   | Pass   | Discogs connection, theme, key format, pitch range, and account sections loaded.                                                                                                                                      |
| Command palette            | Pass   | Filtering to Tracks and keyboard navigation to the route worked.                                                                                                                                                      |
| Responsive layout          | Pass   | Tracks, records, inspectors, and mobile navigation worked at `390 × 844`; no document-level horizontal overflow was present.                                                                                          |
| Discogs idempotency        | Pass   | Reimporting All classified all 180 records as already present. Database counts and duplicate checks were unchanged.                                                                                                   |
| Discogs minimise/recovery  | Pass   | Minimise, status strip, reopen, retry progress, failed state, targeted retry, recovery result, and final data restoration all worked.                                                                                 |

## Remediation verification

| Finding                          | Implemented and verified                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated shell race         | Protected routes now keep the workbench header and Teleport target mounted while the user ref hydrates. Six alternating hard loads of Tracks and Records completed without Teleport warnings, uncaught errors, or stuck loading states.             |
| Edge Functions lifecycle         | The foreground supervisor now performs continuous health checks. Stopping only the Edge Functions container caused a visible failure after three consecutive checks and exited status 1; restarting restored a healthy supervised process.          |
| Discogs folder error state       | Folder failures persist in the dialog with a safe message, request ID, and `Try again`. A forced outage showed no false empty state, and retry recovered the folder list after the runtime restarted.                                               |
| Sheet close accessibility        | The shared close control exposes the accessible name `Close`. It was confirmed in the mobile track inspector at `390 × 844`.                                                                                                                        |
| Release checkbox accessibility   | Importable releases expose `Select <title> by <artist> for import`, and the release card is a larger pointer target. The label was confirmed against the deliberately removed P.Leone release.                                                      |
| Dense-region scrollbar           | Tracks and Records use a thin, theme-aware visible scrollbar while retaining genuine horizontal overflow and trackpad/keyboard access.                                                                                                              |
| Metadata counters                | Tracks now reports coverage as `BPM 0/759` and `KEY 0/759`, with explicit accessible labels.                                                                                                                                                        |
| Existing-release manifest status | Existing releases are preclassified, deselected, and labelled `In library`; the `reki` folder showed `0 selected · 1 in library`. After removing its record, the same manifest correctly changed to `1 selected · 0 in library` and enabled import. |

## Destructive Discogs recovery proof

The `reki` folder contained one record, **The My Lita Project** by P.Leone (`REKIDS125`, Discogs release `12460909`), with four tracks.

1. Removed the record through the normal confirmation UI.
2. Confirmed the database fell from 180 to 179 records and from 759 to 755 tracks.
3. Prepared the one-release import, then stopped the local Edge Functions server to force a retryable upstream failure.
4. Started the import and minimised the monitor at 100% fetch progress.
5. Confirmed the status strip announced `Discogs · Fetching · 100%` and reopened the active monitor from it.
6. Observed bounded progress through attempt 2 of 3, minimised again, and confirmed the strip changed to `Discogs · 1 failed` after exhaustion.
7. Reopened the monitor and confirmed the result identified one failed record, the temporary-unavailability reason, three attempts, and a targeted retry action.
8. Restored the Edge Functions server and retried only the failed record.
9. Confirmed the result reported that every failed record recovered successfully.

Final database state:

- 180 records
- 759 tracks
- exactly one record for Discogs release `12460909`
- four tracks attached to the restored record
- zero duplicate `(user, Discogs release)` groups

## Initial findings and implemented resolutions

### Resolved P1 — Stabilise the authenticated workbench shell before Teleports mount

Authenticated hard navigation to protected pages is nondeterministically unsafe. It was reproduced twice: Vue reported that it could not find `#header-left`, then threw while reading `parentNode`, leaving the page stuck on `Loading tracks...` or `Loading collection...` until a reload. Client-side navigation through Nuxt links worked, and fresh direct loads sometimes worked, which makes this a hydration/order race rather than a permanently missing element.

The code path is consistent with the failure:

- `app/layouts/default.vue` only renders the workbench header and its `#header-left` target when `useSupabaseUser()` or demo mode is truthy.
- Protected pages including `tracks.vue`, `records.vue`, `crates.vue`, and `index.vue` mount a deferred Teleport to `#header-left`.
- The auth middleware validates the session asynchronously, so the protected page can mount while the reactive user is still null and the layout is rendering its non-workbench branch.

Implemented: the workbench shell is now selected by protected-route intent as well as the hydrated user, while public auth routes retain the public shell. A Nuxt regression test covers the layout contract, the existing login E2E suite covers the immediate post-login transition, and six authenticated Chrome hard loads confirmed the runtime result.

### Resolved P2 — Make the local Edge Functions process durable and observable

The local Supabase stack reported as running while `supabase_edge_runtime_crate-guide` had exited. Discogs folder requests consequently returned HTTP 503 with `name resolution failed`. Starting `npm run supa:functions` in the foreground restored the endpoint immediately.

Implemented: `npm run supa:start` and `npm run dev:all` use a foreground Node supervisor with startup and continuous Edge Functions health checks. It captures `supabase start` output so local credentials are not replayed into logs, stops sibling processes on failure, and exits nonzero if three consecutive runtime probes fail. `npm run supa:health` provides an explicit one-shot diagnostic.

Security note: the local gateway bypasses JWT verification with `--no-verify-jwt`, but the Discogs function still calls `supabase.auth.getUser()` with the caller's Authorization header and scopes service-role credential access to the authenticated user ID. That application-level check is important and should remain mandatory. The bypass should remain local-only and should not be copied to deployment configuration.

### Resolved P2 — Distinguish a Discogs folder error from an empty account

When the folder request returned 503, the UI briefly showed a useful `Discogs is temporarily unavailable` toast but the persistent import dialog then said `No folders found`. The store clears folders before fetching and exposes no persistent fetch error, so the dialog cannot distinguish a failed request from a successful empty response.

Implemented: the store preserves a typed, safely bounded folder error and validated request ID. The dialog renders a persistent retry panel and only renders its empty state after a successful empty response. A forced live outage and recovery confirmed both branches.

### Resolved P2 — Give every sheet close control an accessible name

The shared sheet close icon used by mobile navigation and record/track inspectors has no accessible name (`aria-label`, labelled content, or screen-reader text).

Implemented: the shared `SheetContent` close control contains visually hidden `Close` text, so every consumer inherits the accessible name. It is covered by the primitive contract test and was confirmed in Chrome.

### Resolved P2 — Label each Discogs release selection checkbox

The import manifest's per-release checkboxes have no accessible names; only `Select all` is named.

Implemented: each importable release checkbox is labelled `Select <title> by <artist> for import`, and the whole card is its label-style pointer target. Existing releases omit the checkbox and instead show `In library`.

### Resolved P3 — Theme the dense-table scrollbar

At the tested desktop width the tracks and records tables intentionally overflow their content panel, which is appropriate for information density, but the browser-native horizontal scrollbar is bright against the dark DAW-style interface.

Implemented: a scoped `workbench-scrollbar` utility gives Tracks and Records a thin, high-contrast, theme-aware scrollbar without hiding or disabling the overflow affordance.

### Resolved P3 — Clarify missing metadata counters

The Tracks summary chips display values such as `759 BPM` and `759 KEY`, but the numbers are missing-value counts rather than coverage totals.

Implemented: the counters show availability over total, for example `BPM 0/759` and `KEY 0/759`, with accessible labels that spell out the meaning.

### Resolved P3 — Mark already-imported releases in the manifest

Reimporting All initially selected all 180 releases, then correctly and quickly classified every record as already in the collection. This is safe and idempotent, but the review step could communicate the expected outcome earlier.

Implemented: the manifest performs a user-scoped existing-ID lookup, labels and deselects records already in the library, selects only missing records, and still performs the authoritative idempotency check during import. If the preflight lookup itself fails, the manifest remains usable and the import-time check continues to prevent duplicates.

## Validated without a recommended change

- The minimised status strip remained keyboard-accessible and communicated active progress and terminal failure states.
- The monitor could be reopened during an active transfer and after a terminal failure.
- Automatic retry stopped after three attempts; it did not loop indefinitely.
- Retrying from the failure result targeted only the failed record.
- Reimporting existing records remained idempotent.
- Removing and restoring the test record preserved final record and track counts without duplicates.
- The responsive workbench retained its information density without document-level horizontal overflow.
