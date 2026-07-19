# Plan 012: Serialize and coalesce session autosave writes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/stores/sessionStore.ts app/stores/__tests__/sessionStore.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `0010d9b` (integrated as `adcb241`), 2026-07-19

## Why this matters

The two-second debounce prevents a burst before a request starts, but it does
not serialize requests already in flight. A slow initial insert can overlap a
later insert, creating two active sets, while overlapping updates can resolve
out of order and persist an older snapshot last. One per-account write queue
must allow only one set write at a time and coalesce pending autosaves to the
newest immutable snapshot.

## Current state

- `sessionStore.ts:321-354` inserts an active set from the current session and
  returns its ID.
- `sessionStore.ts:356-383` updates `played_tracks` directly.
- `sessionStore.ts:385-411` schedules an independent async callback after 2
  seconds. If no `activeSetId` exists at that callback, it calls
  `createActiveSet`; there is no in-flight/queue guard.
- `saveSession` at lines 451-521 can also insert/update the same set while an
  autosave is active.
- The store already captures `{accountGeneration,userId}` and tests late
  account responses (`sessionStore.test.ts:918-986`). Preserve those guards.
- Existing failure tests at `sessionStore.test.ts:1194-1286` require a failed
  autosave to surface an error and a later successful retry to clear it.

## Commands you will need

| Purpose       | Command                                                                     | Expected on success |
| ------------- | --------------------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts` | all pass            |
| Typecheck     | `npm run typecheck`                                                         | exit 0              |
| Full gate     | `npm run verify`                                                            | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `plans/README.md` status row

**Out of scope**:

- Database schema/RPC changes or realtime synchronization
- Changing the two-second debounce duration
- Offline persistence, retry backoff, or background sync
- UI redesign, set naming semantics, or session suggestion logic
- Fader animation; Plan 017 owns it

## Git workflow

- Branch: `codex/012-session-autosave-queue`
- Use one Conventional Commit, for example
  `fix(session): serialize autosave writes`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Characterize the two races before refactoring

Add failing tests with deferred Supabase responses:

1. first debounced insert remains pending longer than two seconds; a later
   session change fires another debounce; only one insert may ever start;
2. first update remains pending while two newer snapshots arrive; after it
   resolves, exactly one follow-up update writes only the newest snapshot;
3. a manual named save while autosave is pending executes after it and preserves
   both the latest tracks and requested name.

**Verify**: run only the three new tests and confirm they fail for overlapping
writes or stale snapshots before production changes.

### Step 2: Introduce immutable queued write requests

Define private request types containing:

- captured account context;
- cloned `PlayedTrackEntry[]` snapshot;
- kind `auto` or `manual`;
- manual name/result resolver where applicable.

Maintain at most one in-flight write and one pending autosave. Enqueue behavior:

- a new autosave replaces the pending autosave snapshot (never the in-flight
  request);
- a manual save is never coalesced away and is ordered after any in-flight
  request;
- all writes for one account execute sequentially;
- persistence chooses insert vs update at execution time, after earlier writes
  may have populated `activeSetId`.

Do not store reactive array references in requests; clone entries when enqueued.

**Verify**: `npm run typecheck` -> exit 0.

### Step 3: Funnel autosave create/update through one drain loop

Refactor `scheduleAutoSave` so its timer only captures/enqueues the newest
snapshot. A single async drain performs `createActiveSet` or `updateActiveSet`.
It must set `activeSetId` only when the insert belongs to the current account and
must continue to the latest pending snapshot after success or failure.

State semantics:

- `isAutoSaving` is true only while an auto write is actually in flight;
- failure sets the existing safe `autoSaveError` and toast once for that write;
- a later success clears the error;
- no later snapshot can be persisted before an earlier write settles.

**Verify**: the two autosave race tests now pass and query invocation order is
insert -> latest update.

### Step 4: Serialize manual saves without changing their public contract

Keep `saveSession(name)` returning `Promise<SavedSet | null>`, but implement it
by enqueueing a non-coalescible manual request. When it executes, use the current
server set ID produced by prior autosave work, its captured track snapshot, and
its name. Preserve `isSavingSession`, saved-set list update, dialog close,
success/error toasts, and account guards.

Do not let a queued autosave after the manual save erase its name; auto updates
must continue updating only `played_tracks`.

**Verify**: all existing `saveSession` tests plus the manual-vs-auto ordering test
pass.

### Step 5: Invalidate queued work on clear/reset

`clearSession()` and `resetAccountState()` must clear the debounce and pending
queue, increment/invalidate an operation generation, and reset visible flags.
An in-flight request may finish at Supabase, but its result must not mutate the
cleared/current account, and its completion must not start dropped pending work.

Add tests for reset during an in-flight insert and clear during a queued update.

**Verify**: focused session tests pass with no late state/toast commits.

### Step 6: Run the complete gate

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts && npm run verify`
-> exit 0.

## Test plan

- Use fake timers for debounce boundaries and deferred promises for network
  ordering; always restore real timers.
- Assert maximum concurrent set writes is one.
- Assert multiple pending autosaves coalesce to the latest snapshot.
- Assert one slow create never produces a second insert.
- Assert manual saves remain ordered and return their exact server row.
- Preserve existing account-reset, failure/retry, decoder, and saved-set tests.

## Done criteria

- [ ] At most one insert/update of the active set is in flight per account.
- [ ] Pending autosaves coalesce to the newest immutable session snapshot.
- [ ] The insert/update decision occurs when the queued request executes.
- [ ] Manual save is serialized and retains its name/public return contract.
- [ ] Reset/clear drops pending work and ignores in-flight completion.
- [ ] Failure/retry UI behavior remains safe and tested.
- [ ] Focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Database writes are triggered outside `sessionStore.ts` and can still race the
  queue.
- Preserving manual-save semantics requires a schema/RPC change.
- Existing account-generation behavior conflicts with queue invalidation.
- A queue implementation would retain promises or resolvers after reset.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Every future active-set write must use the same queue.
- Review state flags separately from queue ownership; a stale completion must not
  clear a current flag.
- Coalescing is valid for autosave snapshots only, never named/manual commands.
