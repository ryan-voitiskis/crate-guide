# Plan 022: Refresh Discogs security documentation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Run the "Drift check" section first. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md` unless a reviewer
> told you they maintain the index.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/004-move-discogs-oauth-to-headers.md`, `plans/005-enforce-deploy-jwt-verification.md`, `plans/006-add-discogs-server-rate-limits.md`, `plans/014-make-cover-cleanup-durable.md`, and execution follow-ups 030–032 and 035
- **Category**: documentation
- **Planned at**: commit `99a570f`, 2026-07-19
- **Initial implementation**: commit `04e926d` (integrated as `98f0bda`); final
  reconciliation must run after Plans 030–032 and 035 change the cleanup
  contract.
- **Final reconciliation**: commit `5e052f2` (integrated as `22f9d24`),
  2026-07-19
- **Completed by**: final reconciliation commit `5e052f2` (integrated as
  `22f9d24`), 2026-07-19

## Why this matters

The Discogs integration guide describes credential RPCs and a testing gap that no longer match the repository. Security documentation that names removed data paths is actively misleading: maintainers may reintroduce direct database access, misunderstand the Edge trust boundary, or miss the actual deployment and rate-limit controls.

This plan runs after the related security and cleanup changes so the documentation records the implemented architecture rather than an intermediate design. It also adds a small drift check for the specific obsolete claims found by the audit.

## Current state

`docs/discogs-integration.md` currently says the application uses identity-bound `SECURITY DEFINER` credential RPCs and lists functions such as:

```text
get_discogs_credentials
set_discogs_request_credentials
set_discogs_access_credentials
```

The guide also states that direct Edge handler tests are absent, although handler tests now exist. The README Edge Function inventory is incomplete relative to the repository and does not explain which JWT checks are enforced by the gateway versus the handler.

## Target documentation contract

The finished documentation must say, using the final code as the authority:

- Browser code never reads or writes Discogs credentials directly.
- Each Edge handler validates the caller and uses the service-role repository only with the verified caller's user ID.
- The private credential table has no browser-facing policies or executable credential getter RPC.
- OAuth secrets and tokens travel in authorization headers after Plan 004; only non-secret Discogs business parameters remain in request URLs.
- Production deploy configuration verifies JWTs at the gateway, and handlers still perform their own `getUser()` check. Any local no-verify mode is explicitly local-only.
- Rate limiting is atomic, server-side, user-scoped, and global according to Plan 006, including the configured environment variables and stable 429 behavior.
- Cover deletion and cleanup responsibilities reflect Plan 014.
- The actual direct handler, database, and application test commands are named without implying they are all run by the same gate unless that is true after Plans 001–003.

## Commands you will need

| Purpose                | Command                      | Expected on success                                             |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| Documentation contract | `npm run check:discogs-docs` | exit 0; no obsolete security claims are present in current docs |
| Formatting             | `npm run format`             | exit 0; only in-scope files receive formatting changes          |
| Conventions            | `npm run check:conventions`  | exit 0                                                          |
| Full gate              | `npm run verify`             | exit 0                                                          |
| Obsolete-claim search  | Run the `rg` command below   | no output; exit 1 because no match is found                     |

## Scope

Modify:

- `docs/discogs-integration.md`
- `README.md`
- `package.json`

Create:

- `scripts/check-discogs-doc-contract.mjs`

Do not rewrite dated QA evidence as if it were current documentation. If a dated report must be clarified, add a short clearly dated follow-up note rather than altering its historical observation.

Do not change application, Edge Function, migration, or deployment behavior in this documentation plan.

## Drift check

Before editing:

```bash
git rev-parse --short HEAD
git status --short
rg -n "get_discogs_credentials|set_discogs_.*credentials|direct Edge|verify_jwt|rate limit|cleanup-record-covers" README.md docs/discogs-integration.md package.json supabase/config.toml supabase/functions
find supabase/functions -mindepth 1 -maxdepth 1 -type d -print | sort
```

Expected:

- The SHA is `99a570f`, or the executor records drift from completed dependency plans.
- The obsolete RPC names and stale testing statement appear in the current integration guide.
- The final Edge Function set and deploy/JWT configuration are discoverable from source.

STOP if any dependency plan is incomplete, because documenting an intended-but-unimplemented security contract would make this guide less trustworthy.

## Steps

1. Re-read the final implementation before writing prose.
   - Inspect every Discogs Edge handler, credential repository module, relevant migrations, `supabase/config.toml`, deploy scripts/workflows, rate-limit configuration, cleanup function, and test script.
   - Record whether each control is application-level, gateway-level, database-level, local-only, or production operational configuration.
   - Do not claim hosted deployment state unless it has been independently verified; document the tracked repository contract.

2. Rewrite the integration architecture and flow sections.
   - Remove references to credential RPCs that no longer exist.
   - Describe verified-user-to-service-repository scoping accurately.
   - Update request-token and access-token exchange diagrams/text to show authorization headers.
   - Describe rate-limit acquisition, 429 responses, and configuration at the level needed for maintainers without exposing secrets.
   - Explain gateway JWT verification and defense-in-depth handler validation.

3. Update operations, errors, and testing guidance.
   - List every current Discogs-related environment variable and identify which component reads it.
   - List expected user-facing/auth/rate-limit/provider error classes without promising unstable provider text.
   - Name the direct handler and database test commands and explain which umbrella command includes each after Plans 001–003.
   - Document cover deletion versus durable cleanup responsibility after Plan 014.

4. Bring the README inventory in sync.
   - List all current Edge Functions with one-sentence responsibilities.
   - Distinguish local emulation flags from deploy-time security settings.
   - Keep port references aligned with the reserved `42820–42829` range.
   - Reconcile any command changes already made by the foundation plans rather than overwriting them.

5. Add a focused documentation drift checker.
   - Scan only current documentation files, not historical migrations or dated evidence.
   - Fail if `docs/discogs-integration.md` reintroduces `get_discogs_credentials`, `set_discogs_request_credentials`, or `set_discogs_access_credentials`.
   - Fail if the guide claims direct handler tests do not exist.
   - Produce a concise file/phrase error and non-zero exit status.
   - Add `check:discogs-docs` to `package.json` and include it in the existing convention or verification chain at the narrowest appropriate point.

6. Review every security statement against source.
   - Link statements to concrete module/config names in the prose where helpful.
   - Remove absolute claims that cannot be established from the repository.
   - Ensure examples use placeholders and contain no real tokens, IDs, or secrets.

## Test plan

Run:

```bash
npm run check:discogs-docs
npm run format
npm run check:conventions
npm run verify
rg -n "get_discogs_credentials|set_discogs_request_credentials|set_discogs_access_credentials|no direct.*handler" README.md docs/discogs-integration.md
git diff --check
```

Expected:

- The documentation contract checker passes.
- The final `rg` command returns no matches.
- README and the guide agree with final functions, tests, JWT behavior, rate limiting, and cleanup architecture.
- Formatting, conventions, and the full verification suite pass.
- `git diff --check` returns no output.

## Git workflow

Use branch:

```text
codex/022-refresh-discogs-security-docs
```

Commit with:

```text
docs(discogs): align security architecture
```

Stage only the files listed in this plan. Do not push or open a pull request unless explicitly requested.

## Done criteria

- Removed credential RPCs are absent from current documentation.
- OAuth header handling, JWT layers, rate limiting, and cleanup responsibilities match source.
- The README inventory covers every current Edge Function.
- Test/gate claims distinguish direct, database, and umbrella commands accurately.
- The focused drift checker is part of a normal repository gate.
- All verification commands pass.

## STOP conditions

- A dependency security or cleanup plan is not complete.
- Source and deployment configuration disagree about JWT verification.
- The executor cannot determine whether a stated test is in the default verification gate.
- Documentation would need to assert unverified hosted state.
- The drift checker would need to scan migrations or historical reports and create false positives.

Resolve the implementation/configuration ambiguity first; do not paper over it with qualified but confusing prose.

## Maintenance notes

- Update this guide in the same change as any credential repository, OAuth transport, limiter, JWT, or cover-cleanup contract.
- Keep the drift checker focused on durable obsolete claims; it is not a substitute for reviewing the prose.
- Preserve historical QA reports as dated evidence.
