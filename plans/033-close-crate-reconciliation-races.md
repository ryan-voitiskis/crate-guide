# Plan 033: Close remaining crate reconciliation races

> **Executor instructions**: Execute in an isolated worktree from the stated
> integration commit. Treat the interleavings below as the contract; do not
> replace them with happy-path assertions. Touch only scoped files, run the
> complete store and repository gates, and commit conventionally. The reviewer
> owns the plan tracker.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 028
- **Category**: correctness / concurrency
- **Planned at**: commit `f399b43`, 2026-07-19
- **Completed by**: commit `4ca9893` (integrated as `c2da28c`), 2026-07-19

## Why this matters

Independent review of Plan 028 reproduced five remaining crate-state defects:
a delayed metadata response can poison a newer version floor; an in-flight
fetch can resurrect an optimistically deleted crate; stale membership responses
can report success even when reconciliation rejects their state; a crate created
during fetch is moved out of descending order; and concurrent create/delete
activity flags clear while work remains.

The authoritative row, version floor, rendered row, revisions, return values,
toasts, ordering, and activity flags must describe the same outcome under every
response order.

## Scope

Modify only:

- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`

Do not change database RPCs/schema, pagination mechanics (Plan 034), unrelated
stores, or user-facing copy except suppressing a false success/info toast.

## Required implementation

1. Make stale metadata completion version-aware before merging owned fields.
   - Compare the decoded response version with the cached authoritative floor
     before copying any field into the authoritative or rendered row.
   - A null, older, or equal response that cannot advance a populated floor
     must release only fields still owned by that operation and render the
     current authoritative row plus newer optimistic owners.
   - Never retain v2 field data with a v3 floor. A later equal-v3 response must
     not be needed to repair local state.
   - Preserve the existing same-field latest-owner semantics and truthful
     return value for operations invalidated by cleanup/delete.

2. Tombstone deletion before the optimistic splice.
   - Advance the crate revision before issuing DELETE so any fetch/membership/
     metadata snapshot that began earlier cannot reinsert or mutate the crate.
   - A fetch that sees the revision change and no current row must omit it.
   - On DELETE failure, restore the safest authoritative row at its original
     position while retaining a revision boundary that rejects already-started
     responses. On success, keep the row/cache/owners absent.

3. Derive membership success from reconciled current state.
   - Do not report success merely because an RPC response decoded.
   - After version reconciliation, add succeeds only if the current crate
     contains the record; remove succeeds only if it does not.
   - Because the SQL RPCs are idempotent, do not let a possibly stale local
     duplicate/absence precheck bypass server reconciliation for authenticated
     non-demo mutations.
   - Emit success/info toasts only for the reconciled outcome; stale rejected
     responses must not produce a false success signal.

4. Preserve declared crate ordering during fetch reconciliation.
   - Merge rows created after the fetch snapshot according to the store's
     `created_at DESC, id DESC` contract instead of appending them.
   - Define deterministic handling for nullable timestamps and exact ID ties;
     do not rely on response completion order.

5. Make create/delete activity state counter-owned and account-aware.
   - Use idempotent begin/finish accounting comparable to update operations.
   - Two concurrent creates or deletes of different crates keep the flag true
     until the final current-account operation settles.
   - Account reset clears counters; stale-account finalizers cannot decrement
     or relight the replacement account's flags.

## Tests

Add deterministic deferred-promise tests for:

- local cleanup/revision change and a fetched v3 remote metadata row occurring
  before a delayed v2 metadata response; row and floor remain v3;
- fetch snapshot -> optimistic DELETE -> fetch returns old row: no resurrection
  while pending, on success, or after rollback followed by another stale reply;
- delayed add-v2 -> fetched remove-v3 -> add resolves: state stays removed,
  return is false, and no add-success toast; include symmetric remove coverage;
- a stale local duplicate/absence precheck still invokes the idempotent RPC and
  reconciles its returned row;
- create during fetch remains in `created_at DESC, id DESC` position;
- two concurrent creates and two concurrent deletes retain activity flags until
  both settle, including one failure and an account reset.

Retain all existing 70 Plan 028 tests and add invariants that inspect both
rendered behavior and subsequent equal/older/newer responses.

## Verification

```bash
npm run format
npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts
npm run check:conventions
npm run verify
git diff --check
```

All commands exit 0 and only the two scoped files change.

## Done criteria

- [ ] Cached crate data and its version floor are always coherent.
- [ ] Pending deletes cannot be resurrected by older fetches.
- [ ] Membership return values/toasts match reconciled membership.
- [ ] Mid-fetch creates retain deterministic descending order.
- [ ] Create/delete activity flags cover all current concurrent operations.
- [ ] Focused interleavings and full verification pass.

## STOP conditions

Stop if a fix requires changing the atomic membership RPC contract, if reliable
ordering requires the pagination redesign owned by Plan 034, if an invalidated
response can still alter a newer authoritative cache, or if a required gate
fails twice after one scoped correction.

## Maintenance notes

Version acceptance must precede data merging. Revisions answer whether an
operation still owns the local lifecycle; timestamps answer whether its server
row is newer. Neither check substitutes for the other.
