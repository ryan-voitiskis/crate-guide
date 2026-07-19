# Plan 039: Reconcile rejected crate edit state and return values

> **Executor instructions**: Execute in an isolated worktree after Plan 038.
> Treat the current reconciled row, returned mutation value, and edit form as
> one contract. Add the exact delayed-response/prop-transition tests below,
> run pinned verification, and commit conventionally. The reviewer owns the
> tracker.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: Plan 038
- **Category**: correctness / concurrency / UI state
- **Planned at**: commit `22f9d24`, 2026-07-19
- **Completed by**: commit `9059469` (integrated as `5348f50`), 2026-07-19

## Why this matters

Independent review of Plan 038 found two contradictions. When a delayed v2
metadata save is rejected after a fetch establishes v3, the details dialog
stays in edit mode but its initialized form keeps the rejected local values. A
second Save can then write those stale values as v4 and overwrite the remote
change. Separately, when cleanup changes crate membership during a successful
metadata save, the store preserves current membership in state but returns the
unreconciled server response with stale records.

A rejected edit must remain open while visibly resetting to the current
authoritative values. A successful mutation returning `Crate` must return the
accepted reconciled crate, never a different object than the state it committed.

## Scope

Modify only:

- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/components/crates/DialogCrateDetails.vue`
- `test/nuxt/DialogCrateDetails.nuxt.test.ts`

Do not change database/RPC contracts, pagination, ordering, toast copy, or the
null result used for a response rejected by authoritative version acceptance.

## Required implementation

1. Return the reconciled accepted metadata row.
   - Change the revision-changed owned-field commit boundary to return the
     accepted authoritative crate (or null), not only a boolean.
   - Preserve the current membership selected by cleanup/reconciliation and
     return that same membership to the caller.
   - If no owned field commits, lifecycle/version acceptance fails, the account
     changes, or the row disappears, return null exactly as today.
   - Do not expose a newer unrelated optimistic overlay as if it were committed
     server state; return the accepted authoritative snapshot for this response.

2. Resynchronize a rejected edit without closing it.
   - Reuse one form-initialization helper for entering edit mode and rejection
     recovery.
   - When `updateCrate` returns null, wait for the reactive authoritative prop
     update, then reset name, description, color, validation baseline, and dirty
     state from the current prop.
   - Keep edit mode open so the user can intentionally edit the new values.
   - Do not continuously mirror prop changes while the user is typing; the
     resync is specific to the just-rejected submission.

## Tests

Add deterministic coverage for:

- cleanup removes membership while a metadata response succeeds: both stored
  state and the returned crate contain the preserved current membership;
- delayed v2 -> fetched v3 -> v2 rejected: `updateCrate` returns null and store
  remains v3;
- the real details dialog submits a local value, receives an authoritative v3
  prop transition before the deferred store result resolves null, stays in edit
  mode, and shows v3 name/description/color rather than the rejected local
  fields;
- a deliberate subsequent edit begins from that v3 baseline and submits only
  the new user change.

## Verification

```bash
npm run format
npx vitest run --project stores app/stores/__tests__/cratesStore.test.ts
npx vitest run --project nuxt test/nuxt/DialogCrateDetails.nuxt.test.ts
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify'
git diff --check
```

## Done criteria

- [ ] Accepted metadata returns the authoritative row actually committed.
- [ ] Rejected metadata returns null and cannot leave stale values in the form.
- [ ] Edit mode remains open on the current authoritative baseline.
- [ ] Focused interleavings, real component behavior, and full verification pass.

## STOP conditions

Stop if the fix requires changing the RPC/schema, if form recovery must mirror
props continuously and erase active typing, if the returned row can still
disagree with reconciled membership, or if a required gate fails twice.

## Maintenance notes

Nullable mutation results are control flow, not merely error signaling. Keep
the returned object, rendered store row, and form baseline coherent whenever a
new writer or consumer is added.
