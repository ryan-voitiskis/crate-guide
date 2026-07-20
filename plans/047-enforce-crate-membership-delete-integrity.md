# Plan 047: Enforce crate membership and record-delete integrity

> **Executor instructions**: Execute after Plan 044. Treat crate membership as
> a database invariant, not a cooperative-client convention. Establish and
> document one lock order, prove privileges cannot bypass it, then align local
> reconciliation. Use a new migration; never rewrite applied migrations.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 013, 028, 033, 038, 039, 043, and 044
- **Category**: database integrity / concurrency / client reconciliation
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: TODO

## Why this matters

`remove_record_from_collection` removes existing crate references and then
deletes the record. A concurrent `add_record_to_crate` can validate the record
before deletion and append it afterward, leaving an orphan UUID. Authenticated
table CRUD also permits direct record deletion and direct mutation of the crate
array, bypassing RPC validation. The client contains an exported direct
`deleteRecord` path even though the product removal flow uses the cleanup RPC.

Locally, `removeRecordFromAllCrates` invalidates every crate revision. An
unrelated membership change can succeed on the server and have its response
discarded merely because a different record was removed.

## Scope

Create one forward migration after `20260719130000_close_account_cover_cleanup_gaps.sql`.

Modify:

- `supabase/tests/crate_membership.sql`
- an existing/new concurrency integration test outside pgTAP if two sessions
  are required for the exact interleaving
- `app/stores/cratesStore.ts`
- `app/stores/recordsStore.ts`
- `app/composables/useLibraryMutations.ts`
- their focused tests
- generated database type copies if the RPC surface changes

Do not weaken RLS, expose SECURITY DEFINER functions to anonymous users, accept
caller-supplied owners, or rewrite existing migrations.

## Drift check

```bash
git status --short
rg -n "add_record_to_crate|remove_record_from_collection|FOR UPDATE|GRANT .*records|GRANT .*crates" supabase/migrations
rg -n "deleteRecord|removeRecordFromAllCrates|invalidateCrate" app/stores app/composables
```

STOP if production has direct table consumers not represented in the
repository, or if no repeatable two-session test can prove the chosen lock
order. Reconsider a normalized membership table rather than shipping an
unproved array protocol.

## Required implementation

1. Establish one record-before-crate lock order.
   - `add_record_to_crate` must acquire an owned record lock before its owned
     crate lock, revalidate both, and then append idempotently.
   - `remove_record_from_collection` must lock the owned record first, then lock
     affected crates in deterministic ID order, remove references, and delete
     the record in the same transaction.
   - Once deletion owns the record lock, no later add may validate that record.
     An add already holding the record lock must complete before cleanup scans
     and removes its membership.

2. Remove browser bypasses.
   - Revoke direct authenticated record DELETE and require the cleanup RPC.
   - Prevent direct crate-array updates while preserving only the exact metadata
     columns required by crate editing. Inserts must start with an empty
     membership or use a validated creation RPC.
   - Keep authenticated SELECT and necessary CRUD operations explicit and add
     privilege assertions to pgTAP.

3. Remove the dead unsafe client path.
   - Delete or make private the direct `recordsStore.deleteRecord` method after
     proving no production consumer remains.
   - Keep `removeRecordFromCollection` as the single application deletion
     contract and validate its exact affected owned record.

4. Invalidate only affected local crates.
   - Capture crates containing the deleted record and mutate/invalidate those
     IDs only.
   - An unrelated in-flight add/remove must retain response ownership and
     reconcile normally.
   - Account reset and delete-all remain allowed to invalidate every crate.

5. Prove the races and privilege boundary.
   - Use two independent database sessions to pause add after record locking and
     deletion before/after the same boundary in both orders. The final state
     contains neither a record row nor any membership reference.
   - Prove direct DELETE and direct membership-array UPDATE fail for
     authenticated while RPC flows succeed only for owned rows.
   - Defer an unrelated client membership response across local record cleanup
     and prove its server result is published locally.

## Test plan

```bash
npm run format
npm run test:db
npm run genTypes
npm run check:database-types
npx vitest run --project stores \
  app/stores/__tests__/cratesStore.test.ts \
  app/stores/__tests__/recordsStore.test.ts
npx vitest run app/composables/__tests__/useLibraryMutations.test.ts
npm run check:conventions
npm run verify:full
git diff --check
```

Run the explicit two-session concurrency harness in addition to pgTAP and
record its command in the final handoff.

## Done criteria

- [ ] Concurrent add/delete cannot leave an orphan membership in either ordering.
- [ ] Browser roles cannot directly delete records or update crate membership arrays.
- [ ] The application exposes one validated record-removal path.
- [ ] Removing a record invalidates only crates that contained it.
- [ ] SQL, concurrency, store, generated-type, and full gates pass.

## STOP conditions

Stop if granular privileges break a required current client operation, if the
lock order deadlocks under the reproduction, if a SECURITY DEFINER path can
cross ownership, or if array membership cannot be made enforceable without a
join-table migration. Do not paper over an integrity gap with client retries.

## Git workflow

- Branch: `codex/047-enforce-crate-membership-delete-integrity`
- Commit: `fix(crates): enforce membership integrity during deletion`
