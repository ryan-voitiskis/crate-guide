# Plan 035: Make client cover-cleanup ownership durable

> **Executor instructions**: Execute in an isolated worktree from the stated
> integration commit. Model cleanup as requested work, not a single reusable
> promise. Prove the exact post-commit and hung-request interleavings below,
> touch only scoped files, and commit conventionally. The reviewer owns the
> tracker.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 030
- **Category**: correctness / durability
- **Planned at**: commit `f399b43`, 2026-07-19
- **Completed by**: commit `8ff6261` (integrated as `2e2080d`), 2026-07-19

## Why this matters

Plan 030 bounded page count but left ownership gaps. A mutation that commits
while an older empty cleanup request is pending can join that old promise and
clear local data without any request starting after the new jobs exist. A
successful initial drain leaves a permanent composable sentinel even if later
mutation cleanup fails. Finally, an invocation without a timeout can pin every
mutation/bulk-delete waiter indefinitely, and reset cannot settle it.

Use a per-account request epoch plus an abortable bounded invocation so every
post-commit mutation waits for a request that began after its own signal, while
failed work remains eligible for refresh retry.

## Scope

Modify only:

- `app/stores/recordsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/composables/useUserData.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/composables/useLibraryMutations.ts`
- `app/composables/__tests__/useLibraryMutations.test.ts`

Do not change Edge limits/handlers, database schema, account-deletion semantics,
or disclose raw invocation/timeout details.

## Required implementation

1. Centralize cleanup ownership in `recordsStore`.
   - Track the current account generation, requested cleanup epoch, last epoch
     for which an invocation actually began, one active promise, and one active
     abort controller.
   - Background load may join already-requested work. Every successful
     cover-update/record-delete/bulk-delete commit must request a fresh epoch and
     await completion through an invocation that starts after that epoch.
   - If a fresh epoch arrives during a full or short page, extend the same
     single-flight loop through at least one newer invocation before resolving
     waiters. Do not resolve a post-commit waiter from a pre-commit empty page.
   - A failure, malformed response, cap, or timeout leaves work retryable; never
     advance a completion marker that claims the queue was reached.

2. Remove permanent retry ownership from `useUserData`.
   - Successful loads/refreshes request detached background cleanup through the
     store single-flight; the composable does not retain a forever-success
     sentinel.
   - Repeated refresh during one active drain must not duplicate the active
     request, but a refresh after a later failed mutation drain must retry.
   - Keep readiness non-blocking and account/reset checks intact.

3. Bound wall-clock execution and make reset abortive.
   - Pass an explicit documented per-invocation timeout supported by the pinned
     Supabase Functions client and an `AbortSignal`; do not implement a leaking
     `Promise.race` around an unabortable fetch.
   - On account reset/sign-out, abort the active request, advance generation,
     settle old waiters false without a stale warning, and initialize independent
     cleanup state for the replacement account.
   - Timeout follows bounded retry policy, warns at most once only for the still
     current account, and releases single-flight state for a later retry.

4. Preserve bulk-delete ordering.
   - Database deletion commits first; then the fresh cleanup epoch is requested
     and awaited best-effort; only then are local stores cleared.
   - Cleanup false/timeout cannot undo a committed database deletion, but it
     remains retryable on refresh.

## Tests

Add deterministic fake-timer/deferred tests proving:

- an initial empty request starts, deletion commits/enqueues, mutation requests
  cleanup, and resolving the old empty page causes a second invocation before
  mutation/bulk-delete completion and local clear;
- multiple mutations arriving during one request coalesce while still requiring
  a request started after the newest epoch;
- initial success -> later mutation failure/page cap -> refresh invokes again;
- concurrent refreshes during active work share it without duplicate pages;
- a never-settling invocation times out, retries finitely, settles false, warns
  once, and a later drain can start;
- reset aborts a hung invocation, settles old callers false without warning,
  and the replacement account starts immediately with a distinct signal;
- body remains absent and all Plan 030 count/page/malformed tests remain green.

## Verification

```bash
npm run format
npx vitest run --project stores \
  app/stores/__tests__/recordsStore.test.ts \
  app/composables/__tests__/useUserData.test.ts \
  app/composables/__tests__/useLibraryMutations.test.ts
npm run check:conventions
npm run verify
git diff --check
```

All commands exit 0 and only scoped files change.

## Done criteria

- [ ] Every post-commit cleanup waiter is covered by a post-signal invocation.
- [ ] Failed work is eligible for later same-account refresh retry.
- [ ] Hung invocations are timed out, reset-abortable, and cannot pin callers.
- [ ] Background refresh remains detached and single-flight.
- [ ] Bulk deletion preserves commit -> cleanup -> local-clear ordering.
- [ ] Focused interleavings and full verification pass.

## STOP conditions

Stop if the pinned Functions client cannot accept timeout/AbortSignal, if an
epoch can be marked complete without a newer invocation starting, if reset
cannot settle old callers, or if a required gate fails twice after one scoped
correction.

## Maintenance notes

Single-flight describes execution sharing; epochs describe which committed work
that execution covers. Keep both concepts explicit. A bounded request is only
durable if failure leaves a future trigger able to request the work again.
