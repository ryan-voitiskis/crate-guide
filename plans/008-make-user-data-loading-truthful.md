# Plan 008: Make user-data loading report truthful outcomes

> **Executor instructions**: Follow the contract in this plan exactly. The goal
> is truthful completion and stable retry behavior, not a new retry framework.
> Run every gate and stop rather than expanding auth scope. Update the tracker
> row when done unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   app/composables/useUserData.ts \
>   app/composables/__tests__/useUserData.test.ts \
>   app/stores/recordsStore.ts \
>   app/stores/tracksStore.ts \
>   app/stores/cratesStore.ts \
>   app/stores/__tests__/recordsStore.test.ts \
>   app/stores/__tests__/tracksStore.test.ts \
>   app/stores/__tests__/cratesStore.test.ts
> ```
>
> Run `git status --short`. Plan 007 should be DONE to avoid overlapping edits
> to the track/crate stores.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 007
- **Category**: bug
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

`useUserData` treats only rejected store promises as failures, but all three
production fetch actions catch errors and resolve `undefined`. A failed initial
query is therefore marked loaded and normal automatic loading stops. The tests
mock rejections that production never emits, creating false confidence. This
plan gives every fetch a boolean contract and shares concurrent work so all
callers observe the same real result.

## Current state

- `app/composables/useUserData.ts:36-50` uses `Promise.allSettled`, inspects
  rejection status, and sets `hasLoadedData = true` when all promises fulfill.
- `recordsStore.fetchAllRecords` (`recordsStore.ts:90-118`),
  `tracksStore.fetchAllTracks` (`tracksStore.ts:119-169`), and
  `cratesStore.fetchAllCrates` (`cratesStore.ts:19-45`) catch query/auth errors,
  show local toasts, and fulfill without an outcome.
- Each action returns early when its loading flag is already true, so a second
  caller receives `undefined` without waiting for the in-flight query.
- `useUserData.test.ts:191-223` uses `mockRejectedValue` for normal store
  failures even though production stores swallow them.
- `useUserData.ts:80-99` combines a sign-in `watchEffect`, a sign-out watcher,
  and persisted-session bootstrap. If failure starts leaving
  `hasLoadedData = false` under the same reactive effect, careless changes can
  create immediate retry/toast loops.

Other callers may ignore the returned boolean; optional-result use must not be
a breaking change. Existing store-level error toasts remain the user feedback,
so `useUserData` must not add a duplicate aggregate toast.

## Commands you will need

| Purpose           | Command                                                                                                                                                                                                     | Expected on success         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Focused tests     | `npx vitest run --project stores app/composables/__tests__/useUserData.test.ts app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts` | exit 0                      |
| Full verification | `npm run verify`                                                                                                                                                                                            | exit 0                      |
| Build             | `npm run build`                                                                                                                                                                                             | exit 0                      |
| Format            | `npm run format`                                                                                                                                                                                            | exit 0; intended files only |

## Scope

**In scope**:

- `app/composables/useUserData.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/cratesStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Supabase auth configuration, middleware, queries, schema, or retry policy.
- Runtime decoding of JSON fields; Plan 009 owns that boundary.
- Cross-store mutation ownership; Plan 010 owns that refactor.
- Changing store-level error copy/toast ownership.
- Automatic backoff, timers, network-status listeners, or infinite retry.
- Refactoring import/enrichment callers that legitimately ignore refresh
  booleans unless typecheck proves an adjustment is required.

## Git workflow

- Branch: `codex/008-truthful-user-data-loading`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `fix(data): preserve failed user-data load state`.
- Do not push or open a PR unless instructed.

## Target contract

Each fetch action must be a non-`async` public function backed by one in-flight
native `Promise<boolean>` operation:

```ts
let fetchPromise: Promise<boolean> | null = null

function fetchAllRecords(): Promise<boolean> {
	if (fetchPromise) return fetchPromise
	fetchPromise = performFetchAllRecords()
	return fetchPromise
}
```

Execution reconciliation: Pinia wraps the native Promise returned by each
action invocation, so public store callers cannot receive reference-identical
Promise objects. The observable store contract is one shared authentication and
query operation with identical boolean outcomes for concurrent callers. The
plain coordinator is not Pinia-wrapped and does return the exact same in-flight
Promise reference.

The private async operation returns `true` only after a successful query and
state assignment, returns `false` after auth/query failure and the existing
toast, and clears both the loading flag and in-flight reference in `finally`.
Apply the same shape independently in all three stores.

The coordinator must use the same pattern with its own
`loadPromise: Promise<boolean> | null`. Its public outcomes are fixed:

- data already loaded → `Promise.resolve(true)`;
- no authenticated/persisted user can be resolved → `false`;
- load already in flight → return that exact coordinator promise;
- refresh during an in-flight load → clear the loaded flag and share/await the
  current promise rather than starting a second load.

## Steps

### Step 1: Give each store a shared in-flight boolean result

Refactor record, track, and crate fetch actions to the target contract. Keep
their queries, ordering, state assignment, logging, and existing error toasts.
On failure, do not clear or partially replace prior local data.

Auth failure and query failure both return `false`. An empty successful query
returns `true` and assigns an empty array. Concurrent calls while loading must
share the underlying operation and outcome and execute exactly one Supabase
query.

