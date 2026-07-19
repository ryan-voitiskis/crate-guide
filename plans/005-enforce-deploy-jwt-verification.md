# Plan 005: Prevent production Edge deployments from bypassing JWT verification

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/deno.json package.json scripts/dev-start.mjs scripts/check-conventions.mjs scripts/check-conventions.test.mjs README.md docs/authenticated-workbench-chrome-qa-2026-07-18.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `248b66c` (integrated as `832bbaa`), 2026-07-19

## Why this matters

The tracked `deploy-all` task disables Supabase gateway JWT verification for
every Edge Function. Handlers currently revalidate users themselves, but a
future handler or regression could turn that deployment flag into an auth
bypass. Production deploy commands should use gateway verification, while the
explicitly documented local worker may continue bypassing the gateway for local
development.

## Current state

- `supabase/deno.json:13-19` contains:

  ```json
  "dev": "supabase functions serve --debug",
  "deploy": "supabase functions deploy",
  "deploy-all": "supabase functions deploy --no-verify-jwt"
  ```

- `package.json:44` and `scripts/dev-start.mjs:141` use
  `--no-verify-jwt` only while serving functions locally.
- `README.md:173-179` explicitly says the local bypass does not replace each
  Discogs function's `getUser()` check.
- `docs/authenticated-workbench-chrome-qa-2026-07-18.md:87` says the bypass must
  remain local and must not be copied into deployment configuration.
- `scripts/check-conventions.mjs:98-103` currently checks only discovered `app/`
  files; it does not enforce deployment configuration.
- `scripts/check-conventions.test.mjs:19-33` provides an isolated temporary Git
  repository fixture for convention checks.

## Commands you will need

| Purpose                 | Command                                                          | Expected on success |
| ----------------------- | ---------------------------------------------------------------- | ------------------- |
| Convention tests        | `npm run test:conventions`                                       | all Node tests pass |
| Live convention check   | `npm run check:conventions`                                      | exit 0              |
| Forbidden deploy search | `rg -n "functions deploy.*--no-verify-jwt" --glob '!plans/**' .` | no matches          |
| Full gate               | `npm run verify`                                                 | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `supabase/deno.json`
- `scripts/check-conventions.mjs`
- `scripts/check-conventions.test.mjs`
- `plans/README.md` status row

**Read only; preserve exactly**:

- `package.json` local `supa:functions` script
- `scripts/dev-start.mjs` local serve command
- `README.md` local-development explanation
- `docs/authenticated-workbench-chrome-qa-2026-07-18.md`

**Out of scope**:

- Changing handler-level authentication
- Function-specific public endpoint design
- Deploying any Edge Function or changing hosted Supabase settings
- Removing the local gateway bypass

## Git workflow

- Branch: `codex/005-edge-deploy-jwt`
- Use one Conventional Commit, for example
  `fix(edge): require JWT verification on deploy`.
- Do not deploy, push, or open a pull request unless instructed.

## Steps

### Step 1: Remove the production bypass

Change `supabase/deno.json` so both `deploy` and `deploy-all` run
`supabase functions deploy` without `--no-verify-jwt`. Keeping both aliases is
acceptable; do not add function-level bypasses.

**Verify**: `node -e "const c=require('./supabase/deno.json'); for (const [k,v] of Object.entries(c.tasks)) if (k.startsWith('deploy') && v.includes('--no-verify-jwt')) process.exit(1)"`
-> exit 0.

### Step 2: Teach the convention checker to reject deploy bypasses

In `scripts/check-conventions.mjs`, export
`evaluateEdgeDeployConfig(contents)`. Parse JSON safely and return diagnostics
when any string task containing `supabase functions deploy` also contains
`--no-verify-jwt`. A malformed config must produce a clear diagnostic rather
than throw an unhandled stack. Extend `checkConventions(root)` to read
`supabase/deno.json` when present and attach diagnostics to that path, in
addition to existing app-file checks.

Do not reject `supabase functions serve --no-verify-jwt`; local serving is an
intentional exception.

**Verify**: `node scripts/check-conventions.mjs` -> exit 0 and prints the normal
success message.

### Step 3: Add regression tests for allowed local and forbidden deploy tasks

Extend `scripts/check-conventions.test.mjs` to cover:

1. deploy without the flag passes;
2. `serve --no-verify-jwt` passes;
3. deploy with the flag is rejected;
4. a temporary repository reports the diagnostic at `supabase/deno.json`;
5. malformed JSON returns a configuration diagnostic.

Keep all existing component/Tailwind tests unchanged.

**Verify**: `npm run test:conventions` -> all existing and five new cases pass.

### Step 4: Format and run all checks

**Verify**: `npm run format && npm run test:conventions && npm run check:conventions && npm run verify`
-> exit 0.

## Test plan

- Pure evaluator tests should not invoke Supabase.
- Integration fixture should create only a temporary `supabase/deno.json` and
  tracked app file, following `withTemporaryRepository`.
- Run the forbidden-pattern search excluding `plans/`; local `serve` matches may
  remain, but no `functions deploy ... --no-verify-jwt` match may remain.

## Done criteria

- [ ] Every tracked production deploy task verifies JWTs at the gateway.
- [ ] Local serve paths still work and remain documented.
- [ ] Convention checks reject any future deploy command with the bypass flag.
- [ ] Malformed deploy config fails safely.
- [ ] `npm run verify` exits 0.
- [ ] No remote deployment occurred.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- A function is intentionally public and the platform requires a deploy-time
  bypass for it; request a function-specific design instead of retaining a
  blanket flag.
- Hosted configuration contradicts the tracked task; do not change it without
  explicit remote authorization.
- The convention checker would need to scan secrets or `.env` files.
- A verification command fails twice after an in-scope fix.

## Maintenance notes

- Handler-level `getUser()` checks remain defense in depth and must not be
  removed after the gateway is enabled.
- Review every future `supabase functions deploy` task through the convention
  check.
- The local bypass is deliberately preserved because local function serving and
  its tests already depend on handler-level authentication.
