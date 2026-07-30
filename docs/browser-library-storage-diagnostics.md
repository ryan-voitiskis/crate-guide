# Browser Library Storage Diagnostics

The browser-library repository stores named Local workspaces in the versioned
`crate-guide-library` IndexedDB database. A successful committed write survives
ordinary reloads in the same browser profile, but it is **not a backup** and is
not copied to Crate Guide's database. Site-data clearing, browser-profile or
device loss, private-session closure, and browser eviction can still remove it.
Portable exports are the user-controlled recovery boundary.

The dated physical macOS Safari repository smoke is recorded in
[`browser-library-physical-safari.md`](./browser-library-physical-safari.md).
That evidence is narrower than a complete application or iOS Safari support
claim.

This document is the engineering and support contract for storage health. It
must not be simplified into an “online” signal, a quota percentage, or an
in-memory fallback.

## Availability probe

Offer a browser workspace only after a committed probe has completed:

1. Open the supported version of `crate-guide-library` and handle upgrade,
   `blocked`, and `versionchange` events.
2. In a read/write transaction, write a disposable marker and a small Blob.
3. Wait for the transaction's `complete` event. A request-level success alone
   is not proof of a committed write.
4. Open a new read transaction and verify both values, including the Blob
   bytes and MIME type.
5. Remove the disposable values in another committed transaction.
6. Close the probe connection on success or failure.

Do not expose or create a workspace if any required step fails. In particular,
do not switch to a memory repository while describing the workspace as saved.

## Diagnostic states

| State         | Meaning                                                                                                      | Recovery behavior                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `available`   | Open, committed scalar write, committed Blob write, and readback succeeded.                                  | Workspace creation and writes may be offered.                                                                                               |
| `read_only`   | Existing content was read, but a durable mutation failed or the repository cannot safely accept more writes. | Preserve the last committed snapshot, reject mutations, and offer retry/refetch/export where safe. Never claim the failed change was saved. |
| `unavailable` | The browser storage contract could not be established.                                                       | Do not create or activate a Local workspace. Explain that browser storage is unavailable in this context.                                   |

Preserve a classified reason alongside the high-level state:

- **quota**: the transaction failed with a quota/storage-full result. Roll back
  optimistic UI, preserve existing committed data, and recommend exporting or
  freeing site storage. `navigator.storage.estimate()` is supporting evidence
  only; it is approximate and must not be used to predict whether the next
  write will commit.
- **blocked upgrade**: another page or process still owns an older connection.
  Ask the user to close or reload other Crate Guide tabs, then explicitly
  retry. Never delete the database to unblock an upgrade.
- **blocking/versionchange**: this page is preventing a newer schema from
  opening. Close its connection promptly, invalidate the repository, and ask
  the user to reload before writing again.
- **corrupt or missing active marker**: the selected workspace cannot be
  resolved. Enumerate intact named manifests and offer explicit recovery. Do
  not create a replacement, guess a workspace, delete data, or change the
  active marker during diagnosis.
- **unknown**: retain the browser's error name/message for diagnostics, use a
  safe user-facing explanation, and fail closed.

Do not infer private browsing from a small quota, an error name, or any other
heuristic. Report only the observed storage behavior.

## Named workspace recovery

The active-workspace marker is a pointer, not ownership of the data. Losing or
corrupting it must not make intact workspaces disappear. Recovery enumeration
is read-only and reports each valid manifest by stable ID, user-visible name,
last successful write, content counts, and storage-health information that can
be read safely.

Opening, renaming, deleting, or activating a recovered workspace always
requires an explicit action. Deleting the active workspace clears its marker;
it does not select a replacement. A diagnosis pass never mutates manifests or
revisions.

## Revision semantics

Every command compares the expected `repositoryRevision` inside the same
IndexedDB transaction as its writes. A stale page receives a conflict and
refetches instead of overwriting a later commit.

| Mutation                                                                              | `contentRevision` | `repositoryRevision` |
| ------------------------------------------------------------------------------------- | ----------------: | -------------------: |
| Records, tracks, crates, sets, preferences, or managed covers                         |                +1 |                   +1 |
| Workspace operational metadata, export marker, draft, copy receipt, or storage health |         unchanged |                   +1 |
| Failed or aborted transaction                                                         |         unchanged |            unchanged |

An export of content revision N records N as the last exported revision. The
receipt must not create content revision N+1 or immediately tell the user that
the just-exported library has new unexported changes.

## Multiple pages

Wide commands and upgrades use a named Web Lock when available, while
repository-revision compare-and-swap remains mandatory in every browser. Web
Locks serialize cooperating pages; they are not the integrity boundary.

