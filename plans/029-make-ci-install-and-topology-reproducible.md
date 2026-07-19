# Plan 029: Make the CI install and dependency topology reproducible

> **Executor instructions**: Follow the plan in order in an isolated worktree.
> Run every verification command against fresh install state, not the reviewer's
> existing `node_modules`. Touch only the files listed in scope. If a STOP
> condition occurs, stop and report instead of bypassing peer validation. The
> reviewer maintains `plans/README.md`; do not edit it.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: `plans/003-add-ci-verification.md`, `plans/008-patch-nuxt-dependency-graph.md`, `plans/025-patch-test-tooling-advisories.md`
- **Category**: dependencies / CI
- **Planned at**: commit `812f102`, 2026-07-19
- **Completed by**: commit `290e546` (integrated as `a984b65`), independently
  reproduced with exact Node 24.12.0/npm 11.6.2, 2026-07-19

## Why this matters

The verification workflow pins Node 24.12.0, whose bundled npm is 11.6.2, and
then starts both jobs with `npm ci`. A clean export of the integrated lockfile
fails there with `EUSAGE` before audits, tests, or build run, while the same
lockfile installs under the developer machine's npm 11.17.0. Local verification
therefore concealed a completely blocked CI gate.

The installable graph also reports invalid Vue compiler and `crossws` peers.
Nuxt typechecking prints that it cannot resolve
`vue-router/volar/sfc-route-blocks` but exits 0, so the current green typecheck
is incomplete. The remediation must align the framework graph, generate a
lockfile with the actual minimum CI toolchain, and add a normal gate that rejects
invalid topology or an unresolved generated Vue Router plugin.

## Reproduced evidence

At `812f102`:

- `.github/workflows/verify.yml` pins `node-version: 24.12.0` in both jobs and
  immediately runs `npm ci`.
- `package.json` declares Node `>=24.12.0`, npm `>=11.6.2`, exact Vue `3.5.32`,
  and an override holding Vue to that same version.
- Nuxt 4.4.8 requires Vue `^3.5.35`; `@nuxt/test-utils` requires Vue
  `^3.5.33`; the resolved Vue Router requires `@vue/compiler-sfc ^3.5.34`.
- `npm ls --all` reports `@vue/compiler-sfc@3.5.32` invalid and root
  `crossws@0.3.5` invalid for the optional `h3-next` peer `^0.4.1`.
- `npm run typecheck` prints
  `Cannot find module 'vue-router/volar/sfc-route-blocks'` and still exits 0.
- A fresh exact Node 24.12.0/npm 11.6.2 install fails with missing Vue compiler
  3.5.40 entries, while npm 11.17.0 installs it.

Use package manifests and a fresh resolved graph as the source of truth; do not
preserve a version merely because it appears in the broken lockfile.

## Scope

Modify only:

- `package.json`
- `package-lock.json`
- `.github/workflows/verify.yml` if an explicit package-manager assertion or
  topology step is required

Create if useful:

- `scripts/check-dependency-topology.mjs`
- `scripts/check-dependency-topology.test.mjs`

Do not update unrelated production libraries, change Node/Deno/Supabase
versions, suppress npm peer errors, use `--legacy-peer-deps`, use `--force`, or
raise the npm minimum merely to make the existing lock install. Preserve Plan
025's exact Vitest/browser pins and high-threshold production/full audits.

## Steps

1. Characterize a disposable clean install before editing.
   - Export tracked files to a temporary directory.
   - Run Node 24.12.0 with npm 11.6.2 and record the `npm ci` failure.
   - Confirm no project or user npm configuration is supplying
     `legacy-peer-deps`, `force`, or another resolver escape hatch.

2. Align the minimum framework graph.
   - Move the exact Vue dependency and Vue override together to a release that
     satisfies Nuxt, `@nuxt/test-utils`, and Vue Router (3.5.40 is the current
     broken lockfile's expected compiler family; verify manifests before
     choosing it).
   - Ensure Vue, `@vue/compiler-*`, and server renderer resolve to one compatible
     version.
   - Resolve the `h3-next` `crossws ^0.4.1` peer without breaking packages that
     require `crossws ^0.3.5`; npm may need a compatible root dev dependency and
     nested 0.3.x copies. Do not override 0.3.x consumers to an unsupported
     major/minor range.
   - Ensure Vue Router is resolvable from the project root so Nuxt's generated
     type plugin loads. Add a direct dependency only if correct hoisting under
     the supported graph does not provide that contract.

