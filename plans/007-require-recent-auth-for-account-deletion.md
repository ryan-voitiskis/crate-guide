# Plan 007: Require server-verified recent authentication before account deletion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/functions/delete-account app/stores/userStore.ts app/stores/__tests__/userStore.test.ts app/components/settings/DialogDeleteAccount.vue test/nuxt/library-mutation-dialogs.nuxt.test.ts app/pages/settings.vue app/pages/login.vue app/pages/auth/finalising.vue`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `bdf0e9a` (integrated as `fa25b88`), with SDK
  follow-up `4c88b61` (integrated as `7b78f2c`), 2026-07-19

## Why this matters

Account deletion currently accepts any valid long-lived session plus a typed
email address. A stolen unlocked session can therefore delete the account and
all active data without proving the user authenticated recently. The Edge
Function must make the final decision from cryptographically verified
authentication-method timestamps; the UI should guide stale sessions through a
fresh sign-in and return them to Settings.

## Current state

- `delete-account/handler.ts:136-178` validates the bearer session and compares
  a request `confirmation` string with `user.email`; it then creates the admin
  client and begins irreversible cover deletion at line 180.
- `DialogDeleteAccount.vue:10-30` enables deletion when the typed email matches
  and calls `user.deleteAccount(confirmationInput)`.
- `userStore.ts:246-273` calls `auth.getUser()` immediately before invoking the
  Edge Function, but that proves only current validity, not recent interaction.
- The app supports password, Google, and GitHub sign-in
  (`userStore.ts:156-193`) and already sanitizes login return paths.
- Installed Supabase Auth types define required JWT `iat`, `session_id`, and
  optional AMR entries; object-form AMR entries can include method timestamps.
  `auth.reauthenticate()` only sends an OTP intended as a nonce for password
  updates; do not treat sending that OTP as proof of reauthentication.
- Existing delete tests assert incorrect email never creates the admin client
  and cover cleanup occurs before auth deletion. Preserve that ordering after
  the new recent-auth gate.

## Characterization status

The local password flow produced an object-form `password` AMR timestamp:
refresh preserved the interactive timestamp, while a new password sign-in
advanced it. On 2026-07-19 the user authorized a sanitized hosted-provider
characterization. A fresh production GitHub sign-in produced one object-form
`oauth` AMR entry with a finite integer timestamp. No token, raw claim, email,
user ID, cookie, or browser storage was read or logged. Production Google sign-in
reported that the provider is not enabled, so it remains explicitly unsupported
in the deployed configuration rather than receiving a weaker fallback. The gate
therefore accepts only the evidence-backed interactive methods `password` and
`oauth`, ignores `token_refresh`, and still fails closed for missing, malformed,
or unrecognized AMR entries.

## Commands you will need

| Purpose              | Command                                                                         | Expected on success |
| -------------------- | ------------------------------------------------------------------------------- | ------------------- |
| Delete handler tests | `cd supabase && deno test functions/delete-account/handler.test.ts`             | all pass            |
| Store tests          | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts`        | all pass            |
| Dialog tests         | `npx vitest run --project nuxt test/nuxt/library-mutation-dialogs.nuxt.test.ts` | all pass            |
| Edge gates           | `npm run check:edge && npm run lint:edge && npm run test:edge`                  | exit 0              |
| Full gate            | `npm run verify`                                                                | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `supabase/functions/delete-account/handler.ts`
- `supabase/functions/delete-account/handler.test.ts`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `app/components/settings/DialogDeleteAccount.vue`
- `test/nuxt/library-mutation-dialogs.nuxt.test.ts`
- `app/pages/settings.vue` only for the reauthentication return flag
- `app/pages/login.vue` and `app/pages/auth/finalising.vue` only if the existing
  sanitized return path cannot already return to Settings
- `plans/README.md` status row

**Out of scope**:

- Adding MFA enrollment, a custom password store, or an application-owned auth
  token
- Accepting a client timestamp, email match, raw JWT `iat`, or localStorage flag
  as recent-auth proof
- Changing account cleanup ordering or partial-failure semantics
- Changing Supabase hosted provider configuration
- Logging access tokens, AMR contents, emails, or authentication proof

## Git workflow

- Branch: `codex/007-account-delete-reauth`
- Use focused Conventional Commits, for example
  `fix(auth): require recent login for account deletion`.
- Do not deploy, push, or open a PR unless instructed.

## Steps

### Step 1: Characterize verified AMR timestamps before choosing the gate

Using the local Supabase stack and synthetic accounts, obtain fresh password,
Google, and GitHub sessions where locally configured. Decode tokens only in an
ephemeral local script; print only AMR method names, whether timestamps exist,
and age in seconds—never tokens, emails, IDs, or raw claims. Refresh each session
and confirm refresh does not reset the interactive AMR timestamp. Sign in again
and confirm it does reset it.

The required invariant is: every supported sign-in method yields at least one
object-form, server-signed AMR entry whose timestamp identifies the last
interactive authentication and survives token refresh. Do not use JWT `iat`,
because refresh creates a new token without user interaction.

**Verify**: add a sanitized characterization note to the PR description showing
`password`, `google`, and `github` as supported or unsupported, with timestamp
presence/refresh behavior only.

### Step 2: Add a pure recent-auth decision helper to the handler

In `handler.ts`, add an injectable `verifyClaims(authHeader)` dependency that
uses Supabase `auth.getClaims()` (or the equivalent installed SDK API) to verify
the bearer token cryptographically. Add a pure helper that:

- requires object-form AMR entries;
- accepts only the characterized interactive methods;
- selects the newest finite integer timestamp;
- rejects timestamps more than 30 seconds in the future;
- requires age <= 300 seconds;
- never falls back to token `iat`, a string-only AMR entry, user metadata, or a
  client value.

Return controlled 403 JSON when stale/missing:

```json
{
	"error": "Sign in again before deleting your account.",
	"code": "recent_authentication_required"
}
```

Run this gate after bearer/user validation and email confirmation but before
`createAdmin()`. Preserve the existing 401, 400, cleanup, deletion, and partial
success responses.

**Verify**: focused Deno tests cover fresh, exactly-300-second, stale,
future-dated, missing, string-only, malformed, and wrong-user claim cases; every
rejection asserts `createAdmin` was not called.

### Step 3: Make the store distinguish stale authentication

Change `deleteAccount` to return a discriminated result instead of a boolean,
for example:

```ts
type DeleteAccountResult =
	| { status: 'deleted'; coverCleanupComplete: boolean }
	| { status: 'recent-auth-required' }
	| { status: 'failed' }
