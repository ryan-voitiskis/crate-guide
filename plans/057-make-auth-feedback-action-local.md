# Plan 057: Make authentication feedback action-local

> **Executor instructions**: Give each authentication action one persistent,
> local feedback surface. Remove duplicate auth toasts, preserve entered values,
> clear stale failures deliberately, add focus recovery for invalid submission,
> and commit conventionally.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: authentication / UI state / accessibility
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: DONE

## Why this matters

The live login failure is displayed in a persistent assertive panel while
`failAuthOperation()` also emits the same string through `toast.error()`. A
single global `authOperationError` represents email login, signup, reset,
password update, GitHub, Google, and verification failures, so the page cannot
place feedback beside the action that failed. The current top-of-card panel
separates email errors from the submit button and would misattribute OAuth
errors if it were moved below that button without first splitting ownership.

Chrome also verified that editing a password after a rejected login leaves the
old failure visible, and submitting empty login/signup forms leaves focus on
`BODY`. Both fields render the generic message `Required` instead of the
schema's field-specific required copy. Separately, `userAlreadyRegistered` is
set once and has no consume/reset lifecycle, so its login notice can recur
during later visits in the same SPA session.

## Scope

Modify:

- `app/stores/userStore.ts`
- `app/pages/login.vue`
- `app/pages/signup.vue`
- `app/pages/reset-password.vue`
- `app/pages/update-password.vue`
- `app/components/auth/PanelAuthStatus.vue` only if focus/announcement support
  cannot remain page-local
- `app/utils/authValidation.ts`
- focused store, Nuxt, and login E2E tests

Application-specific form behavior must remain outside generated
`app/components/ui`. Do not change Supabase provider configuration, OAuth
callback protocol, safe-return-path rules, password composition requirements,
or expose raw provider/server error details.

## Drift check

```bash
git status --short
rg -n "authOperationError|failAuthOperation|userAlreadyRegistered|toast\.(error|success)" app/stores/userStore.ts app/pages test
rg -n "PanelAuthStatus|handleSubmit|FormMessage|Required" app/pages/{login,signup,reset-password,update-password}.vue app/utils/authValidation.ts test/nuxt
```

STOP if another branch has already introduced typed per-action auth feedback,
if page-rendered auth failures no longer toast, or if form focus is now managed
by a shared wrapper that this plan would bypass.

## Required implementation

1. Replace the unscoped presentation state with typed action-local feedback.
   - Represent at least email login, email signup, reset-email delivery,
     password update, GitHub startup, and Google startup distinctly.
   - Keep safe generic user-facing messages; do not surface provider exception
     text or distinguish unknown accounts from bad passwords.
   - Give pages an explicit way to clear or consume only the relevant feedback.
   - Keep entered credentials on failure and never retain a password outside
     the existing form state.

2. Establish one feedback owner per outcome.
   - If a page renders a persistent panel for an auth result, the store must not
     emit a second toast for that same result.
   - Email failures render immediately after the corresponding submit button.
   - Provider-start failures render immediately after the provider button row
     and identify GitHub or Google without exposing provider details.
   - Apply the same local-placement rule to signup, reset-email delivery, and
     password update forms.
   - Redirect-only success feedback may remain transient only when no
     destination surface communicates the same outcome. Document and test the
     ownership decision instead of leaving mixed page/toast behavior.

3. Clear stale feedback at the right boundary.
   - Clear an email/password failure when the user changes a credential for
     that action or starts a new attempt.
   - Do not clear a provider failure because an unrelated field rerendered.
   - Reset all auth feedback when leaving/remounting the relevant signed-out
     page so one route cannot inherit another route's failure.

4. Recover focus after client-side validation failure.
   - On login, signup, reset-email, and update-password forms, focus the first
     invalid enabled field in document order after a rejected submit.
   - Preserve visible focus treatment and do not scroll the page unexpectedly
     when the field is already visible.
   - Server-side credential failures remain assertive live-region messages;
     focus should stay usable for immediate correction.

5. Make required validation copy deterministic.
   - Ensure missing/undefined and empty-string values both produce the intended
     field-specific messages from `authValidation.ts`/page schemas.
   - Retain the existing invalid email, length, and composition messages.
   - Test the rendered text, not only the presence of a destructive class.

6. Make the existing-account notice one-shot.
   - Add an explicit consume/reset lifecycle or an equivalent route-scoped
     signal for the signup-to-login transition.
   - The notice appears after an already-registered signup attempt, survives
     the immediate navigation to login, and disappears after acknowledgement,
     a new auth attempt, or a later unrelated login visit.
   - Do not encode an email address or provider error in the URL.

## Test plan

```bash
npm run format
npx vitest run --project stores app/stores/__tests__/userStore.test.ts
npx vitest run --project nuxt test/nuxt/auth-forms.nuxt.test.ts
npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts
npm run check:conventions
npm run verify
git diff --check
```

Required cases:

- email and OAuth failures render in different local regions;
- no page-rendered auth failure also calls `toast.error`;
- editing credentials clears only the matching stale error;
- empty login/signup/reset submissions focus the first invalid field and show
  exact field-specific required copy;
- credentials remain populated after server failure;
- the existing-account notice is visible once and then consumed;
- mobile error placement remains visible or scrollable at 375x667.

## Done criteria

- [x] Every auth failure is attributed to the action that produced it.
- [x] Page-rendered auth outcomes are not duplicated by toasts.
- [x] Stale errors clear when the user meaningfully corrects or retries.
- [x] Invalid submit focuses the first invalid field with exact validation copy.
- [x] The existing-account notice has a bounded one-shot lifecycle.
- [x] Focused auth tests, Chrome smoke, and repository gates pass.

## STOP conditions

Stop if action-local errors require exposing raw Supabase/provider messages, if
focus management requires editing generated UI primitives with
application-specific behavior, if clearing feedback would erase entered
credentials, or if provider and credential failures cannot remain separately
attributable without redesigning the OAuth callback contract.

## Git workflow

- Branch: `codex/057-auth-feedback-action-local`
- Commit: `fix(auth): make authentication feedback action-local`
