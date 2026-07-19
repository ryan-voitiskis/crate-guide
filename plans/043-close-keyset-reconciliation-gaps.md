# Plan 043: Close keyset reconciliation account and concurrency gaps

> **Executor instructions**: Execute after Plan 034 in an isolated worktree
> based exactly on integration commit `f4cb89c`. Treat account replacement as a
> hard boundary for every track writer and saved-set loader, preserve only
> provenance-confirmed same-account writes during authoritative reconciliation,
> add the missing mutable-page crate regression, run the full gate, and commit
> conventionally. The reviewer owns the tracker.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 011, 012, 033, 034, and 041
- **Category**: correctness / concurrency / account isolation
- **Planned at**: commit `f4cb89c`, 2026-07-19
- **Completed by**: commit `b6c5168` (integrated unchanged as `b6c5168`), 2026-07-19

## Why this matters

Independent review of Plan 034 reproduced three gaps around its otherwise sound
immutable-key traversal. First, every asynchronous track writer is still
account-unbound. A delayed account-A create can insert its decoded ownerless row
while account B is loading; Plan 034's new local-create merge then classifies it
as a B-local row and preserves it. Updates retain an A-array index that can
overwrite B state after reset, batch updates can continue after invalidation,
and failed deletes can roll an A row into B. Stale completions can also alter B
activity flags, progress callbacks, and toasts.

Second, both the home page and set manager start `fetchSavedSets`. The two
uncoalesced authoritative loads take independent snapshots. If the first load
publishes a row and a later empty response reflects its deletion, the second
load mistakes the first load's row for a local save and preserves stale state.

Finally, Plan 034 required the original 1,001-crate deletion-between-pages
reproduction at the store boundary. The shared helper proves the cursor
mechanic, but the crate test uses static pages and never combines that mutation
with authoritative reconciliation. The implementation appears sound; the
regression must make that boundary durable.

## Scope

Modify:

- `app/stores/tracksStore.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/composables/useTrackEnrichmentWorkflow.ts`
- `app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts`
- `shared/types/trackUpdates.ts` only if the existing batch return type cannot
  carry an explicit cancellation outcome without ambiguity
- `test/e2e/login-redirect.e2e.test.ts`
- one small shared account-context helper only if duplicating the established
  records/crates ownership contract would otherwise be materially riskier

Do not change the keyset helper, database cursor invariants/indexes, timestamp
ordering, domain row shapes, session write serialization, crate reconciliation
algorithm, UI callers outside the listed enrichment workflow, or server schema.
A test may expose a crate implementation defect; stop and report it before
broadening source scope beyond this list.

## Required implementation

1. Bind every asynchronous track mutation to its originating account.
   - Capture an immutable `{ generation, userId }` before local or server work
     for create, update, batch update, and delete. Reset invalidates the
     generation and account identity before clearing state.
   - Ensure each server write is owned by that user. Include/retain the explicit
     owner on inserts, constrain updates/deletes by owner, and prevent a client
     whose auth changed before dispatch from mutating a replacement account.
     Follow Plan 041's fixed-client approach if owner constraints plus a fresh
     identity confirmation cannot make the transport boundary unambiguous.
   - Validate every returned `user_id` against the captured account before
     decoding strips it. A missing or mismatched owner fails closed.
   - Check context before success, rollback, toast, activity, batch progress,
     or returned-state effects. Stale operations return an explicit neutral or
     cancelled result and cannot clear a replacement account's flags. Batch
     work stops before dispatching its next item after invalidation.
   - Reconcile by row ID and operation ownership, never a numeric index retained
     across an await. Define deterministic same-row ordering by serializing
     update/delete work per ID or by an equivalently strict lifecycle boundary.
     An older update success/failure cannot overwrite a newer update, and an
     update/delete overlap cannot resurrect an uncommitted optimistic value.
     Concurrent create/update/batch activity keeps its flag true until the last
     current-account owner settles.
   - A delete must validate an affected owned row or exact affected count. An
     owner-filtered zero-row response is not success and cannot emit success
     feedback or retire provenance.
   - Record local-create provenance with its account/generation. The Plan 034
     fetch merge may preserve only post-snapshot creates owned by its exact
     fetch context; fetched rows win and duplicates collapse. Clear or retire
     provenance when it is fetched, removed, or its account is invalidated.
   - Propagate batch cancellation through `useTrackEnrichmentWorkflow`. After a
     reset invalidates the batch, the caller must not update review rows or
     summary, emit an `Applied 0 of 0` toast, close replacement-account UI, or
     clear a replacement operation's flag. Use a discriminated cancellation
     result or an equally explicit contract; an empty result array is ambiguous.

