# Plan 001: Add a repeatable database verification gate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- package.json README.md CONTRIBUTING.md supabase/tests`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `1932775` (integrated as `e417698`), 2026-07-19

## Why this matters

The repository has three pgTAP suites protecting credential isolation,
idempotent imports, and private cover storage, but no package command or
documented handoff gate runs them. `npm run verify` can therefore be green while
a migration breaks database security or transactional behavior. This plan adds
an explicit local/release gate without making the existing read-only application
gate unexpectedly require Docker.

## Current state

- `package.json:15-48` defines application, browser, Edge, and maintenance
  checks. It has no database-test script; `verify` ends with convention checks.

  ```json
  "test:edge": "cd supabase && deno task test",
  "build": "nuxt build",
  "verify": "npm run format:check && ... && npm run check:conventions",
  "supa:reset": "supabase db reset"
  ```

- `supabase/tests/discogs_credentials.sql` has 8 pgTAP assertions.
- `supabase/tests/import_record_idempotency.sql` covers the atomic import RPC.
- `supabase/tests/record_cover_storage.sql` covers the private bucket and its
  policies.
- `README.md:181-248` documents Vitest, Edge checks, builds, and type generation,
  but not `supabase test db`.
- `CONTRIBUTING.md:43-47` explicitly names Supabase SQL tests as the closest test
  layer and requires forward-only migrations.
- Preserve the reserved local Supabase ports `42820-42829`. Do not change
  `supabase/config.toml` in this plan.

## Execution-discovered local prerequisite

The running operator-local database recorded an uncommitted draft of migration
`20260718130000` that created the empty `record-covers` bucket with
`public = true`. The draft was applied 92 minutes before the migration's first
Git commit, which already specified a private bucket. Because the version was
recorded as applied, the later source edit could not reconcile the row. Current
committed migration/config state is correct; no source repair or migration
rewrite is warranted from this local-only evidence.

With explicit operator approval, reconcile only the local bucket through the
CLI's config-backed Storage API:

```bash
cd /Users/vz/projects/crate-guide-plan-001
env SUPABASE_HOME=/var/empty SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 \
  supabase seed buckets --local --yes
```

Before and after the command, verify that the bucket has zero objects and that
its size/MIME remain 2 MiB and `image/webp`; only `public` may change from true
to false. Then rerun `supabase test db`. Do not reset/restart the stack, rewrite
the existing migration, or add a forward migration unless separate evidence
shows the public draft reached a shared environment.

## Commands you will need

| Purpose              | Command                     | Expected on success                                                    |
| -------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Start local database | `supabase start`            | exit 0; local project is running on the configured `42820-42829` ports |
| Database tests       | `supabase test db`          | exit 0; every file under `supabase/tests` passes                       |
| Package gate         | `npm run test:db`           | exit 0; same pgTAP suites pass                                         |
| Full local gate      | `npm run verify:full`       | exit 0; application, build, and database gates all pass                |
| Conventions          | `npm run check:conventions` | exit 0                                                                 |

## Scope

**In scope** (the only files you should modify):

- `package.json`
- `README.md`
- `CONTRIBUTING.md`
- `supabase/tests/*.sql` only if a current test itself is incompatible with
  `supabase test db`; otherwise do not edit SQL
- `plans/README.md` status row

**Out of scope** (do NOT touch):

- `supabase/config.toml` or any local port
- Existing migrations
- CI configuration; Plan 003 owns source-controlled CI
- Starting, stopping, resetting, or linking a hosted Supabase project
- Adding Docker orchestration outside the Supabase CLI

## Git workflow

- Branch: `codex/001-database-test-gate`
- Keep one focused commit. Use Conventional Commits, for example
  `test(database): add pgTAP verification gate`.
- Do not push or open a pull request unless the operator instructs you.

## Steps

### Step 1: Prove the existing SQL suites run through the CLI

Run `supabase status`. If the local project is stopped, run `supabase start`;
do not reset a running project. Run `supabase test db` and record which test
files execute. Do not alter a failing migration or assertion yet.

If the known operator-local bucket drift is still present, perform only the
approved prerequisite above before retrying this step.

**Verify**: `supabase test db` -> exit 0 and all discovered pgTAP files pass.

### Step 2: Add package scripts with an explicit Docker boundary

In `package.json`, add:

```json
"test:db": "supabase test db",
"verify:full": "npm run verify && npm run build && npm run test:db"
```

Keep `verify` unchanged. It is documented as a read-only gate and is useful on
machines without Docker; `verify:full` is the release/local-integration gate.

**Verify**: `npm pkg get scripts.test:db scripts.verify:full` -> prints exactly
the two commands above.

### Step 3: Document when and how to run the database gate

Update `README.md` Testing, Code Quality, and Database sections to list
`npm run test:db` and `npm run verify:full`. State that a running local Supabase
stack is required and that the command never targets a linked hosted project.
Update `CONTRIBUTING.md` so schema, RLS, RPC, storage-policy, and migration
changes require `npm run test:db`, and deployment-affecting handoffs require
`npm run verify:full`.

**Verify**: `rg -n "test:db|verify:full|Supabase SQL" README.md CONTRIBUTING.md`
-> both commands and the database-change rule are present.

### Step 4: Run the new full gate

Run formatting, conventions, then the complete gate. Leave the local stack in
the state you found it: if you started it, stop it with
`supabase stop --no-backup`; if it was already running, leave it running.

**Verify**: `npm run format && npm run check:conventions && npm run verify:full`
-> exit 0.

## Test plan

- No new application test is needed for a script alias. The regression is the
  successful execution of every existing pgTAP file via both `supabase test db`
  and `npm run test:db`.
- Confirm a stopped stack produces a clear non-zero CLI error; do not add custom
  stack startup logic to the package script.
- Confirm `npm run verify` remains usable without starting Supabase.

## Done criteria

- [ ] `npm run test:db` exits 0 against the local stack.
- [ ] `npm run verify:full` exits 0.
- [ ] `npm run verify` still contains no implicit database start/reset.
- [ ] README and contributing guidance distinguish `verify` from `verify:full`.
- [ ] No files outside the in-scope list are modified (`git status --short`).
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Any existing pgTAP test fails before these script/documentation changes.
- The local stack is linked to or would mutate a hosted Supabase project.
- Docker or the Supabase CLI is unavailable.
- An existing process owns one of ports `42820-42829`; do not kill it.
- The fix appears to require changing an existing migration.
- A verification command fails twice after a reasonable in-scope correction.

## Maintenance notes

- Every future migration must add or update the closest pgTAP suite and pass
  `test:db`.
- Keep `verify` read-only; put Docker/database/release checks in `verify:full`.
- Plan 003 will make the database gate mandatory in CI and will own stack
  lifecycle there.
