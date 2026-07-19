# Plan 008: Patch the vulnerable Nuxt production graph and gate future high-risk advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- package.json package-lock.json .github/workflows/verify.yml README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-add-ci-verification.md`
- **Category**: migration
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `6f50b20` (integrated as `33cda44`), 2026-07-19

## Why this matters

The locked production graph reports 17 advisories, including one critical and
four high, through Nuxt/build dependencies. Nuxt is locked at 4.4.2. This plan
performs the smallest bounded upgrade that clears the production graph, proves
application/build compatibility, and adds a CI gate so future high/critical
production advisories are visible immediately.

## Current state

- `package.json:63` declares `"nuxt": "^4.4.2"`; `package-lock.json` resolves
  Nuxt 4.4.2.
- At planning time, `npm audit --omit=dev` reports:
  `1 critical, 4 high, 9 moderate, 3 low` (17 total). Named affected packages
  include `nuxt`, `shell-quote`, `devalue`, `simple-git`, and `vite` in the Nuxt
  production graph.
- The prior audit confirmed compatible fixes were available and Nuxt 4.4.8 was
  current in the chosen 4.4 patch line. Re-check registry/advisory state at
  execution time because it is time-sensitive.
- `package.json:40` runs the full app/Edge suite, but has no audit script.
- Plan 003 creates `.github/workflows/verify.yml`; this plan extends its
  application job rather than creating a second workflow.
- `npm run build` targets the Cloudflare Pages/Nuxt production bundle and is a
  required compatibility gate.

## Execution-discovered revision

On 2026-07-19 the latest available 4.4.x release, Nuxt 4.4.8, reduced the live
production audit from 17 advisories to 5 but left one critical
`shell-quote@1.8.3` advisory and one high `simple-git@3.33.0` advisory through
Nuxt DevTools. The original zero-advisory done criterion therefore cannot be met
inside the 4.4 patch line.

The authorized remediation ladder is now:

1. test a plain, non-force, no-override transitive remediation while retaining
   Nuxt 4.4.8, accepting it only if every lockfile movement is attributable and
   the production audit reaches zero;
2. if that cannot reach zero, use the earliest available Nuxt 4.5.x release that
   reaches zero and passes the complete application/build compatibility gate.
3. if Nuxt 4.5 requires a Vite major, retain Nuxt 4.4.8 and allow one exact
   `esbuild@0.28.1` development pin only when a clean install proves the fixed
   copy serves every production Nuxt/Vite path and the incompatible 0.27 copy is
   nested exclusively below the development-only ESLint inspector.

Nuxt 5, framework/dependency major upgrades, overrides, force fixes, any other
direct graph pin, unrelated upgrades, and application-source compatibility
edits remain outside scope.

## Commands you will need

| Purpose           | Command                                           | Expected on success                                                     |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Baseline audit    | `npm audit --omit=dev --json`                     | confirms live advisory set; save no raw report in repo                  |
| Upgrade           | `npm install nuxt@<selected-version>`             | exit 0; bounded package/lock update                                     |
| Production audit  | `npm audit --omit=dev`                            | exit 0 and `found 0 vulnerabilities` at landing                         |
| Compatibility     | `npm run verify && npm run build`                 | exit 0                                                                  |
| Dependency reason | `npm explain shell-quote devalue simple-git vite` | updated paths resolve through patched Nuxt graph or packages are absent |

## Scope

**In scope** (the only files you should modify):

- `package.json`
- `package-lock.json`
- `.github/workflows/verify.yml`
- `README.md`
- `plans/README.md` status row

**Out of scope**:

- Nuxt 5 or any Vue, Vite, or module major upgrade
- `npm audit fix --force`, overrides, vendored patches, or ignored advisories
- Any direct transitive pin except the execution-authorized exact
  `esbuild@0.28.1` development constraint
- Application source changes; if the patch requires them, stop
- Updating unrelated direct dependencies for freshness
- Deploying the resulting build

## Git workflow

- Branch: `codex/008-patch-nuxt-security`
- Use one Conventional Commit, for example
  `chore(deps): patch Nuxt security advisories`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Reconfirm the live advisory and patch boundary

