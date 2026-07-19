# Plan 019: Run the real Essentia/WASM analysis worker in browser CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/workers/localAudioAnalysis.worker.ts app/composables/useLocalAudioAnalysis.ts app/utils/localAudio.ts app/types/localAudio.ts shared/config/localAudioAnalysis.json test/nuxt/useLocalAudioAnalysis.nuxt.test.ts test/e2e vitest.config.ts package.json package-lock.json .github/workflows/verify.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/003-add-ci-verification.md`
- **Category**: tests
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `fab7c58` (integrated as `f0443af`), 2026-07-19

## Why this matters

Nuxt tests replace the production Worker with a fake, so they prove batching,
cancellation, and response routing but never import Essentia, instantiate WASM,
bundle the worker, or execute its algorithms. A broken dependency export,
worker URL, WASM initialization, or vector lifecycle can therefore ship behind
a green suite. This plan adds a small unit-testable core plus one real Chromium
smoke that runs the production worker module and deterministic synthetic audio.

## Current state

- `localAudioAnalysis.worker.ts:30-47` dynamically imports
  `essentia.js-core.es.js` and `essentia-wasm.es.js`, caches an Essentia instance,
  and has no direct test.
- Lines 82-132 convert samples, call `RhythmExtractor2013` and `KeyExtractor`,
  shape the analysis, and delete signal/rhythm vectors in `finally`.
- `useLocalAudioAnalysis.ts:69-77` constructs the production module Worker with
  `new URL('../workers/localAudioAnalysis.worker.ts', import.meta.url)`.
- `test/nuxt/useLocalAudioAnalysis.nuxt.test.ts:15-25` defines `FakeWorker`; all
  current tests inject it and never execute WASM.
- `vitest.config.ts` has Node/Nuxt/e2e projects but no Vitest browser project.
- `playwright-core@1.59.1` and Chromium setup already support Nuxt E2E; Plan 003
  installs Chromium in CI.
- Analyzer constants and version expectations come from
  `shared/config/localAudioAnalysis.json` through `app/utils/localAudio.ts`.

## Commands you will need

| Purpose              | Command                                                                                  | Expected on success                      |
| -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Add browser provider | `npm install --save-dev --save-exact @vitest/browser-playwright@4.1.2 playwright@1.59.1` | exit 0; package/lock update only         |
| Core tests           | `npx vitest run --project unit app/workers/localAudioAnalysisCore.test.ts`               | all pass                                 |
| Real browser smoke   | `npm run test:browser`                                                                   | Chromium starts; real worker test passes |
| Existing Nuxt tests  | `npx vitest run --project nuxt test/nuxt/useLocalAudioAnalysis.nuxt.test.ts`             | all pass                                 |
| Full gate            | `npm run verify`                                                                         | exit 0 including browser smoke           |

## Scope

**In scope** (the only files you should modify):

- `app/workers/localAudioAnalysisCore.ts` (create)
- `app/workers/localAudioAnalysisCore.test.ts` (create)
- `app/workers/localAudioAnalysis.worker.ts`
- `test/browser/localAudioAnalysisWorker.browser.test.ts` (create)
- `vitest.config.ts`
- `package.json`
- `package-lock.json`
- `.github/workflows/verify.yml` only if Plan 003's Chromium install does not
  already cover the new command
- `plans/README.md` status row

**Read only; expected unchanged**:

- `app/composables/useLocalAudioAnalysis.ts`
- `test/nuxt/useLocalAudioAnalysis.nuxt.test.ts`
- `app/utils/localAudio.ts`
- `shared/config/localAudioAnalysis.json`

**Out of scope**:

- Changing analyzer thresholds/configuration, cache keys, UI, or supported audio
  formats
- Exact BPM/key product tuning from synthetic audio
- Replacing Essentia, changing WASM packages, or moving analysis to a server
- Downloading or committing copyrighted/private audio fixtures

## Git workflow

- Branch: `codex/019-real-audio-worker-test`
- Use focused Conventional Commits, for example
  `test(audio): exercise real Essentia worker in Chromium`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a browser test project with exact compatible tooling

Install exact `@vitest/browser-playwright@4.1.2` and `playwright@1.59.1` to match
Vitest and existing `playwright-core`. In `vitest.config.ts`, import the
Playwright browser provider and add a `browser` project that includes only
`test/browser/**/*.browser.test.ts`, runs headless Chromium, and has a 120-second
timeout. Extend the unit project's include to
`app/workers/**/*.test.ts`.

Add package scripts:

```json
"test:browser": "vitest run --project browser"
```

Append `npm run test:browser` to `verify`. Do not replace the existing Nuxt E2E
project.

