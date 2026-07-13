# Plan 032: Align Supabase redirect allowlists with auth callback destinations

> **Executor instructions**: This is a repository configuration/documentation
> plan. Do not push config to a hosted Supabase project or mutate dashboard
> settings. Keep wildcard hosts forbidden; only the two fixed local origins may
> use a path glob.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat ed7948b..HEAD -- \
>   supabase/config.toml \
>   README.md
> ```

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/030-make-auth-routing-and-callbacks-deterministic.md
- **Category**: bug
- **Planned at**: commit `ed7948b`, 2026-07-13

## Why this matters

The app now supplies `/auth/finalising?redirect=...` for provider sign-in and
`/update-password` for recovery email. Supabase accepts a `redirectTo` only when
it matches the Auth Redirect URLs configuration; otherwise the requested path
can be ignored in favor of the Site URL. The committed local configuration
currently allows only exact `http://localhost:3000`, so it does not describe the
callback paths the application actually emits.

## Current state

- `supabase/config.toml:86-89` uses Site URL `http://127.0.0.1:3000` and only one
  exact additional redirect, `http://localhost:3000`.
- `app/stores/userStore.ts` emits both a dynamic-query finalising callback and a
  fixed password-update callback.
- Supabase's Redirect URLs documentation recommends `http://localhost:3000/**`
  for local development and exact paths/narrow patterns in production.
- The linked hosted Crate Guide project is not available through the active CLI
  profile in this worktree, so its current Auth config cannot be verified or
  changed safely in this plan.

## Commands you will need

| Purpose                         | Command                          | Expected on success                              |
| ------------------------------- | -------------------------------- | ------------------------------------------------ | -------------------------------------------- | ------------------ |
| Confirm fixed-origin path globs | `rg -n 'additional_redirect_urls | 127\\.0\\.0\\.1:3000/\\_\\_                      | localhost:3000/\\_\\_' supabase/config.toml` | both origins found |
| Confirm no wildcard host        | `rg -n 'https?://\\\*            | https?://\\_\\_' supabase/config.toml README.md` | exit 1 / no matches                          |
| Format                          | `npm run format`                 | exit 0                                           |
| Conventions                     | `npm run check:conventions`      | exit 0                                           |
| Full verification               | `npm run verify`                 | exit 0                                           |

## Scope

**In scope**:

- `supabase/config.toml`
- `README.md`

**Out of scope**:

- `supabase config push`, Management API writes, dashboard changes, provider
  secrets, email-template changes, or production/preview URL guesses.
- Changing callback paths, return-path encoding, recovery state, or application
  auth behavior delivered by Plans 029–031.
- A wildcard hostname or an unrestricted production-origin glob.

## Git workflow

- Branch/isolated worktree label: `codex/032-auth-redirect-allowlist`.
- Commit once with `fix(auth): allow configured callback destinations`.
- Do not push, merge, open a PR, or push Supabase config remotely.

## Target contract

- Local Auth accepts any path under only `http://127.0.0.1:3000` and
  `http://localhost:3000`, covering dynamic finalising queries and the fixed
  recovery landing without allowing another host.
- README explains that every hosted environment must explicitly configure the
  fixed `/update-password` URL and a narrow `/auth/finalising` pattern capable
  of matching its encoded `redirect` query.
- README distinguishes repository/local config from hosted dashboard config and
  warns that `supabase config push` is a remote mutation, not a verification
  command.

## Steps

### Step 1: Correct the local Auth redirect list

Replace the exact root-only entry with fixed-origin `/**` entries for both
loopback spellings used by `site_url`, `.env.example`, README, and browser runs.
Do not add production or preview domains to local config.

**Verify**: the focused `rg` checks find both entries and no wildcard host.

### Step 2: Document hosted deployment requirements

Add a concise Auth Redirect URLs subsection near environment setup. State that
the hosted Supabase URL Configuration must match `${SITE_URL}/update-password`
and `${SITE_URL}/auth/finalising?redirect=**` (or an equivalently narrow pattern
supported by Supabase). Tell deployers to verify the actual hosted values before
relying on OAuth deep-link or recovery behavior.

**Verify**: documentation names both application destinations, dynamic query
reason, and remote-mutation boundary.

### Step 3: Run repository gates

Run formatting, conventions, and full verification. Do not invoke config push.

## Test plan

- Text check finds both fixed local origins with path-only globs.
- Text check finds no wildcard host.
- README contains both callback destinations and separates local versus hosted
  configuration.
- Existing full verification stays green.

## Done criteria

- [ ] Local Auth accepts the callback paths emitted by the application on both
      supported loopback origins.
- [ ] No wildcard host is introduced.
- [ ] Hosted callback requirements and the remote-mutation boundary are clear.
- [ ] Formatting, conventions, and `npm run verify` pass.
- [ ] Only the two in-scope files are changed.

## STOP conditions

Stop if the installed Supabase CLI rejects fixed-origin `/**` syntax, if a
hosted setting must be mutated to validate the local file, or if the actual
production/preview origins cannot be documented parametrically without guessing.

## Maintenance notes

Any future `redirectTo` path added in application code must be added to local
Auth config and every hosted environment's Redirect URLs before release. Prefer
exact production destinations; use a narrow wildcard only where the callback's
encoded return query is intentionally variable.
