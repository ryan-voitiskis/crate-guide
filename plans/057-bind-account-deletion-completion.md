# Plan 057: Bind account deletion completion to its initiating identity

> **Executor instructions**: Follow this plan from a clean branch. Reproduce
> the deferred account A to account B transition before changing source. Keep
> the server deletion result separate from browser-session cleanup. STOP rather
> than risking the newly active account.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/stores/userStore.ts app/stores/__tests__/userStore.test.ts app/components/settings/DialogDeleteAccount.vue test/nuxt/library-mutation-dialogs.nuxt.test.ts`
> If any listed file changed, compare the excerpts below with live source first.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: bug / authentication lifecycle
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

`deleteAccount` revalidates the current user before dispatch, but after the
Edge response it unconditionally signs out, clears shared identity state, and
redirects. If account A's deletion finishes after the browser has switched to
B, A is deleted correctly server-side but B is removed from the active client.

## Current state

- `app/stores/userStore.ts:361-465` owns confirmation, function invocation,
  local sign-out, identity invalidation, navigation, and result toasts.
- The destructive completion currently has no `AuthenticatedWork` ownership:

```ts
const { data, error } = await supabase.functions.invoke('delete-account', ...)
// ...validate data...
await supabase.auth.signOut({ scope: 'local' })
authenticatedUser.value = null
invalidateIdentity(null)
await router.replace('/login')
```

- `app/stores/userStore.ts:563-700` demonstrates the existing account ID plus
  generation pattern used by profile reads/writes.
- `app/stores/__tests__/userStore.test.ts:657-905` covers normal deletion and
  single-flight behavior, but not identity replacement while the request is
  pending.

Repository rules: keep Supabase/auth logic in the store; use Conventional
Commits; run Prettier through `npm run format`, never edit generated UI.

## Commands you will need

| Purpose       | Command                                                                         | Expected on success       |
| ------------- | ------------------------------------------------------------------------------- | ------------------------- |
| Focused tests | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts`        | all user-store tests pass |
| Dialog tests  | `npx vitest run --project nuxt test/nuxt/library-mutation-dialogs.nuxt.test.ts` | all dialog tests pass     |
| Conventions   | `npm run check:conventions`                                                     | exit 0                    |
| Full gate     | `npm run verify`                                                                | exit 0                    |

## Scope

**In scope**:

- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `app/components/settings/DialogDeleteAccount.vue`
- `test/nuxt/library-mutation-dialogs.nuxt.test.ts`

**Out of scope**:

- Edge deletion semantics or cleanup ordering (Plan 050)
- account-delete dialog copy beyond lifecycle ownership
- anonymous/local-library account separation (Plans 068-072)
- deleting, signing out, or testing against a real hosted account

## Git workflow

- Branch: `codex/057-bind-account-deletion-completion`
- Commit: `fix(auth): bind account deletion completion`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the missing interleaving tests

Use deferred `getUser`, function invocation, and sign-out promises. Start A's
deletion, replace the reactive/session identity with B, then settle A. Assert A
returns the truthful server outcome while B remains signed in, hydrated, and
on its current route. At the component boundary, reopen the dialog for B and
begin B's deletion while A is pending; A's result must not close, reset, toast,
or clear B's submission state. Cover replacement before dispatch, after
dispatch, Edge failure, local sign-out failure, and ordinary same-A success.

**Verify**: focused test must fail for the current unconditional cleanup.

### Step 2: Capture and validate destructive-operation ownership

After authoritative `getUser`, capture `{ userId, generation }` and the exact
authorization context used for the function request. Recheck ownership
immediately before dispatch. Prove the outbound bearer token belongs to that
captured account; do not let a shared client's later token refresh silently
retarget the request.

After a successful server response, always return that deletion outcome. Only
run local sign-out, shared-state invalidation, login navigation, and same-user
success messaging when the captured work is still current. A replacement
identity must receive no cleanup side effect from the old operation.

**Verify**: all focused tests pass.

### Step 3: Make flags and errors owner-safe

Ensure a stale A completion cannot clear a B-owned deletion/submission flag or
toast a failure as if B's account failed. Preserve single-flight for one
identity and preserve the existing `recent-auth-required` result.

**Verify**: `npm run check:conventions && npm run verify` exits 0.

### Step 4: Bind the dialog caller to its open/account generation

Capture the dialog open generation plus initiating account ID before awaiting
`user.deleteAccount`. Close/reset/show result only if that same generation and
account still own the dialog. A stale store result remains available for logs or
operation truth, but cannot mutate a dialog reopened for B.

**Verify**: the focused Nuxt dialog suite covers A pending, B reopened/submitted,
then every A terminal outcome.

## Test plan

- Model deferred ownership tests on the existing authentication-lifecycle
  cases in `userStore.test.ts`.
- Assert call counts and exact identities for `getUser`, function invocation,
  sign-out, invalidation, router replacement, and toasts.
- Include A to null, A to B, and unchanged A completion.
- Include B reopening and starting a second deletion before A settles.

## Done criteria

- [x] The deletion request is provably authorized as the captured account.
- [x] A stale successful completion cannot sign out, clear, redirect, or toast for B.
- [x] A stale caller completion cannot close/reset or clear B's delete dialog state.
- [x] The initiating account receives the existing success/reauth/failure behavior when still current.
- [x] Focused and full gates pass; only in-scope files and the plan index changed.

## STOP conditions

Stop if the function client cannot bind the outbound token to the captured
identity, if the server response cannot be distinguished from local cleanup,
or if a test would require a real account. Also stop after two failed attempts
at any required gate.

## Maintenance notes

Reviewers should scrutinize the moment authorization is captured and every
post-await state write. Plan 072 later changes account/local-library scope, but
must preserve this operation-ownership invariant.
