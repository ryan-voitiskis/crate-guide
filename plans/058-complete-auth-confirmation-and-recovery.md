# Plan 058: Complete authentication confirmation and recovery journeys

> **Executor instructions**: Preserve safe destinations through recovery, give
> pending signups a bounded resend/correction path, make expired-link actions
> purpose-specific, avoid persisting email addresses in URLs or browser storage,
> and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 057
- **Category**: authentication / recovery / navigation
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: DONE

## Why this matters

The signup confirmation page says an email was sent but neither identifies the
destination safely nor offers resend or correction. Its only action is login,
so a mistyped address or lost message becomes a dead end. The generic
confirmation-error page already knows whether a link represents signup,
recovery, invite, magic link, email change, or email sign-in, but every failure
still receives the same login action.

The login route also preserves its requested destination through signup but not
through password recovery: `Reset it` drops `redirect`, the reset-email request
targets plain `/update-password`, and a successful password update navigates to
`/`. A user sent to login from a protected record/crate therefore loses their
original task precisely when recovery succeeds.

## Scope

Modify:

- `app/stores/userStore.ts`
- `app/utils/authRoutes.ts`
- `app/pages/login.vue`
- `app/pages/signup.vue` only for pending-confirmation handoff
- `app/pages/reset-password.vue`
- `app/pages/update-password.vue`
- `app/pages/auth/check-inbox.vue`
- `app/pages/auth/confirm.vue`
- focused route, store, Nuxt recovery/confirmation, and E2E tests

Do not change hosted Supabase email templates, authentication providers,
password policy, database schema, account enumeration behavior, or the existing
rule that unsafe/external return paths fall back to `/`.

## Drift check

```bash
git status --short
rg -n "build.*RedirectPath|redirectTo|sendPasswordResetEmail|resetPassword|resend|verifyOtp" app/stores/userStore.ts app/utils/authRoutes.ts app/pages test
rg -n "Check your inbox|Already confirmed|Back to login|Request a new link|type ===" app/pages/auth app/pages/{login,signup,reset-password,update-password}.vue
```

STOP if Plan 057 is not complete, if another implementation already preserves
the return path through password recovery, or if signup confirmation now has an
authoritative resend/correction state machine.

## Required implementation

1. Preserve the safe destination through the complete password-reset flow.
   - Add focused route builders for entering reset-password and update-password
     with a sanitized return path.
   - The login `Reset it` link forwards the current safe destination.
   - `sendPasswordResetEmail` accepts that destination and includes it in the
     local/hosted `redirectTo` URL without double encoding.
   - `update-password.vue` reads and sanitizes the destination, and successful
     reset navigation replaces or pushes to that path instead of always `/`.
   - Malformed, external, protocol-relative, encoded, or auth-loop destinations
     still resolve to `/`.

2. Carry pending-signup context ephemerally.
   - After email signup requires confirmation, retain only the minimum in-memory
     context needed for the immediate check-inbox route: email plus safe return
     path.
   - Do not put the email in query parameters, localStorage, sessionStorage,
     logs, or toast text. Hard refresh may intentionally lose the resend target.
   - Display a masked destination when context is present; never render the
     password or full authentication response.

3. Add bounded confirmation recovery actions.
   - Provide `Use another email`, returning to signup with the safe destination.
   - Add a store action wrapping Supabase signup resend with explicit loading,
     success, and safe generic failure states.
   - Show `Resend confirmation` only while authoritative in-memory email context
     exists. After hard refresh, show a clear route back to signup rather than a
     broken resend control.
   - Disable repeat clicks while a resend is pending and respect provider rate
     failures; do not implement a client loop that bypasses Supabase limits.

4. Make invalid/expired-link actions purpose-specific.
   - Recovery links lead to requesting another password reset while preserving
     the safe destination.
   - Signup links lead to pending-signup recovery when context exists, otherwise
     to signup with the destination preserved.
   - Magic-link/email sign-in failures lead to login with the destination.
   - Invite and email-change failures receive explicit safe actions based on
     whether a current authenticated user exists; do not promise resend support
     the application cannot perform.
   - Keep all failure copy generic and do not display callback/provider details.

5. Keep navigation and feedback ownership deterministic.
   - Await route transitions that are part of a store action before reporting
     completion, or make the page the sole owner of navigation.
   - Do not clear a form or announce success before the required route actually
     opens.
   - Follow Plan 057's rule that a persistent page result is not duplicated by
     a toast.

## Test plan

```bash
npm run format
npx vitest run --project unit app/utils/authRoutes.test.ts
npx vitest run --project stores app/stores/__tests__/userStore.test.ts
npx vitest run --project nuxt \
  test/nuxt/auth-forms.nuxt.test.ts \
  test/nuxt/auth-recovery.nuxt.test.ts \
  test/nuxt/auth-confirm-page.nuxt.test.ts
npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts
npm run check:conventions
npm run verify
git diff --check
```

Required cases include:

- `/records?crate=house#release-1` survives login -> reset request -> update ->
  successful completion;
- hostile and encoded external destinations collapse to `/` at every boundary;
- pending signup shows a masked destination, resend, and correction action;
- hard-refresh check-inbox state never offers a resend without an email target;
- resend success/failure/loading is single-flight and action-local;
- confirmation failure CTAs differ correctly for signup, recovery, magic link,
  invite, email, and email change.

For one manual integration smoke, use a disposable address/account only in the
isolated local Supabase stack and Mailpit. Do not use a personal address, hosted
project, or destructive database reset. Record the tested redirect and remove
the disposable local account only if the cleanup target is exact and verified.

## Done criteria

- [x] Password recovery returns users to the original safe destination.
- [x] Pending signup offers working resend and email-correction paths.
- [x] Email context remains ephemeral and absent from URLs/storage/logs.
- [x] Expired-link recovery actions match the link purpose.
- [x] Navigation completion and user feedback have one authoritative owner.
- [x] Focused tests, local email smoke, and repository gates pass.

## STOP conditions

Stop if resend requires persisting an email address beyond in-memory SPA state,
if return-path preservation weakens `sanitizeAuthReturnPath`, if local email
testing would touch a hosted project or real address, or if purpose-specific
recovery requires inventing unsupported invite/email-change APIs.

## Git workflow

- Branch: `codex/058-complete-auth-recovery`
- Commit: `fix(auth): complete confirmation and recovery journeys`
