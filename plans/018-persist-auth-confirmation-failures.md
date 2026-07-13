# Plan 018: Keep email-confirmation failures visible and actionable

> **Executor instructions**: Implement the explicit result contract below;
> do not redesign authentication. Run every gate and stop on scope expansion.
> Update `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 0f62eb3..HEAD -- \
>   app/pages/auth/confirm.vue \
>   app/stores/userStore.ts \
>   app/stores/__tests__/userStore.test.ts \
>   test/nuxt/auth-confirm-page.nuxt.test.ts
> ```

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0f62eb3`, 2026-07-12

## Why this matters

When Supabase rejects a well-formed confirmation link, the store catches the
error and the page clears its spinner without setting `verifyError`. The page
then becomes blank after a transient toast. Confirmation failure must remain on
screen with a clear route back to authentication.

## Current state

- `app/pages/auth/confirm.vue:14-29` correctly handles missing and unknown query
  parameters locally.
- `app/pages/auth/confirm.vue:32-40` awaits `user.verifyOtp`, clears
  `verifyingOtp`, and has no non-loading success/failure branch.
- `app/stores/userStore.ts:161-169` catches verification errors, shows a toast,
  and resolves `undefined`; success navigates to `/`.
- `app/stores/__tests__/userStore.test.ts:486-509` checks navigation but not a
  truthful return value.
- Store methods such as `sendPasswordResetEmail` already use
  `Promise<boolean>` results; match that convention.

## Commands you will need

| Purpose           | Command                                                                  | Expected on success |
| ----------------- | ------------------------------------------------------------------------ | ------------------- |
| Store test        | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts` | exit 0              |
| Page test         | `npx vitest run --project nuxt test/nuxt/auth-confirm-page.nuxt.test.ts` | exit 0              |
| Format            | `npm run format`                                                         | exit 0              |
| Conventions       | `npm run check:conventions`                                              | exit 0              |
| Full verification | `npm run verify`                                                         | exit 0              |

## Scope

**In scope**:

- `app/pages/auth/confirm.vue`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `test/nuxt/auth-confirm-page.nuxt.test.ts` (create)
- `plans/README.md` (status only)

**Out of scope**:

- Supabase auth configuration, callback URLs, middleware, login/signup pages,
  OAuth-provider finalisation, or password-reset flows.
- Returning raw Supabase error details in persistent page copy.
- Removing the existing error toast unless tests prove duplicate feedback is
  materially disruptive.

## Git workflow

- Branch: `codex/018-auth-confirm-errors`.
- Suggested commit: `fix(auth): show persistent confirmation failures`.
- Do not push or open a PR unless instructed.

## Target contract

Change `verifyOtp(tokenHash, type)` to `Promise<boolean>`:

- return `true` after successful verification and navigation;
- return `false` after the existing catch/toast path;
- never throw ordinary Supabase verification errors to the page.

The page owns persistent presentation, while the store owns the auth call,
navigation, and toast.

## Steps

### Step 1: Make `verifyOtp` truthful

Add the explicit boolean return type and results described above. Preserve the
Supabase invocation, success navigation, and existing toasts.

**Verify**: update the two existing store tests to assert `true` and `false` in
addition to navigation behavior.

### Step 2: Render a stable page state

Capture the returned boolean in `confirm.vue`. On `false`, set user-facing copy
that does not expose provider internals:

- title/message: `This confirmation link is invalid or has expired.`
- guidance: `Return to login and request a new link if needed.`
- action: a `NuxtLink` button to `/login` labelled `Back to login`.

Use `StateLoading` or the existing spinner pattern while verification is in
progress and `NoticeError` for the persistent failure. Reuse the same
persistent presentation for missing/unknown query parameters, while keeping
their diagnostic strings internal only if useful for tests/logging.

**Verify**: the template has a complete loading and error state; there is no
reachable blank branch after `onMounted` settles.

### Step 3: Add rendered page tests

Create `test/nuxt/auth-confirm-page.nuxt.test.ts` with mocked `useRoute` and
`useUserStore`. Cover missing parameters, unknown type, store result `false`,
and a pending verification promise. For failure states assert persistent copy
and the `/login` link. For a successful result, assert no failure notice; the
store test remains responsible for navigation.

**Verify**: focused Nuxt test exits 0.

### Step 4: Run all gates

Run format, conventions, and full verification.

## Test plan

- Extend `userStore.test.ts` with boolean outcome assertions for OTP success and
  failure.
- Create `auth-confirm-page.nuxt.test.ts` for missing parameters, unknown type,
  provider rejection, pending verification, and successful settlement.
- Assert recovery copy and link semantics, not full snapshots.
- Verification: both focused commands and the full suite pass.

## Done criteria

- [ ] `verifyOtp` returns truthful booleans.
- [ ] Every confirmation failure leaves persistent, actionable UI.
- [ ] No raw Supabase error is rendered.
- [ ] Store and rendered page tests pass.
- [ ] Full verification passes with only declared files changed.

## STOP conditions

Stop if success navigation is actually owned by another callback after source
drift, or if the fix requires changing Supabase configuration or middleware.

## Maintenance notes

Future confirmation types should reuse this page-level error presentation.
Keep technical details in logs/toasts and stable recovery guidance on the page.
