# Plan 003: Add deterministic source-controlled CI for application, build, and database gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- .github package.json package-lock.json README.md CONTRIBUTING.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/001-add-database-test-gate.md`, `plans/002-enforce-database-type-parity.md`
- **Category**: dx
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `7108f56` (integrated as `a6fd13a`), 2026-07-19

## Why this matters

Crate Guide has strong local commands but no tracked CI workflow, so format,
type, browser, Edge, build, pgTAP, and generated-type regressions can merge
without an automated gate. This plan creates reproducible Linux jobs with
minimal permissions and a pinned toolchain. It keeps hosted secrets out of CI by
testing only the local Supabase stack and synthetic fixtures.

## Current state

- There is no `.github/` directory at commit `99a570f`.
- `package.json:8-10` requires Node `>=24.12.0` and npm `>=11.6.2`.
- `package.json:15-48` provides `verify`, `build`, and, after Plans 001-002,
  `test:db`, `verify:full`, and generated-type parity checks.
- `vitest.config.ts:1-68` defines unit, stores, server, Nuxt, and browser E2E
  projects. The E2E project uses `playwright-core` and needs Chromium installed.
- `supabase/config.toml:5-16` binds the local API to port 42821 and caps results
  at 1,000 rows; CI must use this tracked configuration.
- Tool versions confirmed during planning: Supabase CLI `2.109.1`, Deno `2.9.3`.
- `CONTRIBUTING.md:58-71` currently requires `format`, conventions, `verify`,
  and a separate build for deployment behavior.

## Commands you will need

| Purpose          | Command                                                                    | Expected on success              |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------- |
| Lock CLI         | `npm install --save-dev --save-exact supabase@2.109.1`                     | exit 0; package and lock updated |
| App gate         | `npm run verify`                                                           | exit 0                           |
| Production build | `npm run build`                                                            | exit 0                           |
| Database gate    | `npm run test:db`                                                          | exit 0 with local stack running  |
| Workflow syntax  | `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/verify.yml')"` | exit 0                           |

## Scope

**In scope** (the only files you should modify):

- `.github/workflows/verify.yml` (create)
- `package.json`
- `package-lock.json`
- `README.md`
- `CONTRIBUTING.md`
- `plans/README.md` status row

**Out of scope**:

- Any GitHub repository setting, branch-protection mutation, secret, or runner
  registration
- Deployment, preview publishing, or a Cloudflare token
- Dependabot/Renovate; Plan 008 adds the production audit gate
- Supabase hosted project linking or remote database access
- Changing application, test, migration, or generated type code

## Git workflow

- Branch: `codex/003-ci-verification`
- Use Conventional Commits, for example `ci: add full verification workflow`.
- Do not push, create a PR, or change branch protection unless instructed.

## Steps

### Step 1: Pin the Supabase CLI in the development lockfile

Run `npm install --save-dev --save-exact supabase@2.109.1`. Confirm only
`package.json` and `package-lock.json` change. Package scripts will resolve the
local binary automatically; do not use `npx ...@latest`.

**Verify**: `npm ls supabase --depth=0` -> reports exactly `supabase@2.109.1`.

### Step 2: Create the application/build job

Create `.github/workflows/verify.yml` triggered on `pull_request` and pushes to
`main`. Set top-level `permissions: contents: read` and concurrency that cancels
superseded runs for the same ref. Add an `application` job on `ubuntu-latest`:

1. `actions/checkout@v4`;
2. `actions/setup-node@v4` with Node `24.12.0` and npm cache;
3. `denoland/setup-deno@v2` with `v2.9.3`;
4. `npm ci`;
5. `npx --no-install playwright-core install --with-deps chromium`;
6. `npm run verify`;
7. `npm run build`.

Use no secrets or write permissions.

**Verify**: `rg -n "permissions:|24.12.0|v2.9.3|npm ci|--no-install|npm run verify|npm run build" .github/workflows/verify.yml`
-> every required gate is present.

### Step 3: Create an isolated database job

Add a `database` job on `ubuntu-latest` that checks out, sets up Node 24.12.0,
runs `npm ci`, runs `npx --no-install supabase start`, and then
`npm run test:db`. Add a final step guarded by `if: always()` that runs
`npx --no-install supabase stop --no-backup`. Set a 20-minute job timeout.

Do not run `db reset`, `link`, `config push`, or use hosted credentials.

**Verify**: `rg -n "database:|supabase start|test:db|if: always|stop --no-backup|timeout-minutes" .github/workflows/verify.yml`
-> database setup, test, and cleanup are all explicit.

### Step 4: Document the CI contract

Update README Code Quality/Database sections and CONTRIBUTING validation guidance
to say pull requests run application, build, and database jobs. Clarify that
local `npm run verify:full` is the nearest equivalent and still requires Docker.
Do not claim branch protection is enabled.

**Verify**: `rg -n "CI|verify:full|database job|pull request" README.md CONTRIBUTING.md`
-> the three gates and local equivalent are described.

### Step 5: Validate locally

Parse the workflow, format all changed files, run conventions and `verify`, then
run `build`. If Docker is available, start Supabase and run `test:db`, returning
the stack to its prior state.

**Verify**: `npm run format && ruby -e "require 'yaml'; YAML.load_file('.github/workflows/verify.yml')" && npm run check:conventions && npm run verify && npm run build`
-> exit 0.

## Test plan

- Machine-parse the workflow YAML; do not rely on visual indentation.
- Confirm a clean `npm ci` installs the pinned Supabase binary and all existing
  tests without a global CLI.
- When a PR is eventually opened, the operator should verify both `application`
  and `database` jobs complete. That remote observation is not required to
  commit this local plan.

## Done criteria

- [ ] Workflow has read-only permissions and concurrency cancellation.
- [ ] Application job runs locked install, Chromium install, `verify`, and build.
- [ ] Database job starts local Supabase, runs pgTAP, and always stops it.
- [ ] Supabase CLI is exactly pinned at `2.109.1` in package and lock files.
- [ ] Workflow YAML parses successfully.
- [ ] `npm run verify`, `npm run build`, and `npm run test:db` exit 0 locally.
- [ ] No secrets or hosted project identifiers are present.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- A CI directory/workflow appears after the drift check; reconcile ownership
  instead of adding a competing workflow.
- Organization policy requires SHA-pinned actions or self-hosted runners and
  that policy is not available in the repository.
- `npm ci` cannot install the exact Supabase CLI on Linux/Node 24.
- Existing tests require real external credentials or hosted data.
- Ports `42820-42829` conflict on the GitHub-hosted runner.
- A verification step fails twice after an in-scope correction.

## Maintenance notes

- Review action major versions and pinned Deno/Supabase versions deliberately;
  do not switch to `latest`.
- Keep CI synthetic and local. Hosted deployment smoke tests require a separate,
  explicitly authorized design.
- Plan 008 adds `npm audit --omit=dev --audit-level=high` after the vulnerable
  Nuxt graph is updated.
