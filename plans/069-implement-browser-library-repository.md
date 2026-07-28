# Plan 069: Implement a durable browser-library repository

> **Executor instructions**: Build a real transactional IndexedDB repository,
> not Pinia/localStorage persistence. Fail closed on storage errors: never let
> the UI claim a write was saved when only memory changed. Keep the disposable
> audio-analysis cache in its separate database.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/repositories app/utils/localAudioCache.ts package.json package-lock.json test app/stores`

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 053, 066, and 068
- **Category**: direction / local persistence
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

Accountless use is viable only if records, tracks, crates, sets, preferences,
and uploaded covers survive reloads transactionally. IndexedDB supports
structured values, Blobs, indexes, and multi-store transactions, but remains
browser-local—not a backup—and multi-tab/write-failure behavior must be explicit.

Primary references: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API),
[Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), and
[BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).

## Current state

- The only IndexedDB module, `localAudioCache.ts`, is a disposable one-store
  cache and must not own library data.
- Demo uses an in-memory Pinia; making it writable would lose data on reload.
- Plan 068 supplies domain repositories, stable workspace identity, cover refs,
  operation contexts, and contract tests.

## Commands you will need

| Purpose      | Command                                               | Expected on success                        |
| ------------ | ----------------------------------------------------- | ------------------------------------------ |
| Unit/Nuxt    | `npm run test:run`                                    | all pass                                   |
| Real browser | `npm run test:browser`                                | IndexedDB reload/Blob/multi-tab tests pass |
| Multi-page   | `npm run test:e2e`                                    | multi-tab/restart engine scenarios pass    |
| Bundle       | `npm run build && npm run check:client-bundle-budget` | Plan 053 budget passes                     |
| Full gate    | `npm run verify`                                      | exit 0                                     |

## Scope

**In scope**:

- versioned `crate-guide-library` IndexedDB schema and typed repository adapter
- exact-pinned `idb` wrapper dependency if its licence/bundle/upgrade behavior
  passes the spike; native IDB remains acceptable
- `package-lock.json` for any accepted dependency
- stores for workspace manifests, preferences, records, tracks, crates, sets,
  managed cover Blobs, workflow drafts metadata, and repository metadata
- multi-tab lock/CAS/invalidation, schema migrations, quota/error state
- multi-page Chromium/Firefox/WebKit E2E storage scenarios plus real-browser
  repository contracts and storage diagnostics

**Out of scope**: routing/onboarding (Plan 071), archive restore UI (Plan 070),
service-worker app shell (Plan 076), the separate `crate-guide-integrations`
credential database (Plan 073), encryption-at-rest claims, raw audio/XML, or
Supabase anonymous users.

## Git workflow

- Branch: `codex/069-implement-browser-library-repository`
- Commit: `feat(library): add browser repository`

## Steps

### Step 1: Define the versioned browser schema

Use stable `crypto.randomUUID()` workspace/entity IDs. Scope entity keys/indexes
to workspace ID. A workspace manifest owns a user-visible name, schema version,
created/updated time, `contentRevision`, `repositoryRevision`, last successful
content write, and cover completeness. A repository registry owns the active
browser-workspace marker and operational metadata: last exported content
revision/time, storage health, drafts, and an optional opaque copy receipt.
Store managed covers as Blobs under logical asset IDs. Reserve workflow drafts
separately from portable library entities.

`contentRevision` changes only when portable library content/preferences/covers
change. `repositoryRevision` also covers operational metadata. Recording a
successful export of content revision N must not create content revision N+1 or
immediately report new changes. Copy receipts contain only opaque server
migration ID, source content revision, phase/status, and timestamps—never an
account ID—and operational metadata/drafts/receipts/storage health are excluded
from `readLibrarySnapshot()` and Plan 070 archives.

Do not persist account IDs, auth/Discogs credentials, signed URLs, absolute file
paths, workers, raw XML/audio, or the analysis cache.

**Verify**: schema/codec tests prove exact indexes and forbidden-field rejection.

### Step 2: Implement atomic domain commands

Pass Plan 068's repository suite. Use one transaction for record-plus-tracks,
record cascade/delete and crate cleanup, crate membership, set save/autosave,
cover replacement, preference writes, and workspace create/register/rename/
delete/activate metadata. Deleting the active workspace clears its marker but
never guesses a replacement. Increment the applicable revisions
in the same transaction as every durable mutation: content commands increment both
revisions, while excluded operational metadata increments only
`repositoryRevision`. Generate typed stale/conflict/error outcomes; reconcile
Pinia only after commit or roll it back exactly.

**Verify**: injected aborts at every store write leave the pre-command graph and
revision unchanged.

### Step 3: Own cross-tab and upgrade behavior

Serialize migration/restore/wide commands with a named Web Lock where available,
and always enforce repository-revision CAS inside IDB. Broadcast committed
revision/entity invalidations; other tabs refetch or show a conflict rather than
silently overwrite. Handle `blocked`, `blocking/versionchange`, takeover, and
closed tabs with accessible recovery instructions.

Add a multi-page Playwright E2E harness using two pages in one BrowserContext;
run the critical lock/versionchange/reload suite in Chromium, Firefox, and
WebKit. The single-page Vitest Browser project remains useful for component/
repository behavior but is not the multi-tab proof.

**Verify**: two real pages cannot lose an edit, double-run a migration, or stay
silently stale after delete/reset in the declared browser matrix.

### Step 4: Fail closed on storage health problems

Probe IDB with a committed test transaction before a workspace is offered.
Classify unavailable, quota, blocked-upgrade, corrupt/missing-workspace marker,
and unknown errors. Enumerate intact named workspace manifests even when the
active marker is absent/corrupt; never delete, activate, or recreate one during
diagnosis. A failed durable write rolls back optimistic state and puts
the workspace into an explicit read-only recovery state until retry/refetch;
never fall back to memory while saying saved.

Expose `navigator.storage.estimate()` only as an approximate diagnostic. Do not
infer private browsing from quota heuristics.

**Verify**: real-browser unavailable/quota/blocked/error simulations show the
correct state and no phantom writes.

### Step 5: Prove scale, covers, and separation

Round-trip the Plan 063 corpus and 2 MiB WebP covers, test atomic deletion and
Blob URLs/revocation, and prove clearing analysis cache cannot touch a library.

**Verify**: repository, browser, bundle, format, convention, and full gates pass.

## Test plan

Contract suite plus reload persistence; transaction aborts; schema upgrades from
every supported version; duplicate/broken refs; 1k/10k scale; Blob round-trip;
quota; blocked upgrade; IDB deletion; multi-tab rapid edits/reset; stale CAS;
browser restart; active-marker loss/corruption; named workspace rename; and
Chromium/Firefox/WebKit capability behavior with explicit fail-closed fallback.

## Done criteria

- [x] Every mutable domain command is durable and atomic before success is shown.
- [x] Reload, multi-tab, schema-upgrade, quota, and Blob behavior pass in a real browser.
- [x] Library and disposable analysis cache cannot clear or migrate each other.
- [x] Content/operational revisions and storage health support truthful backup UX.
- [x] Multiple named Local workspaces remain enumerable when active-marker recovery is required.
- [x] Bundle and full repository gates pass.

## STOP conditions

Stop if a command requires a cross-store mutation that cannot be atomic, if a
dependency hides upgrade/transaction semantics, if IDB failure falls back to
memory, or if managed covers cannot be bounded/tested as Blobs.

## Maintenance notes

Browser persistence reduces normal reload loss; it does not protect against
site-data clearing, private-session closure, profile/device loss, or every
browser eviction policy. Plan 070 is the user-owned recovery boundary. The
2026-07-28 physical macOS Safari repository smoke is recorded in
`docs/browser-library-physical-safari.md`; iOS and full application support
remain separate evidence.