3. Regenerate the lockfile using exact Node 24.12.0/npm 11.6.2.
   - Start from a clean disposable install state rather than patching lockfile
     JSON by hand.
   - Keep the declared npm minimum aligned with the tool actually used.
   - Inspect the diff for unrelated package churn; explain every unavoidable
     transitive change.

4. Add a durable dependency-topology gate.
   - Run `npm ls --all` scoped to the reviewed Vue/compiler/Router and
     H3/`crossws` families, and fail on any invalid or missing required/peer
     node in those graphs.
   - Prove `vue-router/volar/sfc-route-blocks` resolves from the repository root
     using Node resolution.
   - Keep output concise. Do not filter a failing raw `npm ls --all` and claim
     it passed: npm 11.6.2 leaves platform-optional WASM artifacts orphaned on
     a fresh macOS install. That resolver behavior is outside the application
     graph and must be recorded as a verification limitation, not papered over
     or anchored with unrelated direct dependencies.
   - Add focused script tests following the repository's existing script-test
     patterns, then include the checker in `check:conventions` or `verify` and
     in CI after `npm ci` at the narrowest non-duplicative point.

5. Prove the exact CI path in a second fresh export.
   - With Node 24.12.0/npm 11.6.2, run `npm ci`, the topology checker,
     `npm run typecheck`, both audits, focused script tests, and the repository
     gate.
   - Capture typecheck output and assert the missing Vue Router plugin warning
     is absent; exit 0 alone is insufficient.

## Commands and expected results

Use an isolated temporary export for the first two commands so existing
`node_modules` cannot hide lockfile defects:

```bash
npx --yes -p node@24.12.0 -p npm@11.6.2 -c 'node --version && npm --version && npm ci'
npx --yes -p node@24.12.0 -p npm@11.6.2 -c 'npm run check:dependency-topology'
npm run test:dependency-topology
npm run typecheck 2>&1 | tee /tmp/crate-guide-typecheck.log
! rg -n "Cannot find module.*vue-router/volar/sfc-route-blocks" /tmp/crate-guide-typecheck.log
npm run audit:prod
npm run audit:all
npm run format
npm run check:conventions
npm run verify
npm run build
git diff --check
```

Expected:

- the fresh exact CI toolchain installs with no resolver flags;
- the focused Vue/Router/H3 topology checker exits 0 with no invalid peer;
- typecheck emits no missing Vue Router plugin warning;
- production audit reports zero vulnerabilities and full audit has no finding
  at or above the configured high threshold (the already-reviewed low,
  development-only nested esbuild advisory may remain);
- all application gates and build pass.

## Test plan

The script tests must exercise both a passing topology and failures for an
invalid `npm ls` result or unresolvable Vue Router plugin without mutating the
real install. The fresh-export command is the authoritative integration test:
it must use the exact Node/npm versions from CI and the committed lockfile.

## Done criteria

- [ ] Exact Node 24.12.0/npm 11.6.2 can run `npm ci` from tracked files.
- [ ] Focused `npm ls --all` graphs report no invalid Vue/Router/H3 required or
      peer topology; the npm 11.6.2 optional-WASM limitation is documented.
- [ ] Vue/compiler/server-renderer versions are aligned and supported.
- [ ] Nuxt typecheck resolves its Vue Router Volar plugin without warning.
- [ ] A normal local/CI gate detects future topology regressions.
- [ ] Plan 025's audit posture and exact test-tool pins remain intact.
- [ ] Audits, verify, and build pass after a clean install.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- satisfying one peer necessarily violates another package's declared range;
- npm 11.6.2 still cannot generate and consume its own lockfile after the
  supported graph is aligned;
- the Vue Router plugin warning persists with a valid, root-resolvable router;
- fixing topology requires a Nuxt major upgrade or unrelated production
  dependency migration;
- either audit introduces a new unreviewed production or high-severity finding;
- a verification command fails twice after a reasonable in-scope correction.

## Maintenance notes

Generate dependency changes with the minimum CI npm, then test them with that
same runtime in a clean export. A selected-package `npm ls` is not sufficient;
the full graph and generated type-plugin resolution are distinct release
contracts.