**Verify**: focused tests for each store prove success true, auth/query false,
old state preserved on failure, loading flags reset, and two concurrent calls
share one query/result.

### Step 2: Make the coordinator inspect real outcomes

In `useUserData`:

- replace the `isLoadingUserData` early return with a coordinator-level shared
  in-flight promise using the outcomes defined above;
- use `Promise.all` over the three boolean-returning actions;
- set `hasLoadedData` only when all three values are `true`;
- return that aggregate boolean from `loadAllUserData` and
  `refreshAllUserData`;
- remove the aggregate `Failed to load: ...` toast because stores already own
  their error messages;
- preserve `isLoadingUserData` cleanup in `finally`;
- keep `clearAllUserData` behavior unchanged.

Unexpected thrown exceptions may still be caught at the coordinator boundary,
logged/toasted generically, and return false; they are not the normal store
failure contract.

**Verify**: `useUserData` tests use `mockResolvedValue(true/false)`, never
`mockRejectedValue` for ordinary failures, and prove partial failure does not
set loaded.

### Step 3: Prevent reactive retry loops

Replace the sign-in `watchEffect` plus separate sign-out watcher with one
watcher of `user.supaUser?.id`:

- on transition to a user ID, call load once when not already loaded/loading;
- on transition to no user, clear all data;
- do not rerun merely because `hasLoadedData` remains false after failure.

Use `{ immediate: true }` so a user that is already hydrated when the composable
is created loads immediately. Without this option, bootstrap intentionally
skips that user and no load would start.

Retain persisted-session bootstrap for the case where the Supabase user ref has
not hydrated. Store in-flight promise sharing must absorb any bootstrap/sign-in
race. Manual `refreshAllUserData` is the retry mechanism after failure.

**Verify**: tests prove one failed load does not immediately retry while user ID
is unchanged, manual refresh can later succeed, and sign-out clears stores.

### Step 4: Update all mocks and run regressions

Update test defaults and any typed caller mocks to resolve boolean values. Do
not force every caller to branch on the result; only code that needs outcome
semantics must inspect it.

Run focused tests, `npm run format`, `npm run verify`, and `npm run build`.

**Verify**: all exit 0 and
`git diff --name-only <implementation-start SHA>..HEAD` contains only declared
files and tracker status if owned by the executor.

## Test plan

For each store:

- successful empty/non-empty query returns true;
- auth and database failures return false and preserve prior data;
- loading/in-flight state is cleared after success and failure;
- two concurrent calls execute one query and both receive the same outcome.

For `useUserData`:

- all true marks loaded and returns true;
- any false keeps loaded false and returns false;
- no duplicate aggregate error toast;
- manual refresh after failure can succeed;
- failed load does not automatically loop;
- sign-out still clears all stores;
- bootstrap and reactive sign-in do not duplicate store queries.
- already-loaded, no-user, concurrent-load, and refresh-during-load return the
  exact outcomes defined in Target contract.

## Completion and reconciliation

- Implemented by commit `5966b7c4d0bc32cc7341c1b9c310b69df85eb86a`,
  integrated as `639386fed550158259885a504255f536fbe73741`.
- Records, tracks, and crates now return truthful booleans, preserve prior state
  on authentication/query failure, run one underlying auth/query operation for
  concurrent callers, and reset loading/in-flight state only after settlement.
- Because Pinia wraps each action result, public store Promise reference
  identity is impossible. Tests instead prove one shared operation and
  identical concurrent outcomes. The plain coordinator is reference-identical,
  including refresh sharing an active load, then creates a fresh Promise after
  settlement.
- Ordinary store failures produce no duplicate aggregate toast, and an
  unchanged user ID does not trigger an automatic retry loop; manual refresh is
  the explicit retry path.
- The auth watcher lives in the caller's Vue effect scope and is disposed when
  that scope stops. Tests stop every scope after draining pending microtasks so
  watcher work cannot leak between consumers or cases.
- Authentication generations and loaded-user identity protect sign-out,
  account switches, persisted-session bootstrap, and late hydration. Stale
  results are discarded and stores cleared; unexpected failures drain every
  started store Promise before a replacement-user reload can begin.
- Verification used Node 24.12.0 and npm 11.6.2. All 156 focused tests, full
  `npm run verify`, production `npm run build`, formatting, and
  `git diff --check` passed across the exact eight-file implementation scope.

## Done criteria

- [x] All three fetch actions return `Promise<boolean>` with a shared in-flight
      promise.
- [x] Success/failure semantics are explicit and prior data survives failure.
- [x] `hasLoadedData` is true only after three successful loads.
- [x] Tests model production boolean failures, not synthetic rejections.
- [x] A failed attempt has no automatic retry loop; manual refresh works.
- [x] Existing store error feedback and all current callers remain functional.
- [x] Full verification/build pass with no out-of-scope changes.

## STOP conditions

Stop and report if:

- A current caller relies on a thrown fetch error or `undefined` result.
- Product requirements require uncontrolled automatic retry rather than manual
  refresh after failure.
- Resolving bootstrap races requires changing Supabase auth configuration.
- Boolean outcomes cannot distinguish an actual successful empty query from an
  auth/query failure.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- New store fetch actions should return truthful outcomes and share concurrent
  work; do not use `isLoading` early returns as an implicit result.
- Keep data decoding and retry policy separate from fetch-completion semantics.
- Reviewers should explicitly test existing-data preservation on failure.
