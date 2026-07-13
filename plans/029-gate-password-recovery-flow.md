# Plan 029: Gate password reset behind a recovery auth event

> **Executor instructions**: This plan improves the client recovery state
> machine; it does not claim to configure the hosted Supabase project's Secure
> password change setting. Run every gate and do not expand into remote
> administration.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 387bcc4..HEAD -- \
>   app/composables/usePasswordRecovery.ts \
>   app/plugins/auth-recovery.client.ts \
>   app/pages/update-password.vue \
>   app/stores/userStore.ts \
>   app/stores/__tests__/userStore.test.ts \
>   test/nuxt/auth-recovery.nuxt.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/028-enforce-account-lifecycle-and-logout.md
- **Category**: security
- **Planned at**: commit `387bcc4`, 2026-07-13

## Why this matters

`/update-password` renders for any authenticated session and immediately calls
`updateUser({ password })`; the application never distinguishes Supabase's
`PASSWORD_RECOVERY` event from an ordinary login. The reset page should be an
explicit recovery state machine, reject direct navigation, and preserve the
form when an update fails. Hosted Secure password change remains an external
defense-in-depth setting and must not be implied by client UI checks.

## Current state

- `app/pages/update-password.vue:6-22` has no recovery-state check and resets the
  form after both successful and failed updates.
- `app/stores/userStore.ts:189-198` calls `updateUser({ password })`, routes home
  only on success, but returns no outcome.
- `app/stores/userStore.ts:200-213` accepts `recovery` as an OTP type yet routes
  every successful type to home with “Sign in successful”. Plan 018 makes its
  result truthful but intentionally does not redesign recovery.
- Installed Supabase Auth emits `PASSWORD_RECOVERY` through
  `onAuthStateChange`; the installed client also supports reauthentication
  nonces for ordinary password changes.
- This SPA has no normal “change password” form in Settings. This plan owns only
  reset-link recovery; it must not invent a second password-change workflow.

## Commands you will need

| Purpose           | Command                                                                  | Expected on success |
| ----------------- | ------------------------------------------------------------------------ | ------------------- |
| Store test        | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts` | exit 0              |
| Nuxt test         | `npx vitest run --project nuxt test/nuxt/auth-recovery.nuxt.test.ts`     | exit 0              |
| Format            | `npm run format`                                                         | exit 0              |
| Conventions       | `npm run check:conventions`                                              | exit 0              |
| Full verification | `npm run verify`                                                         | exit 0              |

## Scope

**In scope**:

- `app/composables/usePasswordRecovery.ts` (create)
- `app/plugins/auth-recovery.client.ts` (create)
- `app/pages/update-password.vue`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `test/nuxt/auth-recovery.nuxt.test.ts` (create)

**Out of scope**:

- Hosted Supabase dashboard changes, Management API calls, email-template
  redesign, or claims that Secure password change is enabled remotely.
- A normal Settings “change password” flow, reauthentication form, MFA, or
  password-strength/form semantics owned by Plan 031.
- Login/OAuth finalisation and return destinations owned by Plan 030.

## Git workflow

- Branch/isolated worktree label: `codex/029-password-recovery-gate`.
- Commit once with `fix(auth): gate password reset by recovery state`.
- Do not push, merge, or open a PR.

## Target contract

- A client plugin subscribes once to Supabase auth events and records a small
  state machine through `usePasswordRecovery`: checking, active, or invalid.
- Only `PASSWORD_RECOVERY` activates reset capability. A marker may restore it
  only during `INITIAL_SESSION` on same-tab remount; ordinary `SIGNED_IN`,
  `SIGNED_OUT`, successful reset, and terminal invalidation clear it. If session storage is used to
  survive a same-tab remount, store only a boolean/version marker—never tokens,
  email, or auth payloads—and clear it after use.
- Direct navigation by an ordinary authenticated user never renders an enabled
  password form. It shows stable invalid/expired guidance and an exit action.
- `resetPassword(password): Promise<boolean>` returns false only when
  `updateUser` fails and leaves input intact. Once the password mutation
  succeeds, recovery is consumed immediately; a later navigation failure is
  reported separately and cannot leave an active credential form.
- A successful `recovery` OTP confirmation must enter the recovery path instead
  of always navigating home. Other OTP types keep Plan 018's behavior.

## Steps

### Step 1: Add the recovery state owner and auth-event plugin

Create one composable state contract and one `.client` plugin subscription.
Clean up the subscription on app teardown/HMR where the plugin pattern permits.
Do not persist Supabase session/token material.

**Verify**: Nuxt tests emit `PASSWORD_RECOVERY`, `SIGNED_OUT`, and ordinary
`SIGNED_IN`; only recovery activates the state.

### Step 2: Route recovery OTP success correctly

When `verifyOtp(..., 'recovery')` succeeds, activate recovery and navigate to
`/update-password`; preserve boolean/error behavior from Plan 018. Non-recovery
types continue to navigate home.

**Verify**: store tests assert type-specific navigation and outcomes.

### Step 3: Make password update truthful

Return a boolean from `resetPassword`. On successful `updateUser`, clear recovery
state before routing home and toast truthfully. On update failure return false
without clearing state or navigating. If home navigation alone fails, preserve
the successful mutation outcome but show distinct guidance rather than treating
the changed password as a failed update.

**Verify**: store tests assert both outcomes and recovery-state clearing only on
success.

### Step 4: Render complete checking/active/invalid states

Update the page so the form exists only in active recovery. Checking renders a
loading state; invalid renders generic expired/invalid guidance without raw
provider details. Reset the form only after `true`.

**Verify**: rendered tests cover direct authenticated navigation, checking,
active submission failure, and successful reset.

### Step 5: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Auth-event state tests for recovery, ordinary sign-in (including a stale
  marker), sign-out, remount, and
  successful consumption.
- Store tests for recovery OTP routing and boolean reset outcomes.
- Rendered page tests proving an ordinary session cannot see/submit the form and
  failed update preserves the entered value.
- No test stores or asserts real token-shaped values.

## Done criteria

- [ ] Only a captured recovery event enables the reset form.
- [ ] Direct ordinary-session navigation renders no password submit control.
- [ ] Recovery OTP success reaches `/update-password`.
- [ ] Failed update preserves recovery state and input; success consumes it.
- [ ] Focused tests and `npm run verify` pass.
- [ ] Only in-scope files are changed.

## STOP conditions

Stop if the installed Nuxt Supabase module consumes `PASSWORD_RECOVERY` before
an application plugin can observe it, if reliable gating would require storing
tokens, or if a backend/hosted setting must be changed to meet the target
contract. Report that limitation rather than presenting a UI-only check as
server authorization.

## Maintenance notes

Supabase documents Secure password change as a hosted email-provider setting
with reauthentication/nonce behavior for older sessions. That external setting
should be reviewed separately before describing ordinary password changes as
recent-auth protected.
