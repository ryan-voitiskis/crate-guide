# Plan 028: Enforce one account lifecycle across logout and route protection

> **Executor instructions**: Execute only after Plans 025–027 are reviewed
> DONE. Use their exported reset contracts; do not reimplement them. Run every
> gate, touch only Scope, and stop if a dependency contract is missing.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 789cf40..HEAD -- \
>   app/utils/authRoutes.ts \
>   app/utils/authRoutes.test.ts \
>   app/middleware/auth.global.ts \
>   app/middleware/__tests__/auth.global.test.ts \
>   app/composables/useUserData.ts \
>   app/composables/__tests__/useUserData.test.ts \
>   app/stores/userStore.ts \
>   app/stores/__tests__/userStore.test.ts \
>   test/e2e/login-redirect.e2e.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/025-bind-profile-work-to-auth-identity.md, plans/026-reset-session-state-on-account-change.md, plans/027-reset-discogs-state-on-account-change.md
- **Category**: security
- **Planned at**: commit `789cf40`, 2026-07-13

## Why this matters

Auth middleware runs only during navigation. Successful logout, session expiry,
or cross-tab logout can therefore leave a protected page rendered, and the
existing user-data coordinator resets only records/tracks/crates. This plan
turns every user-ID change into one lifecycle event: clear all account state,
leave protected UI when signed out, and make explicit logout affect only this
browser session as the Settings copy promises.

## Current state

- `app/middleware/auth.global.ts:5-10` duplicates route classification and makes
  every `/auth/*` page public, including the authenticated Discogs callback.
- `app/middleware/auth.global.ts:16-27` protects routes only when navigation
  invokes middleware.
- `app/composables/useUserData.ts:135-164` already watches user-ID transitions,
  but clears only records, tracks, and crates and performs no route transition.
- `app/app.vue:5` mounts `useUserData()` once for the lifetime of the SPA; this
  is the correct single integration point.
- `app/stores/userStore.ts:148-158` calls `signOut()` without scope, clears only
  profile/theme, and returns no outcome or navigation.
- Installed `@supabase/auth-js` defaults `signOut` to `{ scope: 'global' }`,
  while `app/pages/settings.vue:63` says this card manages the current session.
- Plans 025–027 provide identity-safe profile work plus
  `session.resetAccountState()` and `discogs.resetAccountState()`.

## Commands you will need

| Purpose                  | Command                                                                                                                                                                                                         | Expected on success |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Focused unit/store tests | `npx vitest run --project unit app/utils/authRoutes.test.ts --project stores app/middleware/__tests__/auth.global.test.ts app/composables/__tests__/useUserData.test.ts app/stores/__tests__/userStore.test.ts` | exit 0              |
| Browser E2E              | `npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts`                                                                                                                                              | exit 0              |
| Format                   | `npm run format`                                                                                                                                                                                                | exit 0              |
| Conventions              | `npm run check:conventions`                                                                                                                                                                                     | exit 0              |
| Full verification        | `npm run verify`                                                                                                                                                                                                | exit 0              |

## Scope

**In scope**:

- `app/utils/authRoutes.ts` (create)
- `app/utils/authRoutes.test.ts` (create)
- `app/middleware/auth.global.ts`
- `app/middleware/__tests__/auth.global.test.ts`
- `app/composables/useUserData.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `test/e2e/login-redirect.e2e.test.ts`

**Out of scope**:

- Login destination restoration and callback failure UI; Plan 030 owns those.
- Password recovery, confirmation-page presentation, credential forms, or
  Supabase backend configuration.
- Altering the account reset internals delivered by Plans 025–027.
- Global logout UI. This plan intentionally selects local/session-only logout
  to match existing copy; adding “log out everywhere” is a separate feature.

## Git workflow

- Branch/isolated worktree label: `codex/028-auth-lifecycle`.
- Commit once with `fix(auth): enforce account lifecycle on sign-out`.
- Do not push, merge, or open a PR.

## Target contract

- One pure route helper owns exact public route classification. Public auth
  paths are `/login`, `/signup`, `/reset-password`, `/auth/check-inbox`,
  `/auth/confirm`, and `/auth/finalising`; demo is exact `/demo` or `/demo/*`.
  `/auth/discogs/capture-verifier` and unknown future `/auth/*` paths are
  protected.
- Every A-to-null and A-to-B transition synchronously clears profile/library,
  session, and Discogs account state before any replacement load commits.
- A-to-null while on a protected route uses `router.replace('/login')`; public
  and demo routes remain where they are. This covers explicit logout, token
  expiry, and cross-tab logout without waiting for another navigation.
- `userStore.signOut(): Promise<boolean>` calls
  `supabase.auth.signOut({ scope: 'local' })`, returns truthful success/failure,
  and deterministically replaces the protected page with `/login` on success.
  A small explicit-signout flag gives that store-owned replacement precedence;
  the reactive coordinator still clears state but does not issue a duplicate.
- Sign-out failure preserves the current account/page and returns `false`.

## Steps

### Step 1: Centralize public/protected route classification

Create pure helpers and tests, then make middleware consume them. Keep the
existing session-hydration fallback and 503 behavior. Add explicit tests proving
the Discogs callback and unknown `/auth/*` routes are protected.

**Verify**: unit and middleware focused tests exit 0.

### Step 2: Expand the account reset boundary

Instantiate session and Discogs stores inside `useUserData`. Include their
dependency-provided reset actions whenever the account identity changes or is
cleared. Do not reset on the initial no-user bootstrap check.

**Verify**: extend transition tests to assert all five data/session/Discogs
reset actions fire exactly once for A-to-null and A-to-B and not for initial
null.

### Step 3: Reactively leave protected routes

Use `useRoute`, `useRouter`, and the shared route helper in the global
coordinator. On a real user-to-null transition, clear state first, then replace
a protected route with `/login`. Prevent duplicate replacements and do not
redirect public/demo routes. When `userStore` marks an explicit signout in
progress, let its awaited replacement own navigation; token expiry/cross-tab
signout continues to use the coordinator replacement. Re-evaluate when the
explicit-signout flag clears so a rejected store-owned replacement gets one
coordinator fallback without duplicating the normal success path.

**Verify**: composable tests simulate Settings logout, public-route logout, and
cross-tab user nullification. Assert reset-before-navigation ordering.

### Step 4: Make explicit logout local and truthful

Pass `{ scope: 'local' }`, expose a readonly explicit-signout-in-progress flag,
return a boolean, and await a successful `router.replace('/login')`. Keep the
flag set through navigation and clear it in all terminal paths. Profile clearing
remains safe/idempotent with the identity watcher from Plan 025. Preserve
current error toast/log behavior.

**Verify**: store tests assert exact scope, boolean outcome, replace on success,
and no replace/state clear on failure.

### Step 5: Add a rendered logout regression

Extend the existing browser fixture so authenticated state can emit a signed-out
transition. Navigate to Settings, click Log out, and assert `/login` replaces the
URL and Settings/account content is absent. Do not inspect cookies/localStorage.

**Verify**: focused E2E exits 0 and fails if Settings remains rendered.

### Step 6: Run repository gates

Run format, conventions, and full verification.

## Test plan

- Pure route allowlist tests, including near-miss and unknown `/auth/*` paths.
- Middleware tests for authenticated/public/protected/hydrating/error behavior.
- Account transition tests A-to-null and A-to-B covering every reset action,
  route behavior, and reset-before-load ordering.
- Store/coordinator tests for local-scope signout success/failure, flag cleanup,
  and exactly one replacement for explicit signout versus cross-tab/expiry.
- Browser regression for the original Settings-remains-visible bug.

## Done criteria

- [ ] Settings cannot remain rendered after successful logout.
- [ ] Cross-tab/expiry A-to-null also leaves protected UI.
- [ ] All account-owned stores reset on A-to-null and A-to-B.
- [ ] Unknown `/auth/*` routes and Discogs callback are protected.
- [ ] Explicit logout uses local scope and returns a truthful boolean.
- [ ] Focused tests, E2E, and `npm run verify` pass.
- [ ] Only in-scope files are changed.

## STOP conditions

Stop if Plans 025–027 are not DONE or their reset contracts differ, if route
replacement causes an authentication loop in the E2E fixture, or if covering
cross-tab logout requires cookie/local-storage inspection rather than the public
reactive auth state.

## Maintenance notes

`authRoutes.ts` becomes the single policy for middleware and reactive auth
handling. Any new public auth page must be added deliberately with tests; never
restore a blanket `/auth/*` exemption.
