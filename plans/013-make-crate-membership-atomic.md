# Plan 013: Make crate membership mutations atomic in Postgres

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/migrations supabase/tests app/stores/cratesStore.ts app/stores/__tests__/cratesStore.test.ts shared/types/database.ts supabase/functions/_shared/types/database.ts app/components/crates/DialogCrateDetails.vue`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-add-database-test-gate.md`, `plans/002-enforce-database-type-parity.md`
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `2f0448c` (integrated as `815c202`), 2026-07-19

## Why this matters

Crate membership is stored as a UUID array, and the client currently reads that
array, creates a replacement array, then writes the whole row. Two tabs or rapid
add/remove operations can both start from the same old array and silently lose
one mutation when responses resolve. Ownership-checked row-locked RPCs can make
add/remove idempotent and atomic while returning the authoritative crate row.

## Current state

- `cratesStore.ts:99-140` exposes generic optimistic `updateCrate` for all
  mutable fields and sends the caller-built update object directly to PostgREST.
- `cratesStore.ts:175-219` implements membership as:

  ```ts
  const updatedRecords = [...crate.records, recordId]
  const result = await updateCrate(crateId, { records: updatedRecords })
  // ...
  const updatedRecords = crate.records.filter((id) => id !== recordId)
  ```

- Existing tests at `cratesStore.test.ts:405-486` cover missing/duplicate and
  success cases but not concurrent server state.
- `CONTRIBUTING.md:46-47` requires new forward-only migrations.
- Existing SQL functions use `SECURITY DEFINER`, pinned search paths, explicit
  grants, and `auth.uid()` ownership. Match those conventions.
- `DialogCrateDetails.vue:117` uses `updateCrate` only for crate metadata; no
  non-store caller passes `records`.

## Commands you will need

| Purpose        | Command                                                                    | Expected on success   |
| -------------- | -------------------------------------------------------------------------- | --------------------- |
| Database tests | `npm run test:db`                                                          | all pgTAP suites pass |
| Generate types | `npm run genTypes`                                                         | both copies generated |
| Store tests    | `npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts` | all pass              |
| Type parity    | `npm run check:database-types`                                             | exit 0                |
| Full gate      | `npm run verify:full`                                                      | exit 0                |

## Scope

**In scope** (the only files you should modify):

- `supabase/migrations/20260719121000_add_atomic_crate_membership.sql` (create)
- `supabase/tests/crate_membership.sql` (create)
- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)
- `plans/README.md` status row

**Read only; expected unchanged**:

- `app/components/crates/DialogCrateDetails.vue`

**Out of scope**:

- Normalizing crate membership into a join table
- Reordering crate records or changing the public `Crate.records` type
- Changing crate metadata create/update/delete flows
- Cross-tab realtime synchronization
- Local-only cleanup helpers after record deletion

## Git workflow

- Branch: `codex/013-atomic-crate-membership`
- Use focused Conventional Commits, for example
  `feat(database): add atomic crate membership RPCs` and
  `fix(crates): use atomic membership mutations`.
- Do not deploy, push, or open a PR unless instructed.

## Steps

### Step 1: Add row-locked, ownership-checked RPCs

Create two functions in a forward migration:

```sql
public.add_record_to_crate(target_crate_id UUID, target_record_id UUID)
public.remove_record_from_crate(target_crate_id UUID, target_record_id UUID)
```

Both return the resulting `public.crates` row, use `SECURITY DEFINER`, and pin
`search_path = pg_catalog, public`. Both must require `auth.uid()` and lock the
owned crate row `FOR UPDATE`. Add must also prove the record exists and belongs
to the same authenticated user. Add uses `array_append` only when the ID is not
already present; remove uses `array_remove` and is idempotent even if the record
row no longer exists. Update `updated_at` and return the locked/updated row.

Execution review found that the existing shared update trigger assigns
transaction-start `NOW()` and would overwrite an RPC timestamp, so response
order could not safely represent database order. In this migration, replace
only the crates update trigger with a crate-specific, pinned-search-path trigger
that sets `updated_at` to the greater of `clock_timestamp()` and
`OLD.updated_at + 1 microsecond`. Revoke direct execution of the trigger
function. Leave the records, tracks, and sets triggers unchanged. This gives
every serialized crate update a strictly increasing server version without
adding a new public column.

