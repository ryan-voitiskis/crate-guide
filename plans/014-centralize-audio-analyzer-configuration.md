# Plan 014: Centralize and version audio-analyzer configuration

> **Executor instructions**: Preserve every analyzer value and cache key. This
> plan changes configuration ownership and benchmark provenance, not algorithm
> behavior. Run every gate and stop if runtime sharing requires copies or value
> changes. Update the tracker when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   shared/config/localAudioAnalysis.json \
>   app/utils/localAudio.ts \
>   app/utils/localAudio.test.ts \
>   app/workers/localAudioAnalysis.worker.ts \
>   scripts/benchmark-local-audio.cjs \
>   scripts/benchmark-local-audio.test.cjs \
>   package.json
> ```
>
> Run `git status --short`. Plans 005 and 006 must be DONE so `.cjs` formatting,
> the aggregate gate, and Worker/browser tests are available.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 005 and Plan 006
- **Category**: tech-debt
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Production cache/version/threshold constants, Worker algorithm parameters, and
the Node benchmark's defaults are independently hardcoded. They currently
align, but either runtime can drift while benchmark results continue to appear
representative of production. This plan establishes one runtime-neutral JSON
source and makes benchmark output identify the effective configuration that
produced it.

## Current state

- `app/utils/localAudio.ts:9-15` defines analyzer/configuration/metadata
  versions, sample rate, maximum analysis duration, and confidence thresholds.
- `app/workers/localAudioAnalysis.worker.ts:100-145` hardcodes
  `RhythmExtractor2013` and `KeyExtractor` positional parameters.
- `scripts/benchmark-local-audio.cjs:8-18` duplicates sample rate, duration,
  profile/layout/rhythm defaults and accepts environment overrides.
- Benchmark `analyze` repeats the production Essentia calls at roughly lines
  184-220, while result/summary output at lines 278-318 omits analyzer/config
  identity, sample rate, rhythm method, and layout.
- `getLocalAudioCacheKey` includes analyzer/configuration/metadata versions.
  Since no value changes in this plan, the cache key must remain byte-identical.
- `docs/track-enrichment.md:40-49` uses benchmark results to justify production
  confidence thresholds; Plan 016 updates the documentation after this lands.

## Commands you will need

| Purpose                  | Command                                                      | Expected on success                   |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------- |
| Application config tests | `npx vitest run --project unit app/utils/localAudio.test.ts` | exit 0                                |
| Benchmark config tests   | `npm run test:audio-config`                                  | exit 0                                |
| Nuxt composable tests    | `npm run test:nuxt -- useLocalAudioAnalysis`                 | exit 0                                |
| Full verification        | `npm run verify`                                             | exit 0 and includes audio-config test |
| Build                    | `npm run build`                                              | exit 0; Worker bundles JSON config    |
| Format                   | `npm run format`                                             | exit 0                                |

## Scope

**In scope**:

- `shared/config/localAudioAnalysis.json` (create)
- `app/utils/localAudio.ts`
- `app/utils/localAudio.test.ts`
- `app/workers/localAudioAnalysis.worker.ts`
- `scripts/benchmark-local-audio.cjs`
- `scripts/benchmark-local-audio.test.cjs` (create)
- `package.json`
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Any parameter, threshold, configuration version, analyzer version, metadata
  version, cache key, or production staging policy change.
- New Essentia dependency/version, audio decoding layout, distributed-analysis
  adoption, or benchmark run against private files.
- Worker/composable lifecycle refactor already covered by Plan 006.
- Enrichment workflow refactor from Plan 013.
- Documentation changes; Plan 016 owns final docs.
- Generated code or build-time config generator.

## Git workflow

- Branch: `codex/014-centralize-audio-config`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `refactor(audio): centralize analyzer configuration`.
- Do not push or open a PR unless instructed.

## Shared configuration shape

Create plain JSON containing the current values for:

- analyzer version and configuration version;
- sample rate and maximum analysis duration;
- minimum BPM confidence and key strength;
- rhythm extractor maximum tempo, method, and minimum tempo;
- all positional KeyExtractor parameters, named
  `averageDetuningCorrection`, `frameSize`, `hopSize`, `hpcpSize`,
  `maximumFrequency`, `maximumSpectralPeaks`, `minimumFrequency`,
  `pcpThreshold`, `profile`, `sampleRate`, `spectralPeaksThreshold`,
  `tuningFrequency`, `weightType`, and `windowType`.

Use clear nested names and immutable consumption. Benchmark-only environment
overrides remain outside the shared object and produce an effective copied
configuration; they must never mutate the imported object.

## Steps

### Step 1: Capture parity and cache-key regressions first

Extend application tests with exact assertions for current exported constants,
analysis window behavior, and a fixed cache-key fixture containing:

- current analyzer/configuration/metadata versions;
- relative path, size, and last-modified fields.

Create a Node test for benchmark effective configuration and environment
override behavior. It must not load audio files or execute Essentia analysis.

**Verify**: current cache-key expectation is recorded before code movement.

### Step 2: Introduce the shared JSON and derive application constants

Add the JSON with every current literal exactly. Import it in `localAudio.ts`
and export the existing constant names from its values so callers do not
change. Keep metadata version in application code if it is not analyzer
configuration, but preserve its cache-key position/value.

**Verify**: application tests pass and the fixed cache key is byte-identical.

### Step 3: Replace Worker positional literals with named configuration

In `app/utils/localAudio.ts`, export two readonly tuples derived from the JSON:

- `LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS`, ordered as maximum tempo, method, minimum
  tempo;
- `LOCAL_AUDIO_KEY_EXTRACTOR_ARGS`, ordered exactly as the fourteen named key
  fields in the configuration-shape list above.

Extend `app/utils/localAudio.test.ts` to assert both tuple values and order
against the current literals. Import the tuples into the Worker and make the
only production call sites exactly:

```ts
essentia.RhythmExtractor2013(signal, ...LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS)
essentia.KeyExtractor(signal, ...LOCAL_AUDIO_KEY_EXTRACTOR_ARGS)
```

Add a nearby comment that the tuple order is the Essentia positional API
boundary. No test needs to import the side-effectful Worker module; the unit
test owns tuple order and the static call-site check below proves the Worker
spreads those tested tuples.

Do not change the order or value of any argument. Keep output metadata and
memory cleanup unchanged.

**Verify**:

```bash
npx vitest run --project unit app/utils/localAudio.test.ts
test "$(rg -o --fixed-strings 'essentia.RhythmExtractor2013(' app/workers/localAudioAnalysis.worker.ts | wc -l | tr -d '[:space:]')" -eq 1
test "$(rg -o --fixed-strings 'essentia.KeyExtractor(' app/workers/localAudioAnalysis.worker.ts | wc -l | tr -d '[:space:]')" -eq 1
rg -q -U --pcre2 '(?s)essentia\.RhythmExtractor2013\(\s*signal,\s*\.\.\.LOCAL_AUDIO_RHYTHM_EXTRACTOR_ARGS\s*\)' app/workers/localAudioAnalysis.worker.ts
rg -q -U --pcre2 '(?s)essentia\.KeyExtractor\(\s*signal,\s*\.\.\.LOCAL_AUDIO_KEY_EXTRACTOR_ARGS\s*\)' app/workers/localAudioAnalysis.worker.ts
npm run test:nuxt -- useLocalAudioAnalysis
npm run build
```

Expected: every command exits 0. The counts prove there is one production call
per extractor, and each positive assertion proves that sole call spreads the
tested tuple rather than positional literals.

### Step 4: Make the benchmark consume and report effective configuration

Refactor the CommonJS script so importing it for tests does not execute the
CLI or initialize Essentia. Export a pure function that combines shared defaults
with existing environment overrides. Keep `require.main === module` as the CLI
entry.

Use shared values for sample rate, duration, rhythm bounds/method, key defaults,
and extractor arguments. Preserve `ESSENTIA_KEY_PROFILES`,
`ESSENTIA_ANALYSIS_LAYOUT`, `ESSENTIA_RHYTHM_METHOD`, and estimates override
semantics.

Export a pure `buildBenchmarkMetadata(effectiveConfig, essentiaRuntimeVersion)`
and a pure `buildBenchmarkOutput(results, summary, metadata)`. The CLI must pass
all raw result rows and the raw summary through `buildBenchmarkOutput` before
serializing them; it attaches the same immutable `analysisMetadata` value to
every result and to the summary.

`analysisMetadata` must contain:

- analyzer and configuration version;
- sample rate and max duration;
- rhythm method/bounds;
- key profile(s), layout, and estimates flag;
- Essentia runtime version when initialized.

Do not print manifest paths beyond existing behavior or any environment value
unrelated to these non-sensitive config overrides.

Node tests must pass two synthetic result rows and one summary through the pure
builder and assert that all three outputs contain every field above with the
exact effective values. They must also prove default parity and that overrides
create a new effective object without mutating imported JSON.

**Verify**: `node --test scripts/benchmark-local-audio.test.cjs` exits 0 without
loading audio, ffmpeg, or Essentia.

### Step 5: Add the tool test to verification

Add `test:audio-config` using Node's built-in test runner, and append it to the
existing `verify` script from Plan 005 without duplicating other gates.

**Verify**: `npm run test:audio-config && npm run verify` → both exit 0.

### Step 6: Run full build/regression

Run `npm run format`, focused application/Node/Nuxt tests, `npm run verify`, and
`npm run build`.

**Verify**: all exit 0; the production Worker bundle resolves the JSON; only
declared files changed.

## Test plan

- Assert exact current values, not approximate parity.
- Fixed cache-key test prevents accidental cache invalidation.
- Benchmark test imports pure configuration code and never needs a manifest,
  ffmpeg, audio, or Essentia execution.
- Environment override tests isolate/restore `process.env` and prove shared JSON
  is unchanged.
- Pure output-builder tests assert every synthetic result and the summary carry
  complete, exact `analysisMetadata`.
- Tuple tests plus the Worker call-site search guard exact argument order; Plan
  006 composable tests guard Worker lifecycle behavior.

## Completion and reconciliation

- Implemented by commit `e08952fe3331dc6550df7b3ac590543109fdfa52`,
  integrated as `88ba08174db3915ac083cd18e70e1fd75e22ddbe`.
- `app/utils/localAudio.ts` deliberately retains the relative JSON import
  `../../shared/config/localAudioAnalysis.json`; standalone unit Vitest does
  not resolve Nuxt's `~~` alias.
- Application coverage asserts exact analyzer/configuration/metadata versions,
  sample rate, duration, thresholds, and the byte-stable cache-key fixture.
  Tuple coverage asserts all three rhythm arguments and all fourteen key
  arguments in positional order, while Worker call-site checks prove one call
  per extractor spreading those tuples.
- Benchmark coverage proves shared-default parity, immutable environment
  overrides, and extractor tuple order. CLI provenance checks prove one call per
  extractor, effective configuration flowing through decode/analysis, runtime
  metadata attached to two result rows and the summary, and output serialized
  only through the tested builder.
- Verified gates: `npm run format`, `npm run format:check`, `npm run lint`,
  `npm run typecheck`, the focused application and benchmark configuration
  tests, `npm run test:nuxt -- useLocalAudioAnalysis`, `npm run verify`,
  `npm run build`, and `git diff --check` all exited 0.

## Done criteria

- [x] One JSON file owns every shared production/benchmark analyzer default.
- [x] Worker and benchmark contain no duplicate parameter literals covered by
      the shared config.
- [x] Every value, version, threshold, and cache key remains unchanged.
- [x] Benchmark output records the effective configuration and runtime version.
- [x] Environment overrides remain supported without mutating defaults.
- [x] Application, Node, Nuxt, full verification, and build pass.
- [x] No private manifest/audio data or out-of-scope change exists.

## STOP conditions

Stop and report if:

- JSON cannot be bundled in the Vite Worker and consumed from CommonJS without
  a runtime-specific duplicate.
- Any analyzer parameter, threshold, version, or cache-key byte would change.
- Sharing configuration requires a dependency or generation/build step.
- Testing the benchmark requires a private manifest, ffmpeg, or real audio.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Any future algorithm parameter change must update the shared configuration
  version and intentionally decide cache invalidation.
- Keep the relative shared-config import unless the standalone unit Vitest
  project gains an explicit `~~` alias.
- Benchmark output is valid evidence only when its effective config metadata
  matches production.
