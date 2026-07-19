# Plan 009: Pin and update the Edge Supabase SDK

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/deno.json supabase/deno.lock supabase/functions`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-add-ci-verification.md`
- **Category**: migration
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `a6deacb` (integrated as `9884860`), 2026-07-19

## Why this matters

The Edge import map floats on major version `2`, while the lockfile remains at
Supabase JS 2.56.0. That combination obscures the intended runtime version and
can produce a large surprise update whenever the lock is refreshed. Pinning the
audited compatible 2.110.7 release makes updates reviewable and brings current
auth, storage, and client fixes into the Edge runtime.

## Current state

- `supabase/deno.json:10-12` contains:

  ```json
  "@supabase/supabase-js": "npm:@supabase/supabase-js@2"
  ```

- `supabase/deno.lock:4,47` resolves that floating specifier to 2.56.0.
- The prior dependency audit confirmed 2.110.7 as the compatible target at the
  planning date. Reconfirm availability before editing.
- Shared helpers create anonymous, caller-authenticated, and service-role
  clients; all Edge functions and their Deno tests transitively exercise the
  SDK.
- `supabase/deno.json:17-19` defines `test`, `check`, and `lint` tasks.
- Prettier owns Edge formatting; do not run `deno fmt`.

## Commands you will need

| Purpose            | Command                                                                 | Expected on success  |
| ------------------ | ----------------------------------------------------------------------- | -------------------- |
| Confirm version    | `npm view @supabase/supabase-js@2.110.7 version`                        | prints `2.110.7`     |
| Refresh cache/lock | `cd supabase && deno cache --reload --lock=deno.lock functions/**/*.ts` | exit 0; lock updates |
| Edge gates         | `npm run check:edge && npm run lint:edge && npm run test:edge`          | exit 0               |
| Full gate          | `npm run verify`                                                        | exit 0               |

## Scope

**In scope** (the only files you should modify):

- `supabase/deno.json`
- `supabase/deno.lock`
- `plans/README.md` status row

**Read only; must remain unchanged unless a STOP is reported**:

- `supabase/functions/**/*.ts`
- `package.json`
- `package-lock.json`

**Out of scope**:

- Updating the application's npm-resolved Supabase client
- Updating Deno itself or other Edge dependencies
- Refactoring auth/storage helpers
- Hosted deployment or secrets
- Any SDK major upgrade

## Git workflow

- Branch: `codex/009-edge-supabase-sdk`
- Use one Conventional Commit, for example
  `chore(edge): pin updated Supabase SDK`.
- Do not deploy, push, or open a PR unless instructed.

## Steps

### Step 1: Confirm the exact compatible target

Run `npm view @supabase/supabase-js@2.110.7 version` and review its release notes
for auth, storage, RPC, or Deno behavior changes between 2.56.0 and 2.110.7. If a
newer version exists, do not substitute it merely for freshness; this plan is
pinned to the audited target.

**Verify**: the registry prints exactly `2.110.7`.

### Step 2: Pin the import map and refresh only the Deno lock

Change the import map value to:

```json
"@supabase/supabase-js": "npm:@supabase/supabase-js@2.110.7"
```

Refresh Deno's cache/lock from `supabase/`. If the shell does not expand the
recursive glob, run `deno task check --reload` once instead; do not delete the
lockfile. Inspect the diff so every new package traces to Supabase JS 2.110.7.

**Verify**: `rg -n "supabase-js@2(\.56\.0|\.110\.7)?" supabase/deno.json supabase/deno.lock`
-> import map and root lock specifier show 2.110.7, with no 2.56.0 entry.

### Step 3: Run every Edge contract

Run check, lint, and all Deno tests. Pay special attention to caller validation,
credential repository, account deletion, storage cleanup, RPC response shapes,
and OAuth handlers. Do not change production TypeScript to paper over an
unexpected SDK break; stop instead.

**Verify**: `npm run check:edge && npm run lint:edge && npm run test:edge` ->
exit 0.

### Step 4: Run repository verification and inspect scope

**Verify**: `npm run format && npm run check:conventions && npm run verify && git diff --exit-code -- supabase/functions package.json package-lock.json`
-> gates pass and read-only paths have no diff.

## Test plan

- The existing full Edge test suite is the compatibility test; no new test is
  required for an import-map-only change.
- Run one local, synthetic smoke against served functions: missing auth must
  return 401, and a valid local test user may call one non-destructive handler.
- Do not contact live Discogs or delete a real account as part of this plan.

## Done criteria

- [ ] Import map is exactly pinned to Supabase JS 2.110.7.
- [ ] Deno lock contains 2.110.7 and no stale 2.56.0 root resolution.
- [ ] Lock changes are attributable only to the SDK update.
- [ ] All Edge and full repository gates pass.
- [ ] No function TypeScript, npm manifest, or npm lockfile changed.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- 2.110.7 is unavailable, yanked, or has a known regression relevant to this
  repository.
- The update requires production function code changes or a Deno upgrade.
- The refreshed lock changes unrelated direct dependencies.
- Edge tests expose an auth, RPC, or storage behavior change.
- A verification command fails twice after one clean cache refresh.

## Maintenance notes

- Supabase JS 2.110.7 exposes `auth.getClaims(token)`. Plan 007's post-upgrade
  follow-up removed its old compatibility verifier and now uses that API while
  preserving the separately authenticated user/subject check.
- Keep exact Edge SDK pins. Future updates should be intentional lockfile
  changes with the full Edge suite.
- Application and Edge SDKs need not be identical, but reviewers should compare
  auth/RPC API behavior when they diverge materially.
- Do not switch the import map back to a floating `@2` range.
