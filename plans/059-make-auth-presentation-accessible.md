# Plan 059: Make authentication presentation accessible

> **Executor instructions**: Meet measured contrast and semantic requirements,
> reserve password-control space, add route titles, prevent the anonymous dark
> theme from flashing light before mount, verify every auth state in Chrome,
> and commit conventionally.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 057, 058
- **Category**: accessibility / visual system / first paint
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: DONE

## Why this matters

Measured live styles fail normal-text contrast in several central auth states.
The dark primary button uses 14px/500 white text at approximately 3.12:1; dark
destructive validation text is approximately 4.03:1; and light muted auth text
ranges from approximately 3.25:1 to 3.74:1. These values are below the 4.5:1
normal-text requirement and affect primary actions, validation, subtitles,
context copy, and micro-labels.

The signup password input does not programmatically reference its visible
requirements. The input has 12px right padding while the app's absolute
visibility control overlays 44px, allowing long values and password-manager UI
to collide. All audited auth routes also leave `document.title` empty.

Finally, hard navigation in dark mode displayed a blank light frame before the
client mounted. The app is intentionally `ssr: false`; root tokens default to
light and the saved anonymous theme is applied only after `useUserStore`
initializes. The fix must preserve the existing rule that anonymous preference
and authenticated profile preference are separate owners.

## Scope

Modify:

- `app/assets/css/main.css`
- `app/components/auth/ShellAuth.vue`
- `app/components/auth/ChecklistAuthPassword.vue`
- `app/components/shared/InputPassword.vue`
- auth-page form wrappers/components outside generated `app/components/ui`, if
  needed for application-specific `aria-describedby` behavior
- `app/pages/login.vue`
- `app/pages/signup.vue`
- `app/pages/reset-password.vue`
- `app/pages/update-password.vue`
- `app/pages/auth/check-inbox.vue`
- `app/pages/auth/confirm.vue`
- `app/pages/auth/finalising.vue`
- `app/utils/setTheme.ts` and `nuxt.config.ts` only for the pre-paint theme boot
- focused component/Nuxt/browser tests and auth Chrome QA documentation

Do not convert the application to SSR, leak authenticated profile theme into
anonymous storage, remove the product-specific workbench styling, or put
application behavior into generated `app/components/ui` primitives.

## Drift check

```bash
git status --short
rg -n "--primary|--primary-foreground|--muted-foreground|--destructive|workbench-inset" app/assets/css/main.css
rg -n "aria-describedby|Password requirements|Show password|pr-" app/components/auth app/components/shared/InputPassword.vue app/pages/{signup,update-password}.vue
rg -n "useHead|title:" app/pages/{login,signup,reset-password,update-password}.vue app/pages/auth nuxt.config.ts
rg -n "anonymous-theme|setTheme|classList.*light|classList.*dark|ssr:" app nuxt.config.ts
```

STOP if Plans 057 or 058 are incomplete, if a newer token pass already proves
the required contrast on these exact surfaces, or if first-paint correction
would require storing an authenticated account theme in anonymous browser state.

## Required implementation

1. Correct contrast using semantic, measured colors.
   - Measure the final composited foreground/background pairs in both themes,
     not isolated token lightness.
   - Normal text below the large-text threshold must reach at least 4.5:1;
     large text and meaningful non-text boundaries/icons must reach 3:1.
   - Correct dark primary-button foreground/background, dark destructive form
     feedback, and light muted text on card/workbench-inset surfaces.
   - Prefer the smallest coherent semantic-token adjustment. If global token
     changes would damage the authenticated workbench, introduce narrowly named
     auth/public semantic tokens rather than one-off literal classes.
   - Verify hover, focus, disabled, pending, positive, and error states, not only
     the resting login page.

2. Associate password requirements with the field.
   - Give the requirements help stable IDs and include them in the password
     input's `aria-describedby` alongside any active validation message.
   - Preserve the current accessible label and visual checklist.
   - Avoid an `aria-live` implementation that announces the entire checklist on
     every keystroke; announce concise state changes or leave the static
     requirements discoverable through the description relationship.
   - Apply the same contract to signup and active update-password forms.

3. Reserve space for password controls.
   - The input's right padding must exceed the app visibility button's measured
     overlay plus a readable gap.
   - Keep the visibility button at least its current 44px target, preserve its
     changing accessible name, and retain keyboard focus styling.
   - Verify 64-character values in hidden and revealed states with and without
     a password-manager control present. Do not add extension-specific markup.

4. Add descriptive document titles for every auth state.
   - Login, signup, reset request, update password, check inbox, verification,
     and finalising routes receive stable `· Crate Guide` titles.
   - Dynamic pages update the title when their user-visible state changes, such
     as reset request -> check inbox and verification purpose/failure.
   - Titles must not include email addresses, provider errors, tokens, or return
     destinations.

5. Apply the anonymous theme before first paint.
   - Add the smallest CSP-compatible pre-paint bootstrap that validates the
     saved anonymous theme value, resolves `auto` against system preference, and
     applies exactly one `light`/`dark` class before the main stylesheet paints.
   - Share constants/parsing semantics with `setTheme.ts` or add a test that
     prevents the bootstrap and runtime parser from drifting.
   - Preserve runtime system-theme listening for `auto` and profile-owned theme
     switching after authentication.
   - Do not mirror profile theme into the anonymous key to hide a transition.

6. Add automated and Chrome regression coverage.
   - Assert every route title and password-description relationship.
   - Add a deterministic contrast check for the exact semantic token/surface
     pairs used by auth pages.
   - Add a hard-load browser assertion that the saved anonymous dark preference
     is applied before the first meaningful auth paint.
   - Verify default desktop plus 390x844 and 375x667, light/dark/auto,
     `prefers-reduced-motion`, keyboard order, focus rings, and no horizontal
     overflow.

## Test plan

```bash
npm run format
npx vitest run --project nuxt \
  test/nuxt/auth-forms.nuxt.test.ts \
  test/nuxt/auth-recovery.nuxt.test.ts \
  test/nuxt/auth-confirm-page.nuxt.test.ts \
  test/nuxt/auth-finalising.nuxt.test.ts \
  test/nuxt/layout-auth-shell.nuxt.test.ts
npx vitest run --project browser
npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts
npm run check:conventions
npm run verify
git diff --check
```

Record final Chrome evidence for login, signup, reset success, expired recovery,
expired confirmation, and OAuth callback failure in both themes. Contrast
evidence must list the actual computed pair and ratio; visual inspection alone
is not sufficient.

## Done criteria

- [x] Every audited auth text/control pair meets its applicable contrast floor.
- [x] Password requirements are programmatically associated without live-region noise.
- [x] Password text never renders beneath the app visibility control.
- [x] Every auth route/state has a safe, descriptive document title.
- [x] Saved anonymous dark/auto preference is applied before meaningful paint.
- [x] Anonymous and authenticated theme ownership remain separate.
- [x] Responsive, keyboard, browser, and repository gates pass.

## STOP conditions

Stop if contrast remediation requires unreviewed global workbench redesign, if
password association requires application logic inside generated UI, if an
inline theme bootstrap violates the deployed CSP or duplicates a drifting
theme parser, or if eliminating the flash would require persisting profile
theme in the anonymous preference key.

## Git workflow

- Branch: `codex/059-auth-presentation-accessible`
- Commit: `fix(auth): make authentication presentation accessible`
