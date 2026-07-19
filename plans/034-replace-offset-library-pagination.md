# Plan 034: Replace mutable offset library pagination

> **Executor instructions**: Execute after Plans 033, 036, 038, 039, and 041 in an isolated worktree.
> This is a cross-store pagination contract change: migrate every current
> caller, its test double, and the login E2E observation together. Preserve the
> user-visible sort order, prove mutation-between-pages behavior, and commit
> conventionally. The reviewer owns the tracker.

## Status

- **Priority**: P2
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 010, 026, 033, 036, 038, 039, and 041
- **Category**: correctness / data loading
- **Planned at**: commit `f399b43`, 2026-07-19
- **Completed by**: commit `5933b44` (integrated as `c3c675e`), 2026-07-19

## Why this matters

The shared helper advances fixed PostgREST offsets. With 1,001 ordered rows, a
deletion from the first page before the second request shifts the former row
1,001 to offset 999; the `1000..1999` request never sees it. Crate
reconciliation then treats that omission as authoritative and deletes a valid
local crate. Records, tracks, and saved sets share the same mutable-offset
mechanism and are exposed to the same omission.

Plan 036 makes the UUID IDs schema-immutable and adds supporting indexes.
Traverse by that cursor, then restore the product's declared
`created_at DESC, id DESC` presentation order locally. A concurrent delete may
remove a row, but must never shift an unvisited row past the cursor.

## Scope

Modify:

- `app/utils/supabasePagination.ts`
- `app/utils/supabasePagination.test.ts`
- `app/utils/supabaseOrdering.ts`
- `app/utils/supabaseOrdering.test.ts`
- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/cratesStore.ts`
- `app/stores/sessionStore.ts`
- the corresponding focused store tests
- `test/mocks/supabase.ts`
- `test/e2e/login-redirect.e2e.test.ts`

Do not change `max_rows`, weaken complete-library loading, or retain an offset
fallback that can silently omit rows. Database cursor invariants/indexes belong
to Plan 036 and must already be integrated.

## Required implementation

1. Replace the inclusive-range helper with a strict immutable-key cursor helper.
   - Fetch pages ordered by UUID `id DESC`, using `id < last_seen_id` and a
     per-request limit no greater than 1,000.
   - The callback receives a null cursor for the first page and the last
     validated ID thereafter. Treat cursor values as non-empty opaque strings;
     production UUID shape/immutability is enforced by Plan 036. Use direct
     code-unit comparison, never locale-sensitive comparison.
   - Before appending, validate every row ID, require every page to be strictly
     ID-descending, require every row to be below the incoming cursor, and reject
     duplicates globally. A valid terminal cursor cannot excuse an internally
     out-of-order page.
   - Request a confirming page after an exact full page. Keep total execution
     finite with an explicit generous maximum page/row bound; breach throws and
     commits no partial collection.

2. Migrate all four current callers.
   - Records, tracks, crates, and sets query `.order('id', { ascending: false })`,
     apply `.lt('id', cursor)` only after the first page, and `.limit(pageSize)`.
   - Keep existing owner filters and account-generation checks. Tracks must use
     Plan 036's direct `.select('*').eq('user_id', resolvedUserId)` contract;
     never reintroduce `records!inner(user_id)` or parent-loop ownership.
   - Validate every raw track row's `user_id` against the one resolved account
     before decoding/append, then strip it at the domain boundary established by
     Plan 036. A missing/mismatched owner fails the whole fetch closed.
   - Extract Plan 033's exact PostgreSQL timestamp-to-microseconds parser into a
     shared ordering utility. Do not use lossy `Date.parse`; preserve adjacent
     microseconds and equivalent-offset instants.
   - After collection/decoding, sort for presentation by `created_at DESC,
