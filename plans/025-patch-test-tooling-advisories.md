# Plan 025: Patch browser and test-tooling dependency advisories

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and inspect every lockfile movement before proceeding.
> Stop and report rather than using `--force`, changing application dependency
> majors, or weakening the browser gate. Root owns `plans/README.md`.
>
> **Drift check (run first)**: compare `package.json`, `package-lock.json`,
> `vitest.config.ts`, `.github/workflows/verify.yml`, and
> `test/browser/localAudioAnalysisWorker.browser.test.ts` against the final
> Plan 008 and Plan 019 commits. Stop if another task is changing either package
> file.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/008-patch-nuxt-dependency-graph.md`,
  `plans/019-test-real-essentia-worker.md`
- **Category**: security
- **Discovered at**: integration commit `12d8d58`, 2026-07-19
- **Completed by**: commit `e8f0be2` (integrated as `b3427b0`), 2026-07-19

## Why this matters

Plan 019 added `@vitest/browser-playwright@4.1.2` to exercise the real Essentia
worker. A fresh full `npm audit` then reported critical browser-mode advisories
in that matched Vitest generation, including
[an exposed browser-mode API path to configuration overwrite/RCE](https://github.com/advisories/GHSA-g8mr-85jm-7xhm)
and [an inline-script injection path](https://github.com/advisories/GHSA-2h32-95rg-cppp).
The production graph remains clean, but this test server runs locally and in CI
and must not be left on an affected release.

The same audit also identified semver-compatible updates for existing test-only
transitives. Apply safe non-major maintenance while the package lock is already
under review, but keep production versions and Plan 008's Nuxt/Vite/esbuild
constraints stable.

## Observed state

- `vitest` and `@vitest/browser-playwright` resolve to `4.1.2` and share the
  same peer generation.
- npm identifies `4.1.10` as a non-major fix for the browser package.
- `@nuxt/test-utils` can move from `4.0.0` to `4.0.3` within its declared major;
  its newer transitive graph removes the vulnerable pre-release H3/Srvx path.
- `undici` and `brace-expansion` have compatible patched transitive releases.
- `npm audit --omit=dev` reports zero vulnerabilities. Preserve that result.
- The nested `esbuild@0.27.7` belongs only to `@nuxt/eslint` tooling and was
  already attributed by Plan 008; do not force Vite or Nuxt majors to remove it.

## Scope

Modify only:

- `package.json`
- `package-lock.json`
- `.github/workflows/verify.yml`

Read only:

- `vitest.config.ts`
- `test/browser/localAudioAnalysisWorker.browser.test.ts`

Do not edit application, worker, Edge, database, or documentation behavior.
Do not add audit suppression, disable browser mode, bind its server publicly, or
run `npm audit fix --force`.

## Steps

### Step 1: Capture the dependency and advisory baseline

From a clean worktree, run:

```bash
npm ci
npm ls vitest @vitest/browser @vitest/browser-playwright @nuxt/test-utils undici brace-expansion esbuild --all
npm audit --json
npm audit --omit=dev --audit-level=high
```

Record counts and exact paths without copying the entire audit into source.
Confirm every critical finding is development-only and that production remains
at zero. Stop if a production advisory appears.

### Step 2: Update the matched browser-test pair

Pin both `vitest` and `@vitest/browser-playwright` to the same patched `4.1.10`
release. Keep Playwright at the Plan 019 version unless peer resolution proves a
change is required. Inspect `npm ls` for one deduplicated Vitest/browser graph
with no invalid peers.

### Step 3: Apply safe non-force test-graph maintenance

Allow `@nuxt/test-utils` to move to `4.0.3` and accept only compatible lockfile
updates attributable to it, `undici`, `brace-expansion`, or other already
declared ranges. A non-force `npm audit fix` may be used only after the matched
Vitest pair is pinned and only if its proposed diff stays inside this scope.

Do not add broad overrides to silence npm. If an advisory remains because the
maintainer has not published a compatible parent release, report the exact
development-only path and exploitability boundary for root review.

### Step 4: Prove the browser and application gates

Add `audit:all` as `npm audit --audit-level=high` and run it in the CI
application job after the existing production audit. This keeps future
high/critical test-tool regressions visible without failing CI on explicitly
reviewed lower-severity development-only findings.

Run:

```bash
npm ci
npm ls vitest @vitest/browser @vitest/browser-playwright --all
npm run test:browser
npm run test:run
npm run test:e2e
npm run check:conventions
npm run verify
npm run build
npm run audit:prod
npm run audit:all
git diff --check
```

The matched browser packages must resolve once, the real Essentia worker must
still pass in Chromium, and no critical/high advisory may remain in either the
full or production audit. Lower-severity development-only leftovers require an
explicit root review; do not conceal them.

### Step 5: Inspect and commit

Confirm the package-lock diff contains no production Nuxt/Vite movement, no
major upgrade, and no unrelated direct dependency change. Commit once with:

```text
chore(dev-deps): patch test tooling advisories
```

Do not push or merge.

## Done criteria

- [ ] Vitest and its browser provider use the same patched release.
- [ ] The critical browser-mode advisories are absent.
- [ ] The full audit has no critical/high findings.
- [ ] CI runs the high-severity full-graph audit as well as the production
      audit.
- [ ] The production audit remains at zero vulnerabilities.
- [ ] The real Chromium/WASM test, application tests, E2E tests, verify, and
      build all pass.
- [ ] Lockfile movement is completely attributable and contains no production
      framework drift.
- [ ] Only `package.json`, `package-lock.json`, and the CI workflow changed.

## STOP conditions

Stop and report if:

- a matched patched Vitest/browser pair is not published or has invalid peers;
- remediation requires a major upgrade, `--force`, or disabling browser mode;
- Nuxt, Vite, Vue, Supabase, Essentia, or another production dependency moves;
- a clean install cannot run the real worker test;
- a production advisory appears;
- verification fails twice after one reasonable in-scope correction.

## Maintenance notes

- Execution reduced the full audit from 3 critical, 2 high, 4 moderate, and 1
  low finding to one low, development-only `@nuxt/eslint` →
  `@eslint/config-inspector` → `esbuild@0.27.7` finding. Non-force npm
  remediation proposes no change; the advisory concerns a Windows development
  server, while this project develops on macOS and CI runs Linux. Keep it
  visible and revisit when the owning Nuxt ESLint graph publishes a compatible
  update.
- Keep Vitest and its browser provider on the same exact release.
- Continue gating production advisories in CI; periodically review the full
  development graph because browser/test servers have a materially different
  threat boundary from inert build-only packages.
- Revisit any explicitly attributed lower-severity tooling advisory when its
  owning parent publishes a compatible fix.