After a commit, publish the workspace ID, committed repository revision, and
the smallest useful entity/delete/reset invalidation through
`BroadcastChannel`. A receiving page refetches or surfaces a conflict. It must
not silently retain deleted entities, continue editing a reset workspace, or
assume that receiving a broadcast means its own pending command committed.

## Database separation

Durable Local libraries and disposable audio-analysis results have independent
lifecycles:

| Database                  | Owns                                                                                                                              | Must never own                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `crate-guide-library`     | Workspace manifests, portable domain entities, preferences, managed cover Blobs, repository metadata, and workflow-draft metadata | Raw audio/XML, credentials, signed URLs, absolute paths, or analysis-cache entries |
| `crate-guide-local-audio` | Disposable versioned local-audio analysis cache                                                                                   | Workspaces, library entities, managed covers, or recovery metadata                 |

Clearing, upgrading, resetting, or deleting either database must not open or
mutate the other one.

## Playwright engine evidence

The following capability probe was run on 22 July 2026 with package-pinned
Playwright 1.59.1. Every row used two real pages in one BrowserContext and
verified IndexedDB availability, cross-page `BroadcastChannel`, named Web Lock
serialization, and a blocked schema upgrade that completed only after the old
connection observed `versionchange` and closed. The Blob result requires a
committed write, a fresh read transaction, and byte readback.

| Engine/runtime | Context                     | Runtime version | Committed Blob result                                                                    |
| -------------- | --------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Chromium       | Ephemeral headless          | 147.0.7727.15   | Pass                                                                                     |
| Firefox        | Ephemeral headless          | 148.0.2         | Pass                                                                                     |
| WebKit         | Ephemeral headless          | 26.4            | Fail closed: `UnknownError: Error preparing Blob/File data to be stored in object store` |
| WebKit         | Persistent headless profile | 26.4            | Pass                                                                                     |
| WebKit         | Persistent headed profile   | 26.4            | Pass                                                                                     |

All tested contexts exposed `indexedDB` and `indexedDB.databases()`. Chromium
and Firefox exposed numeric `navigator.storage.estimate()` diagnostics. WebKit
exposed them in the original 22 July 2026 run, but the same pinned WebKit 26.4
engine omitted the API on GitHub's Linux runner on 30 July 2026. The estimate
therefore remains optional supporting evidence, matching the repository
contract; its absence is not a durable-write failure. The two-page probe also
verified a `BroadcastChannel` delivery and that one named Web Lock held in page
A blocked the same lock in page B until release. Presence of those APIs does
not replace the committed Blob probe or repository-revision CAS.

The ephemeral WebKit discrepancy is tracked as an engine/context capability,
not papered over with scalar encoding or an uncommitted request. It resembles
the historical [WebKit Blob-in-IndexedDB failure](https://bugs.webkit.org/show_bug.cgi?id=188438),
but this test does not establish that the historical bug is the current root
cause.

Playwright WebKit is engine evidence, **not a real Safari product test**. Safari
normal browsing, Safari private browsing, iOS storage policy, eviction, and
profile persistence remain unverified until a manual or provider-backed Safari
matrix records them separately. Do not advertise Safari support from these
rows alone.

Before making a Safari support claim, record the macOS/iOS and Safari versions
and test normal and private contexts separately. In each context, capture the
committed probe result, create/reload/reopen persistence, a 2 MiB managed cover,
two-page stale-write rejection and invalidation, and blocked-upgrade recovery.
Closing and reopening a private context is a separate observation; it must not
be generalized from quota size or from normal browsing.

Diagnostics may record the timestamp, user agent, database/schema version,
failed probe stage, DOMException name/message, and approximate usage/quota.
They must not record record/track content, managed-cover bytes, workspace names,
credentials, signed URLs, source paths, raw XML/audio, or account identifiers.

Run the automated matrix with:

```sh
npx playwright install --with-deps chromium firefox webkit
BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1 npx vitest run --project e2e test/e2e/browser-library-engine-matrix.e2e.test.ts --reporter=verbose
```

The default repository gate skips an engine binary that is not installed. An
evidence run sets `BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1`, so a missing binary
fails instead of silently narrowing the matrix.

The persistent headed WebKit row is opt-in because it opens a browser window:

```sh
BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1 BROWSER_LIBRARY_HEADED=1 npx vitest run --project e2e test/e2e/browser-library-engine-matrix.e2e.test.ts -t "persistent headed WebKit" --reporter=verbose
```

The matrix deletes only its uniquely named probe databases and temporary
profiles. It serves a minimal loopback page instead of loading the application,
and never opens `crate-guide-library` or `crate-guide-local-audio`. Because the
probe creates raw Playwright pages rather than Nuxt pages, it installs the same
fail-on-page-error, console-error, and relevant request-failure guards directly
on both pages.
