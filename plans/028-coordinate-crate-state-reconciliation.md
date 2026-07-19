# Plan 028: Coordinate every crate writer through one reconciliation boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed in scope. If a STOP condition occurs, stop and report
> instead of weakening the acceptance criteria. The reviewer maintains
> `plans/README.md`; do not edit the index.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/011-invalidate-stale-account-fetches.md`, `plans/013-make-crate-membership-atomic.md`
- **Category**: correctness
- **Planned at**: commit `812f102`, 2026-07-19
- **Completed by**: commit `51514cd`; integration commit `22373de`

## Why this matters

Plan 013 made each membership mutation atomic in PostgreSQL and reconciled
concurrent membership RPC responses by microsecond `updated_at`. Its client
version floor is limited to membership responses, however. Full fetches,
metadata updates, optimistic delete rollback, and record-cleanup helpers still
write crate state outside that boundary. An older delayed membership response
can therefore overwrite a newer authoritative row or reintroduce a record that
local cleanup removed. `clearCrates()` also clears the version map without
invalidating in-flight RPC responses, so obsolete work can affect a later login
for the same account and show a misleading success toast.

The store needs one account-aware, version-aware reconciliation boundary for
all authoritative crate rows, explicit invalidation for local cleanup, and one
owner for the shared update activity flag.

## Evidence and current state

At `812f102` in `app/stores/cratesStore.ts`:

- `performFetchAllCrates()` assigns `crates.value = rows as Crate[]` directly.
- `updateCrate()` installs its full response and restores a captured full row
  directly, so either path can overwrite concurrent membership state.
- `reconcileMembershipCrate()` is the only writer that reads or advances
  `appliedMembershipVersions`.
- `mutateCrateMembership()` captures neither `accountGeneration` nor the
  current account ID before awaiting the RPC.
- `removeRecordFromAllCrates()` and `clearAllCrateRecords()` change records
  locally without invalidating pending membership responses.
- metadata and membership operations independently set and clear the same
  `isUpdatingCrate` boolean.
- `decodeMembershipCrate()` checks only the requested ID, array shape, and a
  parseable timestamp before casting the entire unknown object to `Crate`.
  Non-string record entries, wrong `user_id`, missing metadata, and normalized
  impossible dates can pass.

The database migration remains authoritative: the crate trigger makes every
committed update timestamp strictly monotonic at microsecond precision, and the
membership RPCs return the complete updated row. Do not replace database order
with request-start or response-arrival order.

## Scope

Modify only:

- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`

Do not modify migrations, generated database types, other stores/composables,
or UI components. Do not serialize all requests on the client; independent
requests may remain concurrent and must reconcile by authoritative database
order.

## Required design

1. Replace membership-only reconciliation with one internal crate-row decoder
   and authoritative-row applier used by fetch, create, metadata update,
   membership, and any rollback that installs a server row.
   - Validate every generated `Crate` row field: `id`, `name`, `user_id`,
     nullable `description`/`color`/timestamps, and `records` containing only
     strings.
   - Require the expected crate ID and verified account ID where the caller
     knows them.
   - Parse PostgreSQL timestamps to microseconds without accepting impossible
     calendar dates or malformed offsets. Preserve six-digit ordering.
   - Maintain a per-crate authoritative version floor across every accepted
     server row, not only membership rows.

2. Make full-fetch reconciliation version-aware.
   - Preserve Plan 011's fetch/account generation checks and pagination.
   - A delayed fetch row must not replace a newer accepted row for the same
     crate, and a delayed membership response must not replace a newer fetch
     row.
   - Reconcile removals deliberately; do not blindly concatenate stale rows or
     resurrect a locally deleted crate.
   - Invalid rows fail the fetch safely with the existing generic error path;
     do not partially commit an unvalidated page.

