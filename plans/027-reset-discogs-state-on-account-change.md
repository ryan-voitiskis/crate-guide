# Plan 027: Make Discogs import state safe to reset between accounts

> **Executor instructions**: Implement only the store-level reset and stale-work
> guards in this plan. A later plan wires the action to authentication. Run all
> gates and stop on scope expansion.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat d78d42a..HEAD -- \
>   app/stores/discogsStore.ts \
>   app/stores/__tests__/discogsStore.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d78d42a`, 2026-07-13

## Why this matters

Discogs folders, selected releases, progress/results, and dialogs live in a
global Pinia store with no reset action. They can remain visible after logout or
to another account, and an in-flight folder/import request can repopulate state
after a reset. The store needs one account boundary and stale-settlement guards.

## Current state

- `app/stores/discogsStore.ts:6-27` declares all folder/import/account UI state.
- `app/stores/discogsStore.ts:29-68` awaits folder APIs and commits without
  confirming the same account still owns the work.
- `app/stores/discogsStore.ts:98-168` keeps selected releases, import progress,
  results, and `user.profile.id` across multiple awaited phases.
- `app/stores/discogsStore.ts:171-173` auto-fetches folders when a persistent
  dialog opens and the cached list is empty.
- `app/stores/discogsStore.ts:175-195` exports no clear/reset action.
- `app/stores/__tests__/discogsStore.test.ts:114-151` verifies initial state and
  provides the pattern for a complete reset assertion.

## Commands you will need

| Purpose           | Command                                                                                                                                       | Expected on success |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Focused tests     | `npx vitest run --project stores app/stores/__tests__/discogsStore.test.ts && npx vitest run --project unit app/utils/discogs-import.test.ts` | exit 0              |
| Format            | `npm run format`                                                                                                                              | exit 0              |
| Conventions       | `npm run check:conventions`                                                                                                                   | exit 0              |
| Full verification | `npm run verify`                                                                                                                              | exit 0              |

## Scope

**In scope**:

- `app/stores/discogsStore.ts`
- `app/stores/__tests__/discogsStore.test.ts`
- `app/utils/discogs-import.ts`
- `app/utils/discogs-import.test.ts`

**Out of scope**:

- Discogs OAuth credential/token handling, Edge Functions, RPCs, API request
  shapes, or database schema.
- Auth middleware, `useUserData`, pages, and global dialogs.
- Changing import business rules beyond cooperative cancellation between record
  writes.

## Git workflow

- Branch/isolated worktree label: `codex/027-discogs-account-reset`.
- Commit once with `fix(discogs): reset import state across accounts`.
- Do not push, merge, or open a PR.

## Target contract

Export `resetAccountState()` that invalidates a private generation, requests
cooperative import cancellation, clears folders/selections/releases/results,
closes all Discogs dialogs, and returns loading/progress/error flags to initial
values. Async methods capture the initiating identity and generation. Late
settlements may not render old-account data or clear loading state owned by
newer work.

## Steps

### Step 1: Add a complete synchronous reset

Reset every field declared at the top of `discogsStore`, including transient
release/progress/result state and all dialog flags. Preserve no account-owned
folder/import cache across the call.

**Verify**: a focused test dirties every public field, calls reset, and compares
against the store's documented initial state.

### Step 2: Guard folder work

Capture `user.supaUser?.id` (falling back to the already-owned profile ID only
during initial hydration) and generation at the start of `getFolders` and
`fetchFolderReleases`. Check both before every state commit and in `finally`.
Stale work exits silently.

**Verify**: deferred A work settling after reset/B work cannot replace B folders
or releases and cannot flip B's loading flag.

### Step 3: Guard the multi-phase import

Capture the initiating identity/generation before filtering. Recheck after each
await and before persistence/refresh/state commits. `resetAccountState()` must
set cooperative cancellation. Extend `importFetchedReleases` with an optional
`shouldCancel` callback, matching `fetchReleaseDetails`, and check it before
each record write so reset cannot continue issuing stale RPCs. A stale import
must not show success/failure results or toasts for the replacement account.

**Verify**: defer release fetching, reset/switch identity, then settle; assert
`importFetchedReleases` and record/track refresh do not run for stale work. Also
defer the first record write, reset while it is in flight, then settle it and
assert the second record write is never attempted.

### Step 4: Preserve active-account behavior

Run existing folder, disconnect, import success/partial/failure, and watcher
tests. Current-account state and toasts must remain unchanged.

**Verify**: focused suite exits 0.

### Step 5: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Complete reset test for every public state field.
- Deferred A/B folder and release tests, including loading ownership.
- Mid-import reset test proving no persistence, refresh, results, or stale toast.
- Import-utility cancellation test proving reset stops the next record write.
- Existing disconnect and import behavior remains covered.

## Done criteria

- [ ] One exported action clears all Discogs account/import state.
- [ ] Late folder/release work cannot repopulate old-account data.
- [ ] A reset import cannot persist or present results after identity changes.
- [ ] Current-account behavior is unchanged.
- [ ] Focused tests and `npm run verify` pass.
- [ ] Only the four in-scope files are changed.

## STOP conditions

Stop if identity is unavailable at every legitimate import entry, if safe stale
work handling requires changing an Edge Function/RPC, or if a field believed to
be account-owned is proven to be an intentional cross-account preference.

## Maintenance notes

All new Discogs async phases must use the same identity/generation check.
Backend RLS/RPC ownership remains the authorization boundary; this reset keeps
long-lived client state aligned with it.