**Verify**: `npx vitest list --project browser` -> lists exactly the new worker
smoke file once it exists.

### Step 2: Extract an injectable analysis core without changing results

Move pure result shaping/vector lifecycle from the worker into
`localAudioAnalysisCore.ts`. Export an Essentia-like interface and
`analyzeLocalAudioRequest(request, essentia)`. Keep all current calls, argument
arrays, warnings, analyzer/config versions, result fields, and `finally` cleanup
identical. The worker remains responsible for lazy dynamic imports, singleton
construction, message routing, and safe error response.

Do not introduce Node APIs into the core or worker.

**Verify**: existing Nuxt analysis tests and `npm run typecheck` pass before new
core tests are added.

### Step 3: Unit-test vector lifecycle and error shaping

Create core tests with fake Essentia vectors exposing `delete` spies. Cover:

1. successful rhythm/key result maps every field and deletes signal, ticks,
   estimates, and intervals;
2. `KeyExtractor` throw still deletes all already-created vectors;
3. unreadable vector fields return empty arrays without skipping cleanup;
4. truncated analysis emits the existing warning;
5. out-of-range BPM emits the existing warning;
6. non-finite fields become null/are filtered.

**Verify**: core unit tests pass.

### Step 4: Add one real production-worker browser smoke

In `test/browser/localAudioAnalysisWorker.browser.test.ts`, instantiate exactly:

```ts
new Worker(
	new URL('../../app/workers/localAudioAnalysis.worker.ts', import.meta.url),
	{ type: 'module' }
)
```

Generate samples in memory—commit no binary fixture. Use 12 seconds at the
configured sample rate containing a low-amplitude C-major triad plus short
impulses every 0.5 seconds. Post a complete `LocalAudioWorkerRequest`, transfer
the sample buffer when supported, and enforce a 60-second promise timeout.

Assert:

- response ID matches and has `result`, not `error`;
- analyzer version contains both the configured analyzer name and a non-empty
  Essentia version;
- configuration version and sample rate equal exported constants;
- duration/offset fields echo the request;
- BPM is null or finite/in `[30,300]`, confidence/estimates are finite when
  present;
- key is a non-empty string, scale is `major` or `minor`, and key strength is
  finite (broad assertions avoid tuning the product to a synthetic fixture);
- worker terminates in `finally`.

The non-null key assertion is the proof that real WASM analysis ran; a shaped
mock response cannot satisfy the imported worker path.

**Verify**: `npm run test:browser` -> test passes in installed Chromium.

### Step 5: Wire CI and run all gates

Plan 003 already installs Chromium before `npm run verify`. If its command uses
`playwright-core`, confirm the `playwright` package finds the same browser; only
adjust the install line if needed, keeping one Chromium download. Then run all
focused and full gates.

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project unit app/workers/localAudioAnalysisCore.test.ts && npm run test:browser && npx vitest run --project nuxt test/nuxt/useLocalAudioAnalysis.nuxt.test.ts && npm run verify && npm run build`
-> exit 0.

## Test plan

- Unit core tests own deterministic cleanup/error branches.
- One browser smoke owns actual module-worker bundling, dynamic Essentia imports,
  WASM initialization, algorithm execution, and response protocol.
- Existing FakeWorker Nuxt tests continue owning composable batching,
  cancellation, caching, and unmatched-response behavior.
- No private audio or network access is used.

## Done criteria

- [ ] Production worker delegates only pure analysis to the tested core.
- [ ] Every vector is deleted on success and exceptions.
- [ ] Headless Chromium imports and executes the real Essentia/WASM worker.
- [ ] Browser smoke uses deterministic generated audio and a hard timeout.
- [ ] `test:browser` is included in local `verify` and source-controlled CI.
- [ ] Existing FakeWorker tests, full verification, and production build pass.
- [ ] No analyzer configuration or product output contract changed.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Exact Vitest/Playwright versions conflict with the Nuxt E2E runtime or require
  a major dependency change.
- Vite cannot bundle the production worker URL from a browser test without a
  production-only test hook or route.
- The deterministic signal cannot produce a non-null key after two reasonable
  signal refinements; report raw field presence/types only, not large arrays.
- Refactoring the core changes analyzer output or cache-version semantics.
- WASM requires network fetches not served by the test bundle.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Keep the real smoke broad and stable; detailed algorithm expectations belong
  in configuration benchmarks, not CI.
- When Essentia, Vite, Nuxt, or browser tooling changes, run this smoke before
  accepting lockfile updates.
- Fake and real tests are complementary; do not delete the fast FakeWorker suite.
