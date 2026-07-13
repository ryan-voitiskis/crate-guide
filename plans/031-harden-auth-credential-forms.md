# Plan 031: Align credential forms with password policy and browser semantics

> **Executor instructions**: Run this after recovery and routing plans because
> it touches their pages. Keep the work to validation, sensitive-form lifecycle,
> and input semantics. Do not redesign auth presentation.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat d246d78..HEAD -- \
>   app/utils/authValidation.ts \
>   app/utils/authValidation.test.ts \
>   app/components/shared/InputPassword.vue \
>   app/pages/login.vue \
>   app/pages/signup.vue \
>   app/pages/reset-password.vue \
>   app/pages/update-password.vue \
>   app/stores/__tests__/userStore.test.ts \
>   test/nuxt/auth-forms.nuxt.test.ts \
>   test/nuxt/auth-recovery.nuxt.test.ts \
>   test/e2e/login-redirect.e2e.test.ts
> ```

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/029-gate-password-recovery-flow.md, plans/030-make-auth-routing-and-callbacks-deterministic.md
- **Category**: bug
- **Planned at**: commit `d246d78`, 2026-07-13

## Why this matters

Signup and update-password validation accepts passwords the repository's
Supabase configuration rejects, while email/password fields omit standard type
and autocomplete hints. Signup and update-password also inherit global page
keepalive, allowing sensitive form state to remain cached. Aligning one shared
creation schema and explicit browser semantics prevents false client success,
improves password-manager behavior, and removes credential retention.

## Current state

- `supabase/config.toml:103-107` requires at least eight characters containing
  lowercase, uppercase, and digits.
- `app/pages/signup.vue:11-17` and `app/pages/update-password.vue:9-14` enforce
  only length.
- `app/pages/login.vue:17-20` has a separate login schema; login must not adopt
  new-password composition rules because existing credentials may differ.
- `app/pages/login.vue:90`, `signup.vue:75`, and `reset-password.vue:42` render
  email fields without `type="email"` or `autocomplete="email"`.
- `app/components/shared/InputPassword.vue:5-18` accepts only value/class/name
  props, so pages cannot declare `current-password` or `new-password`.
- `nuxt.config.ts:51-53` enables global keepalive. Login/reset explicitly opt
  out; signup and update-password do not.
- Existing store/E2E fixtures use `password123`, which violates the configured
  uppercase requirement while mocks report success.

## Commands you will need

| Purpose             | Command                                                                                                | Expected on success |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| Validation tests    | `npx vitest run --project unit app/utils/authValidation.test.ts`                                       | exit 0              |
| Rendered form tests | `npx vitest run --project nuxt test/nuxt/auth-forms.nuxt.test.ts test/nuxt/auth-recovery.nuxt.test.ts` | exit 0              |
| Browser E2E         | `npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts`                                     | exit 0              |
| Store tests         | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts`                               | exit 0              |
| Format              | `npm run format`                                                                                       | exit 0              |
| Conventions         | `npm run check:conventions`                                                                            | exit 0              |
| Full verification   | `npm run verify`                                                                                       | exit 0              |

## Scope

**In scope**:

- `app/utils/authValidation.ts` (create)
- `app/utils/authValidation.test.ts` (create)
- `app/components/shared/InputPassword.vue`
- `app/pages/login.vue`
- `app/pages/signup.vue`
- `app/pages/reset-password.vue`
- `app/pages/update-password.vue`
- `app/stores/__tests__/userStore.test.ts`
- `test/nuxt/auth-forms.nuxt.test.ts` (create)
- `test/nuxt/auth-recovery.nuxt.test.ts`
- `test/e2e/login-redirect.e2e.test.ts`

**Out of scope**:

- Changing `supabase/config.toml`, hosted password requirements, leaked-password
  settings, login routing, recovery authorization, OAuth, or auth-shell visuals.
- Adding symbol requirements; local config requires lower/upper/digits only.
- Applying creation-strength validation to the login password field.
- Editing generated `app/components/ui` primitives.

## Git workflow

- Branch/isolated worktree label: `codex/031-auth-form-semantics`.
- Commit once with `fix(auth): align credential form contracts`.
- Do not push, merge, or open a PR.

## Target contract

- One shared `emailSchema` and one shared `newPasswordSchema` encode the repo's
  current email/length/lowercase/uppercase/digit contract with stable messages.
- Signup and password recovery use `newPasswordSchema`; login validates only a
  nonempty/max-length submitted credential and lets Supabase authenticate it.
- Email inputs use `type="email"`, `autocomplete="email"`, and appropriate
  input mode/capitalization defaults. Password inputs explicitly use
  `current-password` for login and `new-password` for creation/recovery.
- `InputPassword` forwards valid input attributes without broad `any` typing.
- Signup and update-password set `definePageMeta({ keepalive: false })`; forms
  clear credentials only after truthful success.

## Steps

### Step 1: Centralize and test validation contracts

Create the utility with named Zod schemas. Add table-driven tests for minimum,
maximum, lowercase, uppercase, digit, and valid examples. Keep messages suitable
for direct `FormMessage` display.

**Verify**: unit tests exit 0.

### Step 2: Apply schemas without tightening login compatibility

Use shared email validation on all email forms and shared new-password
validation only on signup/update-password. Replace mocked successful test
credentials with a compliant synthetic value such as `Password123`, including
the existing rendered recovery submissions affected by the new schema.

**Verify**: store tests pass and no successful signup/reset fixture uses a value
that local Supabase would reject.

### Step 3: Add explicit browser field semantics

Extend `InputPassword`'s typed props/attribute forwarding and set email/password
attributes at each call site. Preserve the show/hide button behavior and ensure
it remains `type="button"`/non-submitting.

**Verify**: rendered tests assert actual input `type`, `name`, and
`autocomplete` attributes for login, signup, reset, and update pages.

### Step 4: Disable sensitive page caching and clear only on success

Add `keepalive: false` to signup/update-password. Preserve failed signup/reset
input. Use Plan 029's boolean password-update result to reset only after success.

**Verify**: rendered tests submit failing mocks and assert values remain; remount
signup/update pages and assert prior credentials are absent.

### Step 5: Update the browser fixture and run gates

Use a policy-compliant synthetic password in E2E, then run format,
conventions, focused tests, and full verification.

## Test plan

- Pure schema matrix for every configured password requirement.
- Rendered attribute assertions for four auth pages.
- Failed-submit retention and remount/non-cache tests for sensitive forms.
- Existing login redirect E2E with a compliant synthetic password.

## Done criteria

- [ ] Signup/recovery client rules match local Supabase config exactly.
- [ ] Login remains compatible with existing submitted credentials.
- [ ] Every email/password input has correct type/autocomplete semantics.
- [ ] Signup/update pages cannot retain credential state through keepalive.
- [ ] Failed submissions preserve input; successful flows clear/navigate.
- [ ] Focused tests, E2E, and `npm run verify` pass.
- [ ] Only in-scope files are changed.

## STOP conditions

Stop if the hosted password policy is proven to differ from committed
`supabase/config.toml`, if `InputPassword` requires editing generated UI
primitives, or if the recovery plan does not expose a truthful boolean update
result.

## Maintenance notes

When password policy changes, update `supabase/config.toml`, the shared schema,
and its table tests in one change. Password-manager attributes are behavior,
not decorative markup; keep rendered coverage.
