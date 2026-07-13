# Plan 025: Bind profile and settings work to one authenticated identity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed in Scope. If a STOP condition occurs, stop and report;
> do not improvise. A reviewer maintains `plans/README.md` during dispatched
> execution.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat d5bb723..HEAD -- \
>   app/stores/userStore.ts \
>   app/stores/__tests__/userStore.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/018-persist-auth-confirmation-failures.md
- **Category**: security
- **Planned at**: commit `d5bb723`, 2026-07-13

## Why this matters

`userStore` keeps one unowned `profile` ref and one settings queue. A profile
request or queued setting started for account A can settle after sign-out or an
account switch and mutate account B's client state; a delayed queued write can
also resolve the current user only when it executes and therefore target the
wrong account. Profile state and every asynchronous commit must be bound to the
identity and authentication generation that initiated it.

## Current state

- `app/stores/userStore.ts:18-25` declares `profile` and
  `settingsUpdateQueue` without an owning user ID or generation.
- `app/stores/userStore.ts:177-193` resolves an ID, awaits the profile query,
  then commits the result unconditionally.
- `app/stores/userStore.ts:201-246` optimistically mutates `profile`, but each
  queued `runUpdate` resolves the authenticated ID only when the queue reaches
  it. Server responses and the error refetch are also committed without an
  identity check.
- `app/stores/userStore.ts:301-314` uses `watchEffect` and returns as soon as a
  profile exists. That run no longer depends on `supaUser`, so an external
  A-to-B or A-to-null transition does not clear the existing profile.
- `app/stores/__tests__/userStore.test.ts:105` stubs `watchEffect` out, so the
  suite cannot detect identity-transition or stale-request behavior.
- The repository's proven stale-work pattern is
  `app/composables/useUserData.ts:12-39`: capture a generation and resolved user
  ID, then reject results if either changes. Match that behavior rather than
  introducing cancellation libraries.

## Commands you will need

| Purpose           | Command                                                                  | Expected on success |
| ----------------- | ------------------------------------------------------------------------ | ------------------- |
| Focused tests     | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts` | exit 0              |
| Format            | `npm run format`                                                         | exit 0              |
| Conventions       | `npm run check:conventions`                                              | exit 0              |
| Full verification | `npm run verify`                                                         | exit 0              |

## Scope

**In scope**:

- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`

**Out of scope**:

- Route redirects, logout scope, password recovery, OAuth callbacks, or other
  Pinia stores; later plans own those seams.
- Database schema, RLS policies, Supabase configuration, or generated types.
- Removing optimistic settings updates entirely.

## Git workflow

- Branch/isolated worktree label: `codex/025-identity-scoped-profile`.
- Commit once with `fix(auth): scope profile work to user identity`.
- Do not push, merge, or open a PR.

## Target contract

- Maintain a private `profileOwnerId: string | null` and monotonically
  increasing authentication generation in `userStore`.
- Watch `supaUser.value?.id ?? null` directly. Every real identity change must
  invalidate outstanding work, clear `profile`/owner, restore the anonymous
  theme, and start exactly one load for the new identity.
- A profile fetch may commit only when its captured generation and user ID are
  still current. Stale settlement returns `false` without a user-facing error.
- `updateSettings` captures its target user ID and generation at action entry,
  before entering the promise queue. When the reactive ID and profile owner are
  both absent during persisted-session hydration, it may await one identity
  resolution before queueing; it must never resolve identity later inside
  `runUpdate`.
- A stale queued update must perform no database mutation and must not refetch,
  toast, or overwrite current profile/theme/key-format state.
- Only work from the current generation may change `isUpdatingSettings` or
  commit optimistic/server state.

## Steps

### Step 1: Make identity lifecycle explicit

Replace the `watchEffect` with an identity watcher. Add small private helpers
for invalidation/current-work checks so fetch and settings paths share the
same rule. Preserve the persisted-session bootstrap fallback: when the reactive
user has not hydrated, `getSession`/`getUser` may discover an initial identity,
but a later different reactive ID must invalidate it.

Use this concrete ownership shape; equivalent naming is allowed, but do not
invent a second source of truth:

- `profileOwnerId` is the one active profile identity even while its row is
  loading. `profile` may be null while `profileOwnerId` is non-null.
- `invalidateIdentity(nextId)` increments the generation, sets the owner to
  `nextId`, clears profile/current settings loading, replaces the settings queue
  with an already-resolved promise, and restores the anonymous theme.
- On the watcher's immediate null run, query `getSession()` once. If it returns
  an ID while no owner/reactive ID exists, adopt that ID and fetch it.
- If the reactive user later hydrates with the same ID as `profileOwnerId`, do
  nothing—do not invalidate or start a duplicate fetch.
- If the reactive ID differs from `profileOwnerId` (including A-to-null), call
  `invalidateIdentity` and fetch only when the new ID is non-null.
- The public `fetchProfile()` resolves the current ID once, adopts it only when
  no conflicting reactive identity exists, then delegates to a private
  `fetchProfileForIdentity(userId, generation)` used by guarded error recovery.

**Verify**: focused tests compile and existing initial profile/theme behavior
continues to pass.

### Step 2: Guard profile fetch commits

Capture the resolved ID and generation before querying. Before mutating
`profile`, theme, or local key format, confirm both are still current. Treat a
stale result as cancellation, not an operational failure.

**Verify**: add deferred-promise tests for A-to-null and A-to-B transitions;
settling A's request must not restore A's profile or theme, and B must load once.

### Step 3: Bind queued settings updates at invocation time

Capture the owner ID/generation before the update enters
`settingsUpdateQueue`. Prefer the reactive ID, then the adopted profile owner;
only if both are absent may the action await `resolveAuthenticatedUserId()` and
adopt that result before queueing. Keep serial ordering for updates belonging
to one current account. Add a guard immediately before each database mutation
and before each local commit. The error path calls the private guarded fetch
for the captured identity; it must not call public `fetchProfile()` and resolve
whatever identity is current later.

**Verify**: queue an update behind a deferred update, switch A-to-B, release the
queue, and assert no A payload is sent using B's ID and no B profile is replaced
by an A response.

### Step 4: Replace the disabled lifecycle test harness

Use Vue `ref`, `watch`, `nextTick`, and effect-scope cleanup in the store test
instead of stubbing `watchEffect`. Keep mocks deterministic and drain pending
microtasks between tests.

**Verify**: the focused suite exits 0 without unhandled promises or cross-test
state leakage.

### Step 5: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Existing profile fetch and settings success/error tests continue to pass.
- New tests cover profile clearing on A-to-null, clearing/reloading on A-to-B,
  stale fetch settlement after both transitions, stale queued update before DB
  mutation, stale server response after mutation, and current-account queue
  ordering.
- Assert identity, query target, profile state, theme calls, and toast behavior;
  do not rely only on call counts.

## Done criteria

- [ ] `profile` always has an explicit current owner or is null.
- [ ] A stale profile request cannot commit account A state after logout/switch.
- [ ] A queued account A setting cannot write to or overwrite account B.
- [ ] Current-account queued settings still serialize and preserve optimistic UI.
- [ ] Focused tests and `npm run verify` pass.
- [ ] Only the two in-scope files are changed.

## STOP conditions

Stop if Supabase's reactive user can change without changing
`supaUser.value?.id`, the fix requires a database/RLS change, or preserving the
persisted-session bootstrap requires a second independent owner of profile
state.

## Maintenance notes

Every future user-owned async action added to this store must capture identity
at invocation and guard settlement. Reviewers should reject any new use of
`resolveAuthenticatedUserId()` inside a delayed queue callback.
