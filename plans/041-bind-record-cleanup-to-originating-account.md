# Plan 041: Bind record cleanup continuations to the originating account

> **Executor instructions**: Execute in an isolated worktree after Plan 035.
> Treat account reset as an ownership boundary for mutation completion, cleanup
> epochs, rollbacks, activity flags, toasts, and bulk local clearing. Use
> deferred account-switch tests and commit conventionally. The reviewer owns
> the tracker.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 035
- **Category**: correctness / concurrency / account isolation
- **Planned at**: commit `22f9d24`, 2026-07-19
- **Completed by**: commit `7ca25b4` (integrated as `c1d3c7e`), 2026-07-19

## Why this matters

Plan 035 made cleanup requests generation-aware, but the record mutation that
requests fresh cleanup does not retain its originating account. If account A's
delete commits after reset/switch to B, its continuation increments B's cleanup
epoch and drains B while A's durable job waits. The same stale continuation can
emit B-visible toasts, clear B activity, roll an A row into B after failure, or
let bulk deletion clear replacement-account local state.

The same boundary applies one step earlier in cover upload: if A's object upload
settles after reset but before metadata mutation begins, returning stale without
an A-owned compensating delete leaves an unreferenced private object. Reusing
the global client for that delete is unsafe because it may already carry B's
session.

Bulk deletion also has a pre-request form of the race. Supabase RPC builders
resolve the global client's access token only when their request starts. After
the store verifies A but while that token lookup is pending, B can replace A;
`delete_all_user_data()` derives its target from `auth.uid()`, so the request can
delete B before the stale A continuation is suppressed.

Every writer must capture one account/generation context before its server work.
After reset, old continuations settle stale without touching the replacement
account; the originating account's durable queue remains eligible on its next
load.

## Scope

Modify:

