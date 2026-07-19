# Plan 030: Drain record-cover cleanup backlogs across bounded pages

> **Executor instructions**: Execute in an isolated worktree from the stated
> integration commit. Follow every acceptance test. Touch only the files in
> scope, commit with a Conventional Commit, and leave `plans/README.md` to the
> reviewer. Stop rather than turning an unbounded loop into a false fix.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 014 and 029
- **Category**: correctness / durability
- **Planned at**: commit `98f0bda`, 2026-07-19
- **Completed by**: commit `b0bd35f` (integrated as `2ae4f88`), 2026-07-19

## Why this matters

The Edge handler intentionally processes at most 100 jobs per request, but the
client discards its response counts and invokes it only once. Deleting 101
covered records therefore removes 100 objects, returns HTTP 200, clears local
state, and deterministically leaves one job/object behind. Initial account load
also records that cleanup started even when its only request fails, so no retry
occurs during that loaded session.

Keep the server's bounded request contract, but make the client single-flight a
bounded drain-to-empty operation with controlled transient retry and truthful
account lifecycle ownership.

## Current source contract

- `cleanup-record-covers` returns `{ processed, removed, deferred }`; a full
  successful page has `processed === 100`, and any deferred work returns a
  controlled non-2xx Functions error.
- `recordsStore.performCoverCleanup()` currently checks only `error` and loses
  `data`.
- `useUserData` sets `cleanupStartedUserId` before launching the detached drain
  and never clears it on failure.
- `deleteAllUserData` correctly waits for best-effort cleanup before clearing
  local stores; preserve that ordering.

## Scope

Modify only:

- `app/stores/recordsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/composables/useUserData.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/composables/__tests__/useLibraryMutations.test.ts` only if its existing
  ordering assertions require a truthful multi-page result fixture

Do not change the Edge per-request limit, accept client paths, add a scheduler,
or alter database schema. Plan 032 owns deleted-account service work.

## Required implementation

1. Add a strict response decoder for cleanup counts.
   - Require non-negative safe integers for `processed`, `removed`, and
     `deferred`.
   - Reject impossible values such as `processed > 100`,
     `removed > processed`, or a success response with deferred work.
   - Never expose raw response/error details in logs or toasts.

2. Turn the existing per-account single-flight into a bounded page loop.
   - Invoke with no request body.
   - After a successful full page (`processed === 100`), request the next page;
     stop successfully only after a short page proves the queue was reached.
   - Set an explicit generous maximum page count to prevent a malicious or
     continuously-producing account from holding an infinite browser promise.
     Hitting the cap returns false and retains durable jobs for the next drain;
     it must not claim completion.
   - Check `accountGeneration` before and after every await. Reset/sign-out
     cancels state, retry timers, warnings, and further page requests.

3. Retry transient invocation failures with bounded backoff.
   - Use a small, explicit retry schedule per page (for example immediate,
     250 ms, then 1 s); do not retry forever.
   - The backoff must be testable with fake timers and must abort immediately
     when account generation changes.
   - Emit the existing generic warning at most once after the whole drain
     fails; successful recovery emits no warning.

4. Reconcile initial-load ownership.
   - Keep initial cleanup detached from page readiness.
   - Record one in-flight drain per account, but clear the
     `cleanupStartedUserId` sentinel if the bounded drain ultimately returns
     false for the still-current account so a later refresh can retry.
   - Demo, signed-out, stale-account, and reset flows remain no-ops without
     stale toasts.

## Tests

Add deterministic tests proving:

- responses `100` then `1` drain 101 jobs with two invocations and no body;
- exactly 100 jobs cause the confirming empty-page invocation;
- a short first page stops after one invocation;
- malformed/impossible counts fail safely;
- one transient failure recovers after fake-timer backoff without warning;
- exhausting retries returns false and warns once;
- the page cap returns false rather than looping or claiming empty;
- account reset during backoff/page transition prevents another invocation and
  stale warning;
- concurrent callers share the complete multi-page promise;
- initial load remains non-blocking, retains one in-flight call, and releases
  its sentinel after final failure so a later refresh can retry;
- bulk deletion still waits for the complete bounded drain before state clear.

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

All commands exit 0; only scoped files change.

## Done criteria

- [ ] A 101-job queue is drained to empty in one single-flight operation.
- [ ] Each Edge invocation remains capped at 100 and receives no path/body.
- [ ] Retry and total-page loops are explicit, finite, and reset-aware.
- [ ] Completion is inferred only from a validated short page.
- [ ] Initial-load failure can be retried without blocking readiness.
- [ ] Tests and full verification pass.

## STOP conditions

Stop if the Edge response cannot distinguish a successful full page from
failure, if Supabase invocation does not expose response data on success, if
correct cancellation requires changing the global auth contract, or if a gate
fails twice after a reasonable scoped correction.

## Maintenance notes

Keep the browser's total-work bound distinct from the Edge per-request security
bound. If the handler response changes, update the strict decoder and the 101
job composition test together.
