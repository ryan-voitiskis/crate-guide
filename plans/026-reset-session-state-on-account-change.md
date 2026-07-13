# Plan 026: Make DJ session state safe to reset between accounts

> **Executor instructions**: Follow every step and gate. Touch only the two
> files in Scope. The new reset is a store contract for a later lifecycle plan;
> do not wire authentication here. Stop instead of expanding scope.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat d78d42a..HEAD -- \
>   app/stores/sessionStore.ts \
>   app/stores/__tests__/sessionStore.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d78d42a`, 2026-07-13

## Why this matters

The session store retains loaded track objects, current history, saved sets,
selected IDs, dialogs, and a delayed autosave across auth changes. Its existing
`clearSession()` is intentionally narrower and leaves `savedSets` and UI state
behind. A dedicated account reset must clear all user-owned state and ensure
late fetch/autosave work cannot repopulate it.

## Current state

- `app/stores/sessionStore.ts:33-60` stores decks, current history, saved sets,
  active/selected set IDs, and dialog state in one long-lived Pinia store.
- `app/stores/sessionStore.ts:248-263` clears the active session and decks but
  deliberately leaves `savedSets`, selection, and most dialogs untouched.
- `app/stores/sessionStore.ts:266-345` schedules autosave work two seconds
  later. The callback reads whatever account is current when it fires.
- `app/stores/sessionStore.ts:348-369` fetches sets for the current user and
  unconditionally commits after awaiting the query.
- `app/pages/index.vue:8-10` fetches sets only on mount, while global Nuxt
  keepalive can retain the page/store across account changes.
- `app/stores/__tests__/sessionStore.test.ts:630-684` characterizes the narrow
  `clearSession()` behavior. Preserve that action; add a separate account reset.

## Commands you will need

| Purpose           | Command                                                                     | Expected on success |
| ----------------- | --------------------------------------------------------------------------- | ------------------- |
| Focused tests     | `npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts` | exit 0              |
| Format            | `npm run format`                                                            | exit 0              |
| Conventions       | `npm run check:conventions`                                                 | exit 0              |
| Full verification | `npm run verify`                                                            | exit 0              |

## Scope

**In scope**:

- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`

**Out of scope**:

- `useUserData`, auth middleware, user/Discogs stores, pages, or components.
- Changing what user-invoked `clearSession()` preserves.
- Database/RLS/schema changes or changing the saved-set row format.

## Git workflow

- Branch/isolated worktree label: `codex/026-session-account-reset`.
- Commit once with `fix(session): reset state across account changes`.
- Do not push, merge, or open a PR.

## Target contract

Export `resetAccountState()` from the store. It must synchronously:

- invalidate a private session-account generation;
- cancel and null the autosave timeout;
- empty current history and saved sets;
- clear active/selected set IDs, load-track selection, and deck-loaded tracks;
- close account-data dialogs and reset their selections;
- reset account-operation loading/error flags to idle defaults;
- retain only genuine device/UI preferences such as deck count and the user's
  chosen panel visibility.

Every asynchronous saved-set/autosave operation must capture the generation and
user ID that started it. Late work may finish at the network layer but must not
commit state, toast for the replacement user, or schedule follow-up work after
reset.

## Steps

### Step 1: Add a complete account reset

Implement `resetAccountState()` separately from `clearSession()`. Factor shared
deck/session clearing into a private helper if that avoids divergence, but keep
the public semantics of `clearSession()` unchanged.

**Verify**: focused tests assert every account-owned field returns to its
initial state while deck count and panel visibility remain unchanged.

### Step 2: Invalidate delayed autosave

Capture account generation/user ID when scheduling. Recheck both before create
or update, and before committing IDs/errors. Reset must cancel pending timers.
Use fake timers in tests; do not introduce a timer abstraction.

**Verify**: schedule autosave, reset, advance timers, and assert no Supabase
insert/update and no toast occurs.

### Step 3: Reject stale saved-set fetches

Capture user ID/generation at fetch start and check them before replacing
`savedSets` or presenting an error. Ensure a late `finally` from stale work
cannot change the loading state for a newer fetch.

**Verify**: a deferred fetch started for A, followed by reset and a B fetch,
cannot overwrite B sets when A settles last.

### Step 4: Guard other stateful set mutations

Apply the same current-work check to save/delete paths where a late result
mutates `savedSets`, `activeSetId`, `selectedSetId`, dialogs, or error state.
Backend ownership remains enforced by existing RLS; this step protects client
state, not a new authorization layer.

**Verify**: targeted tests prove a late save/delete settlement after reset does
not repopulate or select old-account state.

### Step 5: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Preserve all existing `clearSession` assertions.
- Add full reset coverage for saved sets, decks, history, selections, dialogs,
  timers, loading, and errors.
- Add fake-timer autosave cancellation and deferred A/B fetch ordering tests.
- Assert absence of stale Supabase writes and toasts, not only empty arrays.

## Done criteria

- [ ] One exported action fully resets account-owned session state.
- [ ] User-invoked `clearSession()` keeps its previous narrow semantics.
- [ ] Pending autosave cannot run after account reset.
- [ ] Late A fetch/save/delete work cannot mutate B or signed-out state.
- [ ] Focused tests and `npm run verify` pass.
- [ ] Only the two in-scope files are changed.

## STOP conditions

Stop if a complete reset requires changing persisted set schema, if an existing
test proves a supposedly account-owned field must survive account switches, or
if cancellation requires touching a component/composable outside Scope.

## Maintenance notes

Future session-store network actions must join the same generation contract.
Review whether newly added fields are account data or device UI preferences and
add them to `resetAccountState()` when appropriate.