- `app/stores/recordsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `app/composables/useLibraryMutations.ts`
- `app/composables/__tests__/useLibraryMutations.test.ts`

Modify a focused Nuxt dialog test only if required to prove the public bulk
result. Do not change database/RPC/Edge contracts, cleanup page decoding, retry
counts, or unrelated store writers.

## Required implementation

1. Capture and validate account-owned mutation work.
   - Reuse/extract the user store's authenticated-work pattern: resolved user ID
     plus identity generation, checked before and after every awaited server
     boundary.
   - In the records store, pair the resolved user ID with `accountGeneration`.
     Account reset/sign-out invalidates it even if a replacement user is already
     available.
   - Apply the boundary to record writers that can enqueue cover work or mutate
     local record state: create, manual create-with-tracks, metadata/cover
     update, delete, remove-from-collection, and bulk-delete coordination.
   - A stale response returns null/false, emits no success/error toast for the
     replacement account, performs no optimistic rollback/array commit/fetch,
     and cannot clear or decrement replacement activity.
   - Collection-removal coordination must carry that same context through its
     records await and revalidate before removing dependent tracks or crate
     membership, so an A continuation cannot mutate B rows with the same ID.

2. Make fresh cleanup explicitly context-owned.
   - Extend the internal drain contract with an originating account context.
     Validate it before incrementing `requestedCoverCleanupEpoch`, before
     joining/starting a promise, after user resolution, and after each page.
   - A stale post-commit request settles false without changing any replacement
     epoch, controller, promise slot, warning, or invocation.
   - Invoke cleanup pages with an A-bound private Functions client. The global
     client's deferred token lookup must not turn a still-pending A drain into a
     B cleanup request before the account-reset watcher aborts it.
   - Default initial-load cleanup still captures the current context at its own
     start. Do not weaken the 20-second timeout, retry, page, or reset-abort
     behavior.

3. Make activity and rollback state account-aware.
   - Reset all record mutation activity on `clearRecords`.
   - Use counter/token ownership where concurrent same-account writers exist so
     one completion cannot clear another.
   - Stale finalizers from A cannot relight or clear B's flags. Failed A work
     cannot restore A rows into B; successful A work cannot prepend/replace B
     rows.
   - Preserve existing optimistic behavior and declared ordering for current
     same-account operations.

4. Compensate stale, uncommitted uploads with the originating credentials.
   - Before upload, capture a mutation-private Storage client bound to A's exact
     access token; do not expose that token/client in exported context or store
     state.
   - Use the bound client for both the upload and an idempotent exact-path
     removal if reset occurs after upload settles but before metadata mutation
     begins, including a transport rejection whose server-side upload outcome
     is ambiguous. Never use B's global session for A compensation.
   - Once metadata has been submitted, reconcile a stale response with an exact
     A-bound read of that record: preserve a referenced `newPath`, delete it only
     when the authoritative row definitively does not reference it, and fail
     closed without deletion if the read is unavailable or ambiguous.

5. Guard bulk deletion end to end.
   - `user.deleteAllUserData` must capture authenticated work and reject a stale
     response before success/error toasts.
   - Snapshot and verify A's session token, then invoke the destructive RPC with
     an A-bound private client/header. Never let the global client's deferred
     token lookup choose the deletion target after the ownership check.
   - The coordinator carries the same originating identity through database
     success, fresh cleanup, and local store clearing.
   - If B replaces A before completion, do not drain B or clear B records,
     tracks, crates, or session state; settle the stale coordinator false.

## Tests

Use deferred promises for both success and failure across A -> clear/reset -> B:

- each cleanup-triggering record mutation causes zero B cleanup invocations and
  leaves B epochs/controller/promise untouched;
- a cleanup request whose global token lookup switches to B still sends no B
  invocation because the page client remains fixed to A;
- stale delete/update failure does not restore A into B; stale create/update
  success does not insert/replace B rows or toast;
- a current A mutation still requests a fresh post-commit drain and returns its
  existing success result;
- concurrent current-account operations retain activity until the final one,
  while reset clears flags and old finalizers cannot affect B;
- manual record+tracks creation does not start B fetches after an A RPC resolves;
- an A upload that settles after reset is removed with A's private client, never
  B's global Storage client, before any metadata request begins;
- an A upload that rejects after reset receives the same idempotent bound-client
  compensation without emitting B-visible feedback;
- stale metadata success preserves the now-referenced object, while a definite
  stale metadata rejection removes the unreferenced path after an A-bound read;
- collection removal switching accounts at the coordinator await leaves B's
  same-ID tracks and crate membership untouched;
- bulk A deletion resolving after B arrives neither toasts nor drains/clears B
  and returns false; the normal same-account bulk path remains unchanged;
- a global auth-token lookup switched from A to B cannot send the destructive
  RPC as B; only the fixed A-bound client may invoke it;
- initial-load cleanup, retry, timeout, and abort tests remain green.

## Verification

```bash
npm run format
npx vitest run --project stores \
  app/stores/__tests__/recordsStore.test.ts \
  app/stores/__tests__/userStore.test.ts \
  app/composables/__tests__/useLibraryMutations.test.ts
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify'
git diff --check
```

## Done criteria

- [ ] No record mutation continuation can target a replacement account.
- [ ] Cleanup epochs/promises/controllers are owned by their originating account.
- [ ] Stale success/failure/finally paths cannot mutate B state or feedback.
- [ ] Bulk deletion preserves replacement-account local data.
- [ ] Focused account-switch interleavings and full verification pass.

## STOP conditions

Stop if identity cannot be captured before server work, if an old continuation
can increment/join B cleanup, if rollback or finalizers can mutate B, if bulk
success cannot be distinguished from current-account success, or if a required
gate fails twice.

## Maintenance notes

Generation checks belong on writers as well as fetches. Carry the same account
context through mutation, cleanup, local reconciliation, activity, and feedback
instead of re-resolving whichever account happens to be current later.