id DESC` with that shared comparator. All four stores intentionally adopt
     nulls-last newest-first behavior. Invalid timestamps occupy the same final
     bucket as null and use descending ID as a deterministic fallback.
   - Crate reconciliation consumes the presentation-sorted rows and preserves
     Plan 033's mid-fetch create ordering.

3. Preserve same-account rows created during a fetch.
   - UUIDv4 insert order is random. Define the traversal guarantee precisely:
     rows present when traversal starts are returned unless deleted/moved;
     later inserts are included at most once only if their ID falls below the
     active cursor, otherwise the next refresh discovers them.
   - Records, tracks, and saved sets currently replace their entire arrays.
     Capture starting IDs and merge current rows created after that snapshot if
     the fetched result did not include them, then sort/dedupe deterministically.
     Do not clobber a successful local create/save merely because its random ID
     sorted above an already-read cursor.
   - Crates continue using Plan 033's richer revision reconciliation; do not
     replace it with a weaker generic assignment.

4. Update test and E2E query contracts truthfully.
   - Query builders must model `limit` and conditional `lt` rather than making
     every chain return the same page accidentally.
   - The login E2E must observe successful first-page keyset completions for all
     four tables and fail if the new chain is missing/broken. Make one non-rendered
     table return exactly one full valid page followed by an empty page so the
     E2E proves a second conditional `.lt` request, not only empty first pages.
     Do not claim range coverage after `.range()` is removed.
   - The tracks double must require the same direct `user_id` filter on every
     page and reject any records embedding, so the E2E cannot pass against the
     stopped indirect query shape.

## Tests

Prove at helper and store levels:

- 0, 999, 1,000, 1,001, and 2,000 rows use exact limits/cursors and return every
  unique row once;
- deleting a first-page row between callbacks does not omit the last original
  row; inserting on either side of the cursor follows the documented
  opportunistic semantics without duplicate/infinite loops;
- repeated/non-string/empty cursor IDs, internally out-of-order pages, rows on
  the wrong side of an incoming cursor, oversized pages, bound exhaustion, and
  callback errors fail closed before state commit;
- all stores retain `created_at DESC, id DESC` presentation order, including
  adjacent microseconds, equivalent offsets, null/invalid timestamps, equal
  instants, and exact ID ties;
- crate reconciliation no longer deletes an unfetched tail row in the
  1,001-row concurrent-delete interleaving;
- records, tracks, and saved sets preserve a successful local create/save that
  completes after the fetch snapshot with IDs on both sides of the cursor;
- account reset during a later page prevents stale state application;
- every tracks page uses the same resolved owner ID, and a forged/mismatched
  returned owner fails before store commit;
- login E2E observes all four keyset chains after successful account load.

## Verification

```bash
npm run format
npx vitest run app/utils/supabasePagination.test.ts
npx vitest run --project stores \
  app/stores/__tests__/recordsStore.test.ts \
  app/stores/__tests__/tracksStore.test.ts \
  app/stores/__tests__/cratesStore.test.ts \
  app/stores/__tests__/sessionStore.test.ts
npm run test:e2e
npm run check:conventions
npm run verify
git diff --check
```

All commands exit 0. No current `fetchAllSupabasePages` offset caller or
misleading range E2E assertion remains.

## Done criteria

- [ ] Concurrent first-page deletion cannot shift an unvisited row out of view.
- [ ] Every complete-library caller uses Plan 036's immutable ID cursor contract.
- [ ] Product presentation remains newest-first with deterministic ties/nulls.
- [ ] Same-account creates during fetch are not clobbered by whole-array assignment.
- [ ] Malformed/non-advancing pages fail closed and terminate.
- [ ] Focused store, E2E, and full repository gates pass.

## STOP conditions

Stop if Plan 036's immutable/indexed ownership contract is absent, if a PostgREST caller
cannot express strict `id < cursor`, if maintaining presentation order requires
lossy timestamp conversion, if helper validation cannot reject every malformed
row before append, if the E2E double cannot distinguish page requests, or if a
representative authenticated tracks query does not use the owner/ID index without
sorting or parent loops, or if a required gate fails twice after one scoped correction.

## Maintenance notes

The traversal key and presentation key need not match. Plan 036's immutable ID cursor
protects completeness across requests; local `created_at/id` sorting preserves
the product contract after all rows are collected. This is not a database
snapshot: random later inserts above the cursor intentionally wait for refresh.
