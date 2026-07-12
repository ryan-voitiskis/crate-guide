# Plan 006: Add rendered and browser-workflow characterization coverage

> **Executor instructions**: Follow this plan step by step. Preserve production
> behavior; this is a characterization/testability plan, not a UI redesign. Run
> every gate and stop on the conditions below. Update `plans/README.md` when
> complete unless the reviewer owns the tracker.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   package.json \
>   package-lock.json \
>   vitest.config.ts \
>   app/composables/useLocalAudioAnalysis.ts \
>   app/utils/localAudioCache.ts \
>   test/nuxt
> ```
>
> Run `git status --short`. Plans 003 and 005 must be DONE and `npm run verify`
> must be available before implementation begins.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 003 and Plan 005
- **Category**: tests
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The existing 912 tests exercise pure utilities, stores, composables with mocked
globals, middleware, and server handlers, but no Vue component, page, Worker,
or IndexedDB boundary. The broken separator contract and duplicated editor
duration bug both passed every current gate. This plan establishes a Nuxt
runtime project and characterizes the highest-risk existing interactions before
Plans 011–014 refactor them.

## Current state

- `vitest.config.ts:7-74` defines only `unit`, `stores`, `server`, and `e2e`
  projects. No project uses the Nuxt runtime environment.
- The installed `@nuxt/test-utils` exports `defineVitestProject` and
  `mountSuspended`, but `@vue/test-utils` is not a direct dependency.
- `app/components/ui/button/Button.vue:8-36` owns application-specific
  `loading` behavior; `Checkbox.vue:8-39` owns `largeHitArea`. Plan 012 will
  move those contracts, so they need behavior tests first.
- `app/components/session/DialogLoadTrack.vue:92-174` handles autofocus,
  matched-track scrolling, transient reset, ArrowDown focus, selection, and
  dialog closure in rendered DOM.
- `app/components/enrichment/TableTrackEnrichmentReview.vue` emits row/bulk
  staging events and renders key/BPM values, including valid key `0`.
- `app/composables/useLocalAudioAnalysis.ts:45-526` creates browser Workers and
  audio contexts directly, owns pending request rejection, cancellation,
  sequential processing, cache use, and scope disposal.
- `app/utils/localAudioCache.ts:17-70` owns IndexedDB open/upgrade/read/write and
  has no focused test.

Use the installed Nuxt Test Utils pattern:

```ts
await defineVitestProject({
	test: {
		name: 'nuxt',
		environment: 'nuxt',
		environmentOptions: {
			nuxt: {
				rootDir,
				domEnvironment: 'happy-dom',
				mock: { indexedDb: true }
			}
		}
	}
})
```

Assertions should target semantics, attributes, events, and named contract
classes—not full snapshots or complete Tailwind class ordering.

## Commands you will need

| Purpose           | Command                                           | Expected on success                                 |
| ----------------- | ------------------------------------------------- | --------------------------------------------------- |
| Install test peer | `npm install --save-dev '@vue/test-utils@^2.4.6'` | exit 0; Vue remains on the repository override      |
| Nuxt tests        | `npm run test:nuxt`                               | exit 0; all new runtime tests pass                  |
| Full verification | `npm run verify`                                  | exit 0; Nuxt project is included through `test:run` |
| Build             | `npm run build`                                   | exit 0                                              |
| Format            | `npm run format`                                  | exit 0; intended files only                         |

## Scope

**In scope**:

- `package.json`
- `package-lock.json`
- `vitest.config.ts`
- `app/composables/useLocalAudioAnalysis.ts` — dependency seams only
- `app/utils/localAudioCache.ts` — test reset/close seam only if required
- `test/nuxt/ui-primitive-extensions.nuxt.test.ts` (create)
- `test/nuxt/DialogLoadTrack.nuxt.test.ts` (create)
- `test/nuxt/TableTrackEnrichmentReview.nuxt.test.ts` (create)
- `test/nuxt/useLocalAudioAnalysis.nuxt.test.ts` (create)
- `test/nuxt/localAudioCache.nuxt.test.ts` (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Visible UI/copy/layout changes or fixes to the separator/editor findings.
- Refactoring enrichment page workflow; Plan 013 owns it.
- Changing audio-analysis algorithms, thresholds, cache keys, or output shapes;
  Plan 014 owns configuration centralization.
- Modifying generated `app/components/ui/**` files.
- Full authenticated browser journeys, real Supabase, network, credentials, or
  production audio files.
- Test snapshots of whole components.

## Git workflow

- Branch: `codex/006-add-rendered-characterization`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `test(ui): add rendered workflow coverage`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a non-overlapping Nuxt Vitest project

Install direct compatible `@vue/test-utils`. In `vitest.config.ts`, import
`defineVitestProject` from `@nuxt/test-utils/config` and add project `nuxt`:

- include only `test/nuxt/**/*.nuxt.test.ts`;
- environment `nuxt`;
- repository root via `fileURLToPath(new URL('.', import.meta.url))`;
- `domEnvironment: 'happy-dom'`;
- enable Nuxt's IndexedDB mock with the exact environment option
  `mock: { indexedDb: true }`.

Add the exact script `"test:nuxt": "vitest run --project nuxt"`, and add
`--project nuxt` to both aggregate `test` and `test:run`. Preserve all existing
projects and setup files.

**Verify**:

```bash
npm ls @vue/test-utils
npm run test:nuxt
npm run test:run
```

Expected: one compatible root Vue Test Utils package; the Nuxt project runs
once; all pre-existing projects still run.

### Step 2: Characterize the two generated-primitive extensions

Directly mount the current Button and Checkbox files. Cover:

- ordinary Button is enabled and renders slot content;
- loading Button is disabled, renders its spinner, and visually hides rather
  than removes slot content;
- ordinary Checkbox retains the compact root contract;
- `largeHitArea` adds the intended larger target and is not forwarded as a
  stray DOM attribute.

These tests document behavior for Plan 012; do not fix or test the currently
broken `Separator label/spanClass` behavior.

**Verify**: `npm run test:nuxt -- ui-primitive-extensions` → four tests pass.

### Step 3: Characterize the session picker and enrichment review table

Use `mountSuspended` with isolated testing Pinia state and direct component
imports. For the session picker, cover:

- opening focuses `[data-testid="load-track-search"]`;
- ArrowDown focuses the first real `[data-testid="load-track-option"]`;
- selecting a track calls `session.loadTrack(trackId, deckIndex, false)`, emits
  `update:open` with `false`, and clears query/focus/expansion transient state;
- closing and reopening preserves crate scope but clears transient state;
- no extraneous Teleport-attribute warning is logged.

For the enrichment table, cover:

- `stage-row` and `stage-all` payloads;
- blocked or applying rows cannot stage;
- valid key `0` renders as a real value, not absent;
- indeterminate selection is forwarded to the bulk checkbox.

Reuse `test/mocks/fixtures` rather than duplicating full domain rows.

**Verify**:

```bash
npm run test:nuxt -- DialogLoadTrack TableTrackEnrichmentReview
```

Expected: both focused files run and all cases pass.

### Step 4: Add dependency seams to local audio analysis

Add an optional `Partial<LocalAudioAnalysisDependencies>` parameter to
`useLocalAudioAnalysis`, merged with production defaults. The dependency shape
may include only what tests need to control:

- Worker creation and random request IDs;
- AudioContext/OfflineAudioContext creation;
- tag reading;
- cache read/write;
- time/progress reads;
- directory picker access when necessary.

Keep the no-argument API used by production components exactly equivalent.
Do not expose internal pending-request state or change processing order.

Tests must cover:

- filtering/sorting selected files;
- cached result avoids tag/analysis work;
- missing metadata triggers injected decode/Worker work;
- Worker success and error responses settle the matching request;
- cancellation terminates the Worker, rejects pending work, and stops the
  remaining batch;
- scope disposal terminates the Worker and clears pending work;
- cache-write failure is recorded without discarding completed source data;
- folder-picker cancellation is distinct from an unexpected picker failure.

**Verify**:

```bash
npm run test:nuxt -- useLocalAudioAnalysis
```

Expected: the focused test passes without browser permissions, audio decoding,
Worker threads, or network access.

### Step 5: Characterize IndexedDB cache behavior

Using the Nuxt IndexedDB mock, test:

- first write creates/upgrades the database and can be read back;
- missing key returns `null`;
- replacing a key returns the latest record;
- each operation closes its database connection;
- transaction failure rejects and closes cleanly.

If deterministic isolation requires a small exported test-only reset/close
helper, keep it narrowly named and do not expose it through application UI.

**Verify**:

```bash
npm run test:nuxt -- localAudioCache
```

Expected: the focused cache test passes repeatedly in one process with no state
leak between cases.

### Step 6: Run all gates

Run `npm run format`, `npm run test:nuxt`, `npm run verify`, and
`npm run build`.

**Verify**: all exit 0;
`git diff --name-only <implementation-start SHA>..HEAD` lists only scoped files
and tracker status if owned by the executor.

## Test plan

- Use fresh Pinia/component state per test and restore spies/globals after each
  case.
- No test may read `.env`, call Supabase/Discogs, open a real directory picker,
  decode real audio, or spawn the production Worker.
- Keep fixtures small and synthetic; no audio assets are needed.
- Do not assert incidental generated markup from reka-ui beyond the custom
  contracts being preserved.

## Done criteria

- [ ] `test:nuxt` exists, runs exactly one Nuxt project, and is included in
      `test:run`/`verify`.
- [ ] Existing unit/store/server and E2E suites remain green.
- [ ] Button/Checkbox application extensions have semantic characterization.
- [ ] Session picker focus/select/reset and enrichment staging behaviors are
      rendered-test protected.
- [ ] Worker success/error/cancel/dispose and IndexedDB read/write/failure paths
      have deterministic tests.
- [ ] No visible production behavior, algorithm parameter, cache key, or
      generated UI primitive changed.
- [ ] Production build passes and no out-of-scope files changed.

## STOP conditions

Stop and report if:

- Adding the Nuxt project skips, duplicates, or changes another Vitest project.
- Installing Vue Test Utils changes the resolved Vue version or conflicts with
  the repository's Vue override.
- A test requires production-only hooks beyond existing `data-testid` hooks.
- Passing a test requires modifying generated UI primitives or visible UI.
- Making local audio testable changes task ordering, cache identity, analysis
  parameters, or public result shapes.
- Tests require real credentials, network, audio files, filesystem permission,
  or browser permission dialogs.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Every component-heavy plan after this one must add/update Nuxt tests for its
  own contract rather than expanding this plan retroactively.
- Keep injected local-audio dependencies optional and defaulted in one place so
  production callers never construct them.
- Reviewers should watch for tests coupled to class ordering or implementation
  details instead of observable behavior.