Revoke execute from PUBLIC/anon and grant only `authenticated`. Do not accept a
user ID. Raise controlled database exceptions for missing/unowned crate or
record.

**Verify**: migration applies cleanly through the local stack.

### Step 2: Add pgTAP ownership, idempotency, and lost-update tests

Create `supabase/tests/crate_membership.sql` in a rollback transaction. Cover:

1. signatures and grants;
2. anonymous rejection;
3. owner add returns a row with the ID once;
4. repeat add does not duplicate;
5. owner remove returns a row without the ID;
6. repeat remove is harmless;
7. cross-user crate add/remove is rejected;
8. adding another user's/missing record is rejected;
9. sequential operations from stale client assumptions accumulate correctly
   because each function reads the locked server row.
10. successive crate updates in one transaction receive strictly increasing
    timestamps from the crate-specific trigger.

If the SQL harness supports two connections, add a true concurrent add test; if
not, retain the explicit `FOR UPDATE` implementation review gate and sequential
stale-input characterization.

**Verify**: `npm run test:db` -> new and existing suites pass.

### Step 3: Narrow generic metadata updates

In `cratesStore.ts`, introduce a metadata update type that omits
`id`, `user_id`, timestamps, and `records`. Make `updateCrate` accept only that
type. Existing `DialogCrateDetails` metadata calls must typecheck unchanged.

**Verify**: `npm run typecheck` -> exit 0; `rg -n "updateCrate\([^\n]*records" app`
-> no matches.

### Step 4: Switch membership actions to RPCs

Replace client-built array writes in `addRecordToCrate` and
`removeRecordFromCrate` with `supabase.rpc`. Decode/cast the returned crate row,
then replace the matching local crate with that authoritative row. Preserve
demo-mode no-op behavior, missing crate feedback, `silent` semantics, and
success/failure toasts.

Concurrent responses must reconcile by the full microsecond-precision
`updated_at` returned by PostgREST, not by client request order or JavaScript's
millisecond-only `Date.parse()` result. Reject malformed authoritative rows,
ignore an older/equal server version, clear version state on account reset, and
keep `isUpdatingCrate` true until every concurrent membership RPC settles.

Do not optimistically replace the membership array before the RPC returns; an
authoritative response avoids rollback races. Idempotent server results count as
success, while the existing local duplicate/missing fast paths may continue
returning `false` when state is current.

**Verify**: store tests assert exact RPC names/arguments, server-row assignment,
error behavior, and no `.from('crates').update({records:...})` call.

### Step 5: Generate types and run full gates

Run `genTypes` against the local migrated database; do not hand-edit output.

**Verify**: `npm run format && npm run genTypes && npm run check:database-types && npm run test:db && npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts && npm run verify:full`
-> exit 0.

## Test plan

- pgTAP proves privileges, tenant isolation, record ownership, idempotency, and
  server-side accumulation.
- Store tests prove RPC routing and authoritative local replacement.
- Add deferred RPC response tests in reverse completion order; final state must
  reflect the server rows returned, and a failure must not roll back a later
  success.
- Existing crate metadata and local cleanup tests remain green.

## Done criteria

- [ ] No membership action sends a whole client-built `records` array update.
- [ ] Both RPCs lock the owned crate and derive identity from `auth.uid()`.
- [ ] Add validates record ownership; remove remains safe after record deletion.
- [ ] Duplicate adds/removes are idempotent.
- [ ] Crate updates receive strictly monotonic server timestamps, even inside
      one transaction, so out-of-order responses reconcile by database order.
- [ ] Generic `updateCrate` cannot accept `records` at compile time.
- [ ] Generated types are byte-identical and database/store/full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- The live schema no longer stores crate membership as `UUID[]`.
- A non-membership caller legitimately updates the entire records array.
- Correct authorization requires a caller-supplied user ID.
- The functions cannot return a shape matching the generated `Crate` row.
- A generated diff includes unrelated schema changes.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any future membership operation (bulk add, reorder) needs its own atomic
  server command; do not reopen generic array updates.
- Reviewers should inspect row locking and grants, not only UI tests.
- A normalized join table may be appropriate later, but is deliberately outside
  this focused correctness fix.