3. Make metadata updates concurrency-safe.
   - Keep the optimistic metadata UX.
   - Apply the complete successful server row through the shared authoritative
     reconciler.
   - On failure, undo only still-owned optimistic metadata fields or use an
     equivalent operation token; never restore a captured full row over newer
     records/metadata from another operation.
   - An account reset while the request is pending suppresses state changes and
     toasts from the obsolete operation.

4. Invalidate pending work at the right boundaries.
   - Every async crate mutation captures an account context that
     `clearCrates()` invalidates, even if the same user logs in again before the
     old promise resolves.
   - `removeRecordFromAllCrates()` and `clearAllCrateRecords()` invalidate
     pending membership responses for the affected crate rows before applying
     their local cleanup, so an older response cannot reintroduce removed IDs.
   - Preserve correct delete rollback under concurrency: a failed optimistic
     delete must restore the newest safe row, not a stale snapshot; a successful
     delete must not be resurrected by late work.
   - Obsolete operations return failure/null according to the existing public
     contract and do not emit success or error toasts for the new account.

5. Give `isUpdatingCrate` one coordinated owner.
   - Use one reset-aware operation counter (or an equivalent derived state) for
     metadata and membership updates.
   - The flag stays true until all current-account update operations settle.
   - `clearCrates()` immediately resets it; `finally` blocks from obsolete work
     cannot make the counter negative or change the new account's flag.

## Tests to add

Extend `app/stores/__tests__/cratesStore.test.ts` with deterministic deferred
promises proving at least:

- an older membership response cannot overwrite a newer metadata response;
- an older membership response cannot overwrite a newer fetched row, and an
  older fetch cannot overwrite a newer membership row;
- record cleanup and delete-all cleanup cannot be undone by a delayed
  membership response;
- clearing and reloading the same account while an RPC is pending leaves the
  reloaded state untouched and emits no stale toast;
- metadata plus membership overlap keeps `isUpdatingCrate` true until both
  settle, in both response orders;
- reset during pending updates immediately clears the flag and obsolete
  `finally` work cannot affect a new update;
- failed metadata rollback preserves a concurrent records change;
- failed optimistic delete restores the newest safe row, while successful
  delete ignores a late membership response;
- malformed authoritative rows are rejected for each invalid field class,
  including non-string records, wrong user, missing name, and an impossible
  calendar timestamp;
- valid offset timestamps and adjacent microseconds still order correctly.

Tests must assert final state and toast behavior, not merely method calls. Keep
the existing reverse-response and same-millisecond database-order tests.

## Commands and expected results

Run in order:

```bash
npm run format
npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts
npm run check:conventions
npm run verify
git diff --check
```

All commands must exit 0. The focused suite must include the new cross-writer,
account-reset, activity-counter, rollback, and validation cases. Formatting
must not change files outside scope.

## Done criteria

- [ ] Every authoritative crate row passes one complete runtime validator and
      one monotonic version boundary.
- [ ] Request completion order cannot overwrite newer database state.
- [ ] Local record cleanup cannot be undone by an older membership response.
- [ ] Account reset invalidates state, notifications, and loading ownership for
      every pending crate mutation.
- [ ] Concurrent metadata/membership work owns one truthful activity flag.
- [ ] Optimistic rollback cannot restore a stale full crate row.
- [ ] All focused and repository verification gates pass.
- [ ] Only the two in-scope files changed.

## STOP conditions

Stop and report if:

- the fix would require changing the Plan 013 SQL/RPC contract or weakening its
  database locking/timestamp ordering;
- a full fetch cannot distinguish authoritative row freshness without an
  additional server contract—characterize the exact race instead of silently
  choosing response order;
- correct delete rollback requires an out-of-scope API/schema change;
- generated `Crate` fields differ from the listed row shape;
- a verification command fails twice after a reasonable in-scope correction.

## Maintenance notes

Any future crate writer must pass complete server rows through the shared
decoder/reconciler or explicitly invalidate pending authoritative responses
before a local-only projection. Review new optimistic flows for rollback
ownership and account generation, not just their happy path.
