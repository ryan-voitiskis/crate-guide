# Plan 044: Reconcile same-account library writes

> **Executor instructions**: Execute from a clean branch based on the current
> integration head. Treat a fetch and every mutation as independently ordered
> operations, reproduce each race before changing source, preserve account
> boundaries from Plan 043, and commit conventionally. The reviewer owns the
> tracker.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none (historical Plans 034, 041, and 043 have landed)
- **Category**: correctness / concurrency / reconciliation
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

The library stores now reject work from a replaced account, but same-account
operations still have incomplete ownership. Record updates retain a numeric
array index across awaits. Record fetch reconciliation recognizes rows created
during a fetch but not updates or deletes. Track fetch reconciliation likewise
preserves only proven creates. A stale fetch can therefore overwrite a
successful update or resurrect a successful deletion.

`createRecordWithTracks` also calls coalescing fetch methods after its RPC
commits. If an older fetch is already active, the post-write call joins that
pre-commit snapshot, cannot find the new record, and reports `null` after the
database write succeeded. The dialog remains open and a retry can create a
duplicate.

Record search is a second copy of library state. `searchResults` stores record
objects captured when the query last changed, while create and update mutate
only `records`. An active search can therefore show stale fields, omit a new
match, or retain a record that no longer matches.

## Scope

Modify:

- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/discogsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/discogsStore.test.ts`
- `test/nuxt/records-page-search.nuxt.test.ts` (create)
- `app/components/shared/InputRecordsSearch.vue` only if the corrected store
  contract requires a presentation adjustment
- `app/components/records/DialogRecordCreateManual.vue` and its existing Nuxt
  test only if the corrected store result requires a presentation adjustment

One small shared reconciliation helper may be created if both stores can use it
without erasing their different row and mutation contracts.

Do not change database schemas, keyset ordering, account-generation ownership,
record/track domain shapes, or Discogs import idempotency.

## Drift check

```bash
git status --short
git rev-parse --short HEAD
rg -n "recordIndex|startingIds|createdDuringFetch|startingRevision|trackCreateProvenance|fetchPromise|fetchAllRecords|fetchAllTracks|searchResults|displayedRecords|performSearch" app/stores/{recordsStore,tracksStore,discogsStore}.ts
rg -n "during.*fetch|stale.*fetch|createRecordWithTracks|delete.*fetch|update.*fetch" app/stores/__tests__
```

STOP if another implementation already gives both stores explicit
create/update/delete provenance relative to a fetch snapshot, or if making a
post-write fetch fresh requires discarding a valid same-account mutation.

## Required implementation

1. Define one explicit operation-order contract.
   - Give each same-account record mutation a monotonic revision and per-row
     ownership. Track create, update, and delete provenance separately enough
     to reconcile a fetch that began before each operation committed.
   - Reuse the track store's serialized per-ID boundary, extending its fetch
     reconciliation to successful updates and delete tombstones.
   - Clear provenance on account reset. Retire it only after a later
     authoritative fetch confirms the server state it represents.

2. Remove numeric-index ownership from record writes.
   - Re-find a row by ID immediately before optimistic commit, server commit,
     and rollback.
   - Roll back only if the operation still owns the current optimistic value.
     An older failure must not undo a newer successful update.
   - Serialize update/delete work per record or provide an equivalently strict
     revision contract. Delete success must filter by ID again; rollback must
     not duplicate an already restored row.

3. Reconcile authoritative fetches against all post-snapshot writes.
   - Preserve a proven later local create absent from a stale response.
   - Preserve a proven later local update over a stale fetched copy of the same
     ID.
   - Suppress a fetched row covered by a proven later delete tombstone.
   - Fetched server rows win when there is no later owned mutation. Collapse
     duplicates and retain exact `created_at DESC, id DESC` ordering.

4. Add a genuinely fresh post-write fetch contract.
   - A `fresh` request must wait for a currently coalesced traversal and then
     start a new traversal whose snapshot begins after the write completed.
   - Concurrent fresh callers may share that new traversal; they must not cause
     an unbounded fetch chain.
   - `createRecordWithTracks` must return a successful, ownership-validated
     creation result even if a presentation refresh fails. Never translate a
     committed insert into an apparent creation failure.
   - Discogs import/retry refresh must use the fresh contract and surface a
     refresh failure separately from import completion.

5. Add adversarial interleaving tests.
   - Reorder the records array while an update is pending and prove only the
     submitted ID changes on success and failure.
   - Complete update/delete before an older record and track fetch; prove the
     fetch cannot overwrite or resurrect them.
   - Start a pre-commit fetch, commit manual record creation, then resolve the
     stale fetch. Prove a post-commit traversal occurs and the function returns
     the created record exactly once.
   - Cover simultaneous fresh callers, refresh failure after committed write,
     same-ID update/update, and update/delete ordering.

6. Make active search a derivation of current records.
   - Keep one normalized query as state and compute displayed matches from the
     authoritative `records` array. Do not retain record objects in a second
     mutable result array.
   - Preserve current artist/title/label/catalogue/year matching semantics,
     result ordering, empty-query behavior, and the input's debounce contract.
   - A create or update must immediately enter, leave, or refresh the active
     result set without another keystroke. Deletion remains immediate through
     the authoritative array.
   - If compatibility requires exposing `searchResults`, expose a readonly
     computed value rather than a writable snapshot.

## Test plan

```bash
npm run format
npx vitest run --project stores \
  app/stores/__tests__/recordsStore.test.ts \
  app/stores/__tests__/tracksStore.test.ts \
  app/stores/__tests__/discogsStore.test.ts
npx vitest run --project nuxt test/nuxt/records-page-search.nuxt.test.ts
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [x] No record mutation writes or rolls back through an index retained across an await.
- [x] A pre-mutation fetch cannot overwrite a successful update or resurrect a deletion.
- [x] A committed manual import cannot return an apparent failure because it joined an old fetch.
- [x] Fresh fetches are bounded, coalesced at the correct boundary, and account-owned.
- [x] Active record search is derived from current records and updates after create, edit, cover change, and delete.
- [x] Focused store tests and the full repository gate pass.

## STOP conditions

Stop if mutation ordering cannot be expressed without changing public database
semantics, if the fresh-fetch contract can loop under continuous writers, if a
stale operation can still own replacement-account state, or if a required gate
fails twice after one scoped correction.

## Git workflow

- Branch: `codex/044-reconcile-same-account-library-writes`
- Commit: `fix(library): reconcile concurrent writes and fetches`