Run `npm audit --omit=dev --json`, `npm outdated nuxt`, and
`npm view nuxt@4.4.8 version`. Confirm the high/critical paths still resolve
through Nuxt. Apply the execution-discovered remediation ladder above, recording
why 4.4.8 alone is insufficient and why the selected graph is the smallest one
that reaches zero. Do not write the JSON report to the repository.

**Verify**: `npm view nuxt@^4.4.8 version --json` -> returns at least one 4.4.x
version and no major-only requirement.

### Step 2: Apply the smallest bounded zero-advisory graph

First test a plain non-force transitive remediation with Nuxt 4.4.8. If it does
not reach zero, inspect the earliest available Nuxt 4.5.x. If that requires Vite
8, retain Nuxt 4.4.8 and test the exact `esbuild@0.28.1` development constraint
described above. Inspect `git diff -- package.json package-lock.json` and
`npm explain` for every prior vulnerable package. Do not add overrides, run a
force fix, update unrelated direct dependencies, or edit application source.

**Verify**: `npm ls nuxt && npm audit --omit=dev` -> Nuxt resolves to the chosen
bounded version and audit exits 0 with zero vulnerabilities.

When the esbuild constraint is used, also run `npm explain esbuild` after a clean
`npm ci`: every production path must resolve to 0.28.1 or newer, and any older
copy must be reachable only through development dependencies.

### Step 3: Add a stable production-audit command and CI gate

Add:

```json
"audit:prod": "npm audit --omit=dev --audit-level=high"
```

In Plan 003's application CI job, run `npm run audit:prod` immediately after
`npm ci` and before browser installation/tests. The high threshold prevents a
new high/critical production advisory from passing; Step 2 still requires zero
known advisories at landing.

**Verify**: `npm run audit:prod` -> exit 0; `rg -n "audit:prod" package.json .github/workflows/verify.yml`
shows both definitions.

### Step 4: Prove upgrade compatibility

Run the complete verification and production build. Inspect warnings for new
Nuxt migration or deprecation failures; existing bundle-size/Cloudflare warnings
alone are not regressions.

**Verify**: `npm run format && npm run check:conventions && npm run verify && npm run build`
-> exit 0.

### Step 5: Document the audit gate

Add `npm run audit:prod` to README Code Quality and state that CI blocks
high/critical production-graph advisories. Do not claim it proves exploitability
or replaces dependency review.

**Verify**: `rg -n "audit:prod|high|critical" README.md` -> command and scope are
documented.

## Test plan

- No new application tests are expected; the risk is dependency compatibility,
  so the full existing suite, E2E project, Edge gates, and production build are
  mandatory.
- `npm audit --omit=dev` must be zero at landing, not merely below the CI
  threshold.
- Review lockfile changes with `npm explain`; every large transitive movement
  must trace to the selected Nuxt remediation.

## Done criteria

- [ ] Nuxt resolves to the smallest bounded release that reaches zero without a
      major upgrade.
- [ ] `npm audit --omit=dev` reports zero vulnerabilities at landing.
- [ ] `audit:prod` blocks future high/critical production advisories in CI.
- [ ] `npm run verify` and `npm run build` exit 0.
- [ ] No overrides, force fixes, or unrelated direct upgrades were added.
- [ ] No application source file changed.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- A fixed graph requires Nuxt 5, another major upgrade, or application changes.
- Any high/critical advisory remains after the smallest compatible bounded Nuxt
  remediation.
- A remaining advisory originates from an unrelated direct dependency; identify
  it and request a separate scoped dependency plan.
- `npm audit` proposes only `--force`, overrides, or a downgrade.
- The lockfile changes cannot be explained by the Nuxt update.
- Verification fails twice after a clean install and one bounded retry.

## Maintenance notes

- Advisory data changes over time; reviewers should attach the execution-date
  summary, not the full machine report.
- Keep the CI threshold high/critical, but aim for zero during intentional
  dependency maintenance.
- Handle future major upgrades in dedicated migration plans with browser QA.