2. Give saved-set loading one authoritative same-account chain.
   - Coalesce concurrent `fetchSavedSets` callers behind one identity-owned
     promise, matching the other library stores. Preserve promise identity in
     `finally`; reset must invalidate the old chain without allowing it to clear
     a replacement chain or loading flag.
   - Validate every fetched or saved set's `user_id` against the captured
     account before decoding/reconciliation or advancing provenance.
   - Track successful local set-save provenance/revisions explicitly. During a
     fetch, a same-account save revision committed after the snapshot wins even
     when a stale response contains the same ID; preserving an absent insert is
     only one case. Collapse fetched duplicates by ID and do not infer
     provenance from every newly visible ID. Failed/stale saves never advance a
     revision.
   - Preserve successful local deletions that commit during a fetch so an older
     response cannot resurrect them. Failed or stale deletes must not create a
     tombstone, alter replacement state, or suppress a later authoritative row.
     Clear provenance/tombstones on reset and retire a delete tombstone only
     after a later authoritative fetch confirms that ID is absent.
   - Keep the existing serialized manual/autosave queue and exact
     `created_at DESC, id DESC` presentation order.
   - Update the login E2E observation to require one saved-set full page plus
     one confirming empty page, not two duplicate chains.

3. Restore the store-level mutable-page crate proof.
   - Start from 1,001 local and remote crates ordered by immutable ID. Back the
     PostgREST double with a mutable ID-descending collection. After returning
     page one, remove a first-page row before resolving the strict
     `id < cursor` page.
   - In that first traversal, assert the original tail crate is requested and
     retained and the exact unique 1,001-row snapshot remains present. The
     helper already accumulated the removed page-one row; do not pretend the
     later backing deletion can remove it from the same response.
   - Run a second authoritative traversal over the now-1,000-row backing
     collection. Require its full page plus confirming empty page, then assert
     the deleted row is reconciled away, the tail remains, and ordering and
     unique IDs are exact. Do not change the helper or crate reconciler to make
     the first traversal behave like a database snapshot it does not provide.

4. Add adversarial mutation and fetch tests.
   - For create, update success/failure, delete success/failure, and batch
     update, defer account-A work, reset/switch to B, populate or fetch B rows,
     then settle A. Assert B rows, flags, feedback, and progress remain intact.
   - Defer identity resolution itself, switch to B before dispatch, and prove no
     track query is sent under B for A work. Assert create carries `user_id = A`,
     updates/deletes constrain `user_id = A`, returned owners are validated,
     and zero affected deletes fail closed.
   - Cover same-account concurrent creates, update plus batch activity,
     update-then-update with the older success/failure settling last, and
     serialized update/delete in both orders with server success/failure. Flags
     stay active through the last owner and rollback restores only an
     authoritative baseline.
   - Prove a same-account track create on each side of an active cursor is still
     preserved/deduplicated, while a stale A create cannot enter B through the
     same merge.
   - Start both saved-set UI-equivalent loads together and prove they return the
     same chain. Reproduce the old first-row/then-authoritative-empty ordering
     and prove the stale row is absent. Cover a new save absent from the stale
     response, a fetched duplicate, an existing-ID local update versus a stale
     fetched value, and delete success/failure during a fetch plus account
     replacement. Owner-mismatched fetch/save rows fail closed without
     provenance changes.
   - Preserve all Plan 034 malformed-page, ownership, ordering, and exact
     microsecond cases.

## Verification

```bash
npm run format
npx vitest run --project stores \
  app/stores/__tests__/tracksStore.test.ts \
  app/stores/__tests__/sessionStore.test.ts \
  app/stores/__tests__/cratesStore.test.ts
npx vitest run app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts
npx vitest run test/e2e/login-redirect.e2e.test.ts
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify'
git diff --check
```

All commands exit 0. No account-unbound asynchronous track mutation, duplicate
saved-set login traversal, snapshot-only set provenance inference, or static-only
crate deletion pagination assertion remains.

## Done criteria

- [ ] No stale track writer can mutate replacement-account rows, flags, feedback, or progress.
- [ ] Same-row track operations have deterministic lifecycle ownership and zero-row deletes fail closed.
- [ ] Track fetches preserve only provenance-confirmed creates from their exact account context.
- [ ] Cancelled track batches cannot publish stale enrichment UI effects.
- [ ] Concurrent saved-set callers share one authoritative traversal.
- [ ] Saved-set reconciliation validates ownership and distinguishes local saves/deletes from another fetch's rows.
- [ ] The two-phase 1,001-crate deletion interleaving retains the immutable-cursor tail, then removes the deleted row authoritatively.
- [ ] Focused store, E2E, and full repository gates pass.

## STOP conditions

Stop if an account identity cannot be captured before any track server work, if
a global client can dispatch under a replacement token without an owner-safe
failure mode, if returned track ownership cannot be validated before decoding,
if same-account saved-set writes cannot be distinguished from fetch-published
rows, if a stale operation can own replacement-account activity state, if batch
cancellation cannot be represented without changing public consumers outside
the allowed enrichment workflow, if the two-phase crate reproduction exposes a
source defect outside the allowed files, or if a
required gate fails twice after one scoped correction.

## Maintenance notes

An ID absent from a starting array is evidence of timing, not provenance.
Reconciliation may preserve concurrent local work only when the store can name
the operation and account that produced it. Account generations own writers,
shared promises own authoritative loads, and immutable IDs own pagination.