```

Parse only the controlled error code from the cloned Function response. Keep
safe fallback messages, single-flight protection, local sign-out cleanup, and
truthful partial-success toasts. Do not decide recency in the store.

**Verify**: store tests cover all three results and confirm a 403 stale-auth
response does not clear the local user or show a generic deletion failure.

### Step 4: Add a secure sign-out/sign-in return flow

In `DialogDeleteAccount.vue`, keep typed-email confirmation. When the function
returns `recent-auth-required`, replace the destructive confirmation form with
an explanation and a `Sign in again` action. That action must:

1. store no proof or credential;
2. locally sign out;
3. navigate to `/login?redirect=%2Fsettings%3Faction%3Ddelete-account` through
   the existing sanitized return-path mechanism;
4. let the user choose password, Google, or GitHub normally;
5. return to Settings and reopen the dialog from the `action` query;
6. remove the action query with router replacement after opening so refreshes
   do not repeatedly reopen it.

Do not preserve the typed email across sign-out. The user must type it again
after the fresh login. Use existing Tailwind-only components and keep destructive
copy explicit.

**Verify**: Nuxt tests prove stale auth shows the re-login state, the generated
redirect is exactly the sanitized Settings action URL, the reopened dialog has
an empty confirmation field, and a fresh-auth success follows the original
cleanup flow.

### Step 5: Run the full security regression suite

**Verify**: `npm run format && npm run check:conventions && npm run check:edge && npm run lint:edge && npm run test:edge && npx vitest run --project stores app/stores/__tests__/userStore.test.ts && npx vitest run --project nuxt test/nuxt/library-mutation-dialogs.nuxt.test.ts && npm run verify`
-> exit 0.

## Test plan

- Handler tests: fresh boundary, stale, future, absent/malformed/string-only AMR,
  verified-user mismatch, wrong email, and proof checked before admin creation.
- Store tests: controlled 403 mapping, generic failure, success, cleanup warning,
  and single-flight behavior.
- Nuxt tests: stale UI, sanitized redirect, query-driven reopen, empty form, and
  cancel path.
- Manual local smoke: sign in, wait/manipulate a synthetic stale token, observe
  rejection, sign out/in, then delete a disposable test account. Never use a
  production account.

## Done criteria

- [ ] The Edge Function, not the browser, enforces a 5-minute interactive-auth
      window from verified AMR timestamps.
- [ ] Refreshing a session cannot make an old login recent.
- [ ] No cleanup/admin object is created before email and recency gates pass.
- [ ] Password, Google, and GitHub are either proved supported or explicitly
      blocked by a STOP report; none silently falls back to weak proof.
- [ ] Reauthentication stores no password/proof and returns through a sanitized
      route.
- [ ] All focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Any supported provider lacks a stable, timestamped interactive AMR entry, or a
  token refresh resets that timestamp.
- The installed SDK cannot cryptographically verify claims in the Edge runtime.
- Supporting a provider requires a custom password/OTP verifier or hosted auth
  configuration change.
- The existing login return-path sanitizer rejects the Settings action URL and
  fixing it requires broad auth routing changes.
- Any test would need a real account or logs sensitive claim values.
- A verification command fails twice after an in-scope fix.

## Maintenance notes

- After Plan 009 pinned Supabase JS 2.110.7, the implementation replaced the
  temporary `getUser(token)` plus manual payload-decoding compatibility path
  with the SDK's verified `auth.getClaims(token)` API. The initial user lookup,
  subject comparison, AMR allowlist, timestamp bounds, and public error contract
  remain independently tested.
- Keep the maximum age and accepted method list centralized and tested at exact
  boundaries.
- Review Supabase AMR semantics whenever auth providers or SDK versions change.
- A future MFA feature may add methods, but must not weaken the interactive
  timestamp invariant.
