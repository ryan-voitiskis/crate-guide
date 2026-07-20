# Plan 053: Enforce a client bundle budget

> **Executor instructions**: Execute after correctness and frontend extraction
> plans so the measured baseline represents the intended architecture. Measure
> emitted browser assets, distinguish workers/WASM from initial application
> JavaScript, set an evidence-based non-regression budget, and commit
> conventionally.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 052, 054, and 055
- **Category**: performance / CI regression prevention
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: TODO

## Why this matters

The current production build emits a 949.15 kB minified, 292.07 kB gzip client
chunk warning. The build passes and CI has no size contract, so further growth
remains green. Essentia workers/WASM and route-specific enrichment code should
not inflate the initial workbench path merely because the app is client-only.

## Scope

Modify or create:

- `nuxt.config.ts`
- route/component import boundaries implicated by bundle analysis
- a deterministic post-build client asset budget script and tests
- `package.json`
- `.github/workflows/verify.yml`
- performance documentation if a budget is documented there

Do not replace code splitting with brittle vendor-name chunking, remove local
audio functionality, load remote analysis code, or include source maps in the
runtime budget.

## Drift check

```bash
git status --short
npm run build
find .output/public/_nuxt -type f -maxdepth 2 -print | sort
```

Capture minified, gzip, route ownership, worker, and WASM sizes before editing.
STOP if build output names/content are nondeterministic enough that a stable
semantic asset classification cannot be implemented.

## Required implementation

1. Produce a bundle evidence report.
   - Identify the initial application entry and its largest dependencies.
   - Separate initial JS, lazy route chunks, workers, WASM, CSS, and source maps.
   - Record current byte and gzip sizes in the plan handoff; do not infer causes
     from filenames alone.

2. Move heavy optional features behind real lazy boundaries.
   - Keep local audio analysis, enrichment review, and provider-specific tools
     out of the initial records/session/settings workbench unless used there.
   - Prefer route/component dynamic imports supported by Nuxt. Add manual chunks
     only where analysis proves a stable cohesive boundary.
   - Verify lazy navigation still loads each feature and reports errors.

3. Add a deterministic regression budget.
   - Budget initial client JS and the largest ordinary browser chunk separately
     from worker/WASM assets.
   - Set the first limit from the improved measured baseline with a small stated
     allowance, not a round number chosen to pass the current warning.
   - The script reports the offending asset, actual size, limit, and whether
     gzip or raw bytes failed. Test pass/fail and asset classification fixtures.

4. Run the budget after the production build in CI and `verify:full`.

## Test plan

```bash
npm run format
node --test scripts/check-client-bundle-budget.test.mjs
npm run verify
npm run build
npm run check:client-bundle-budget
npm run test:e2e
git diff --check
```

Use a real browser to load the default workbench, enrichment route, and local
audio worker after chunking. Assert no page/console/request errors and confirm
the optional chunks are requested only when their feature is opened.

## Done criteria

- [ ] Initial browser JS has an evidence-backed size reduction or documented stable boundary.
- [ ] Optional enrichment/audio code is lazy and still works in a real browser.
- [ ] CI fails a deterministic fixture and real build that exceed the declared budget.
- [ ] Worker/WASM assets are measured separately rather than hidden or charged to initial JS.
- [ ] Build, budget, E2E, and full verification pass.

## STOP conditions

Stop if a proposed split duplicates a large dependency across initial chunks,
if lazy loading breaks offline/local-only analysis, if the budget depends on
unstable hash names, or if the only apparent reduction comes from excluding a
real initial asset incorrectly.

## Git workflow

- Branch: `codex/053-enforce-client-bundle-budget`
- Commit: `perf: enforce client bundle budget`
