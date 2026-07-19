# Plan 038: Close crate consumer and tombstone follow-ups

> **Executor instructions**: Execute in an isolated worktree from the current
> integration commit. Preserve Plan 033's response-order contracts while
> correcting the five independently reproduced gaps below. Use deterministic
> deferred promises and component-level outcome tests, then commit
> conventionally. The reviewer owns the tracker.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 033
- **Category**: correctness / concurrency / user feedback
- **Planned at**: commit `c2da28c`, 2026-07-19
- **Completed by**: commit `a699aac` (integrated as `52be780`), 2026-07-19

## Why this matters

Independent review of Plan 033 found five residual defects. Ordinary fetch
absence advances a retained revision just like an explicit deletion, so a
crate that legitimately returns in a later fetch can be tombstoned forever.
The add-to-crate dialog ignores reconciled mutation booleans and toasts requested
counts as successes. Two failed concurrent deletes can restore rows in response
order rather than declared order. Concurrent successful creates are prepended
in response order. Finally, a metadata response that loses version acceptance
is rejected locally but still returned as truthy, so the details dialog exits
edit mode despite not accepting the save.

Store state, return values, visible order, dialog state, and user feedback must
all describe the authoritative result rather than the request or completion
order.

## Scope

Modify:

- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/components/shared/DialogAddToCrate.vue`
- Nuxt component tests for add-to-crate and crate-details outcomes under
  `test/nuxt/`

Modify `app/components/crates/DialogCrateDetails.vue` only if the corrected
store return contract cannot make its existing `if (result)` branch truthful.

Do not change RPCs/schema, pagination mechanics (Plan 034), toast wording beyond
making counts/outcomes accurate, or unrelated dialog behavior.

## Required implementation

1. Distinguish explicit deletion from ordinary fetch omission.
   - A successful or pending explicit delete/cleanup may retain a tombstone that
     rejects responses which began before that lifecycle boundary.
   - Absence from one completed fetch is authoritative for that fetch result but
     must not permanently make a later authoritative fetch of the same ID start
     below an unreachable retained revision.
   - A crate returned by a later fetch can re-enter when it was merely absent,
     while delayed operations from before the omission remain unable to mutate
     or resurrect newer state.
   - Keep explicit-delete success, pending-delete, rollback, account reset, and
     stale response protections from Plans 028/033 intact.

2. Make add-to-crate feedback count reconciled successes.
   - Await every selected add/remove as today, but collect only operations whose
     store return is `true`.
   - Summarize successful additions/removals, including mixed outcomes. Emit no
     summary success when both successful counts are zero.
   - Do not count a stale, failed, or rejected mutation because it was requested.
     Retain the store's own non-silent error behavior and the dialog's current
     close-after-attempt contract unless existing tests prove a different
     product contract.

3. Restore failed deletes in declared sort order.
   - Do not use a stale numeric splice index captured before concurrent optimistic
     removals.
   - Reinsert through the `created_at DESC, id DESC` comparator/ordered merge so
     either failure completion order produces the same list.
   - Preserve correctly ordered crates created while deletes are pending.

4. Insert successful creates in declared sort order.
   - Merge decoded creates through the same comparator instead of prepending in
     network response order.
   - Exact PostgreSQL timestamp comparison must preserve adjacent microseconds,
     equivalent offsets, null/invalid-last behavior, and descending ID ties as
     established by Plan 033.

5. Return only metadata updates accepted by reconciliation.
   - Respect the boolean/outcome of authoritative version acceptance. If a
     delayed response is older than a fetched/current row, return null (or the
     store's existing explicit rejection result), never the stale decoded row.
   - `DialogCrateDetails` must stay in edit mode when the save response was not
     accepted and leave the newer authoritative values visible.

## Tests

Add deterministic store tests for:

- fetch v1 -> authoritative empty fetch -> fetch v2 of the same ID: v2 restores
  the crate; a delayed response that began before omission still cannot alter it;
- pending and successful explicit delete still block an older fetch/result,
  while failed delete restores safely;
- concurrent failed deletes of A and B from `[A, B, C]` settle in both orders
  and always restore `[A, B, C]`; include a correctly positioned create while
  both deletes are pending;
- concurrent creates resolve in reverse requested/sort order yet render by
  `created_at DESC, id DESC`, including equal instants, adjacent microseconds,
  equivalent offsets, and null/invalid timestamp fallbacks;
- fetched v3 followed by delayed update v2 leaves v3 authoritative and makes
  `updateCrate` return the explicit rejected result.

Add Nuxt component tests proving:

- add-to-crate mixed add/remove results toast only the true counts;
- all-false results emit no success toast;
- a rejected crate-details metadata save remains in edit mode rather than
  presenting the edit as saved.

## Verification

```bash
npm run format
npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts
npx vitest run --project nuxt \
  test/nuxt/DialogAddToCrate.nuxt.test.ts \
  test/nuxt/DialogCrateDetails.nuxt.test.ts
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify'
git diff --check
```

All commands exit 0 and only scoped source/tests change.

## Done criteria

- [ ] Fetch omission cannot permanently tombstone a crate that later returns.
- [ ] Explicit delete lifecycle barriers still reject stale resurrection.
- [ ] Dialog success counts match reconciled `true` outcomes.
- [ ] Failed deletes and successful creates preserve deterministic order.
- [ ] Rejected metadata responses cannot close edit mode or return stale rows.
- [ ] Focused interleavings, component outcomes, and full verification pass.

## STOP conditions

Stop if omission safety requires weakening explicit-delete tombstones, if store
return values cannot distinguish accepted from rejected state, if ordering
needs the pagination redesign owned by Plan 034, if component tests require
replacing the real dialog behavior with a mock implementation, or if a required
gate fails twice after one scoped correction.

## Maintenance notes

A revision is an operation-lifecycle boundary, not proof that an absent row was
deleted forever. Keep durable tombstone intent explicit. Likewise, every
consumer of a boolean/nullable mutation contract must report the reconciled
outcome, never infer success from a completed request.
