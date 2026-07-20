# Plan 056: Make the audio benchmark testable

> **Executor instructions**: Keep benchmark output and accepted valid
> configuration stable. Extract configuration and runner boundaries, replace
> source-regex assertions with executed behavior, use injected local adapters,
> and commit conventionally.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tooling / validation / test quality
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

`benchmark-local-audio.cjs` trims key-profile entries but does not consistently
normalize layout or rhythm-method overrides; whitespace can become an invalid
runtime value. Its test suite deliberately preserves part of that behavior and
verifies CLI routing through regular expressions over source text. Harmless
refactors can fail while broken runtime routing can pass. At 426 lines, parsing,
comparison, process execution, and report formatting also lack clear boundaries.

## Scope

Modify/create:

- `scripts/benchmark-local-audio.cjs`
- small CommonJS modules under `scripts/` for configuration, comparison, and
  runner behavior
- `scripts/benchmark-local-audio.test.cjs`
- benchmark documentation/examples if accepted configuration becomes clearer

Do not change feature extraction algorithms, benchmark corpus data, result
thresholds, Essentia/ffmpeg binaries, or production local-audio worker behavior.

## Drift check

```bash
git status --short
wc -l scripts/benchmark-local-audio.cjs scripts/benchmark-local-audio.test.cjs
rg -n "KEY_PROFILES|LAYOUT|RHYTHM|trim|readFile|regex|source" scripts/benchmark-local-audio*
```

STOP if current external users rely on whitespace as a meaningful override, or
if the benchmark cannot inject command execution without changing its CLI.

## Required implementation

1. Centralize configuration normalization.
   - Trim every scalar override consistently.
   - Empty/whitespace values use the documented default or fail with one clear
     diagnostic; do not pass an empty profile list or whitespace method name.
   - Validate enumerated layout/method/profile values before starting ffmpeg or
     Essentia.

2. Extract cohesive pure boundaries.
   - Configuration parsing, manifest parsing, result comparison, and report
     formatting become pure functions.
   - Process/file adapters own I/O and are injected into the CLI runner.
   - Keep the top-level CommonJS entry small and preserve exit codes/output for
     valid invocations.

3. Replace source-text tests with execution.
   - Invoke the runner with fake adapters and assert exact routed arguments,
     order, output, and exit/error behavior.
   - Cover whitespace/defaults, invalid enumerations, empty profiles, missing
     files, child failure, and a successful multi-profile run.
   - Keep one optional disposable smoke against installed local tools; it must
     not download binaries or modify corpus files.

## Test plan

```bash
npm run format
npm run test:audio-config
npm run check:conventions
npm run verify
git diff --check
```

If the local benchmark corpus and binaries are available, run one documented
small manifest smoke and record the output path without committing generated
artifacts.

## Done criteria

- [ ] Whitespace and enumerated overrides are normalized and validated consistently.
- [ ] Configuration, manifest, comparison, and process-running responsibilities are separate.
- [ ] CLI routing tests execute behavior rather than regex-match implementation source.
- [ ] Valid CLI output and exit behavior remain compatible.
- [ ] Audio tooling and full repository gates pass.

## STOP conditions

Stop if extraction changes benchmark calculations, if tests require real media
or network access, if adapter injection leaks into production audio code, or if
a valid documented invocation changes without an explicit migration note.

## Git workflow

- Branch: `codex/056-make-audio-benchmark-testable`
- Commit: `refactor(tooling): make audio benchmark testable`
