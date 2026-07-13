# Plan 030: Make login destinations and auth callbacks deterministic

> **Executor instructions**: Execute after the account lifecycle plan. Reuse its
> route-policy helper; do not create a second allowlist. Run every verification
> and stop on scope expansion.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 2f1e2a6..HEAD -- \
>   app/utils/authRoutes.ts \
>   app/utils/authRoutes.test.ts \
>   app/middleware/auth.global.ts \
>   app/middleware/__tests__/auth.global.test.ts \
>   app/pages/login.vue \
>   app/pages/auth/finalising.vue \
>   app/stores/userStore.ts \
>   app/stores/__tests__/userStore.test.ts \
>   test/nuxt/auth-finalising.nuxt.test.ts \
>   test/e2e/login-redirect.e2e.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/028-enforce-account-lifecycle-and-logout.md
- **Category**: bug
- **Planned at**: commit `2f1e2a6`, 2026-07-13

## Why this matters

Protected deep links lose their destination at login, while OAuth denial or a
malformed/expired callback leaves `/auth/finalising` spinning forever. One safe
internal return-path contract should flow through middleware, email login, and
OAuth callbacks, and finalisation must have bounded success and failure states.

## Current state

- `app/middleware/auth.global.ts:21` redirects to `/login` without recording
  the requested route.
- `app/pages/login.vue:35-47` sends email success to `/auth/finalising`, then a
  user watcher always replaces with `/`.
- `app/stores/userStore.ts:134-147` always uses a bare
  `/auth/finalising` OAuth redirect URL.
- `app/pages/auth/finalising.vue:7-19` has only a user watcher and spinner. It
  does not inspect callback errors and has no timeout or recovery action.
- Runtime audit reproduced `/records` becoming bare `/login`, and
  `/auth/finalising?error=access_denied` remaining on an endless spinner.
- `test/e2e/login-redirect.e2e.test.ts` covers only successful home redirects.

## Commands you will need

| Purpose               | Command                                                                                                                                                           | Expected on success |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Unit/store/middleware | `npx vitest run --project unit app/utils/authRoutes.test.ts --project stores app/middleware/__tests__/auth.global.test.ts app/stores/__tests__/userStore.test.ts` | exit 0              |
| Nuxt callback test    | `npx vitest run --project nuxt test/nuxt/auth-finalising.nuxt.test.ts`                                                                                            | exit 0              |
| Browser E2E           | `npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts`                                                                                                | exit 0              |
| Format                | `npm run format`                                                                                                                                                  | exit 0              |
| Conventions           | `npm run check:conventions`                                                                                                                                       | exit 0              |
| Full verification     | `npm run verify`                                                                                                                                                  | exit 0              |

## Scope

**In scope**:

- `app/utils/authRoutes.ts`
- `app/utils/authRoutes.test.ts`
- `app/middleware/auth.global.ts`
- `app/middleware/__tests__/auth.global.test.ts`
- `app/pages/login.vue`
- `app/pages/auth/finalising.vue`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `test/nuxt/auth-finalising.nuxt.test.ts` (create)
- `test/e2e/login-redirect.e2e.test.ts`

**Out of scope**:

- Confirmation and recovery state, credential validation/attributes, provider
  configuration, Supabase backend settings, or Discogs OAuth.
- External return URLs. Only same-origin app paths are supported.
- Rendering raw `error_description` or provider internals.

## Git workflow

- Branch/isolated worktree label: `codex/030-auth-routing-callbacks`.
- Commit once with `fix(auth): preserve safe login destinations`.
- Do not push, merge, or open a PR.

## Target contract

- `sanitizeAuthReturnPath(unknown)` returns an internal path beginning with one
  `/`, rejects protocol-relative/absolute/control-character values, and falls
  back to `/`. It should reject public auth entry/finalising routes as return
  targets to prevent loops.
- Exact `/update-password` is publicly reachable so a reset-link landing can
  initialize Auth JS and emit `PASSWORD_RECOVERY`; it is not signed-out-only,
  and Plan 029's state gate prevents an ordinary session from seeing the form.
  The sanitizer rejects it as a return target.
- Middleware redirects a signed-out protected request to
  `/login?redirect=<encoded fullPath>`.
- Email and provider login carry that safe target through finalising. OAuth's
  `redirectTo` contains the same safe query value on the app's own origin.
- Finalising states are: loading, success redirect, callback failure, and
  bounded timeout. Failure copy is generic and persistent with retry/back-to-
  login actions; raw query details are not rendered. Rejected and resolved
  router navigation failures both leave the spinner for persistent failure UI.
- Already-authenticated visits to `/login?redirect=/records` go to the safe
  target instead of always `/`.

## Steps

### Step 1: Add and test safe return-path helpers

Extend the route helper from Plan 028 with sanitization and a login-location
builder. Make exact `/update-password` public but never a return target. Cover
valid paths with query/hash, non-string arrays, `//`, schemes,
backslashes/control characters, and auth-loop destinations.

**Verify**: pure unit tests exit 0.

### Step 2: Preserve protected destinations in middleware

Use `to.fullPath`, not only `to.path`, and pass the sanitized value as the
redirect query. Authenticated auth-entry navigation should use the same safe
target when present.

**Verify**: middleware tests assert deep path/query preservation and malicious
fallback to `/`.

### Step 3: Carry the target through login methods

Read the safe route query in `login.vue`. Pass it to finalising for email login
and into `signInWithProvider(provider, returnPath)` for OAuth redirectTo. Keep
provider loading/error behavior unchanged.

**Verify**: store tests assert exact encoded callback URLs for default and deep
targets; login rendered/unit coverage asserts safe forwarding.

### Step 4: Replace the infinite spinner with a state machine

In `finalising.vue`, handle provider query errors immediately with generic copy,
redirect an authenticated user to the safe target, treat thrown or resolved
navigation failures as persistent callback failure, and show a stable timeout
failure if hydration never completes. Clear timers on unmount. Reuse existing
ShellAuth/Notice/Button patterns and `keepalive: false`.

**Verify**: Nuxt tests cover success, denied callback, malformed callback,
timeout with fake timers, retry link, safe target, and unsafe target fallback.

### Step 5: Extend browser regressions

Add a signed-out deep-link test that reaches login with a redirect query and,
after mocked email login, returns to that path. Keep the existing home-default
test. Add a callback-error test if the Nuxt rendered test cannot prove the full
page state.

**Verify**: focused E2E exits 0.

### Step 6: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Table-driven safe-path unit tests.
- Middleware tests for destination capture, authenticated restoration, and
  unauthenticated recovery-landing reachability.
- Store tests for OAuth callback URL construction.
- Rendered finalising tests for callback error, timeout, success, resolved
  navigation failure, and cleanup.
- Browser deep-link round trip `/records` → login → `/records`.

## Done criteria

- [ ] Protected full paths survive email and OAuth login.
- [ ] External/protocol-relative/auth-loop targets always fall back to `/`.
- [ ] Denied/malformed callbacks never spin forever.
- [ ] Hydration timeout provides persistent retry/exit UI.
- [ ] Focused tests, E2E, and `npm run verify` pass.
- [ ] Only in-scope files are changed.

## STOP conditions

Stop if Plan 028's route helper is absent or has a conflicting contract, if
Supabase rejects callback URLs containing an encoded app query, or if OAuth
state must be persisted outside the callback URL to survive the provider flow.
Report the observed behavior before choosing another persistence mechanism.

## Maintenance notes

All future auth entry points must use the same safe-return helper. Never pass a
raw route query to `router.push/replace` or provider redirect options.
