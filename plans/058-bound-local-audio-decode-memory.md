# Plan 058: Bound local-audio decode memory before analysis

> **Executor instructions**: Treat renderer memory as a hard safety boundary.
> Add a refusal/tags-only path before attempting any new decoder. Do not claim
> a 180-second memory bound unless the bytes decoded are actually bounded.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/composables/useLocalAudioAnalysis.ts app/utils/localAudio.ts shared/config/localAudioAnalysis.json docs/track-enrichment.md test/nuxt/useLocalAudioAnalysis.nuxt.test.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 056
- **Category**: bug / performance / resource safety
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

The workflow limits Essentia input to a centered 180-second window only after
`decodeAudioData` has expanded the complete file. Long recordings can allocate
gigabytes and crash the renderer before the advertised bound helps. The safe
first guarantee is bounded resource use with an honest tags-only fallback;
partial analysis may be added only through a genuinely bounded decode path.

## Current state

- `app/composables/useLocalAudioAnalysis.ts:330-381` does this in order:

```ts
const decoded = await context.decodeAudioData(await file.arrayBuffer())
const { analyzedDurationSeconds, analysisOffsetSeconds } =
	getLocalAudioAnalysisWindow(decoded.duration)
```

- `shared/config/localAudioAnalysis.json` limits analysis duration, not decode.
- `docs/track-enrichment.md:56-79` currently describes the 180-second window as
  a memory-safety property.
- `music-metadata` is already exact-pinned and is the existing tag boundary;
  use metadata/header inspection without decoding audio samples.

## Commands you will need

| Purpose        | Command                                                                      | Expected on success |
| -------------- | ---------------------------------------------------------------------------- | ------------------- |
| Audio config   | `npm run test:audio-config`                                                  | all pass            |
| Nuxt tests     | `npx vitest run --project nuxt test/nuxt/useLocalAudioAnalysis.nuxt.test.ts` | all pass            |
| Browser worker | `npm run test:browser`                                                       | all pass            |
| Full gate      | `npm run verify`                                                             | exit 0              |

## Scope

**In scope**:

- `app/composables/useLocalAudioAnalysis.ts`
- `app/utils/localAudio.ts` and focused tests
- `app/types/localAudio.ts`
- a bounded decode-policy/adapter module and worker if the spike proves viable
- `shared/config/localAudioAnalysis.json`
- generated ephemeral audio fixtures plus the private/manual benchmark protocol
  from Plan 056; no corpus media is committed
- `test/nuxt/useLocalAudioAnalysis.nuxt.test.ts`
- `docs/track-enrichment.md` and privacy copy if behavior changes

**Out of scope**:

- uploading audio or server-side analysis
- silently analyzing a different segment
- increasing concurrency to hide decode cost
- cache lifecycle work (Plan 066)

## Git workflow

- Branch: `codex/058-bound-local-audio-decode-memory`
- Commit: `fix(audio): bound decode memory before analysis`

## Steps

### Step 1: Establish a checked-in total-peak envelope

Extend Plan 056's benchmark protocol, not its repository corpus. CI generates
deterministic temporary WAV/AIFF/container-header fixtures outside the source
tree and uses instrumented decode adapters for refusal/allocation boundaries.
Private, legally held short/long compressed and uncompressed media supplies the
manual browser profile. A format may ship on the bounded path only when an
ephemeral/open fixture can exercise that decoder in CI; otherwise it remains
tags-only even if the private profile looks promising.

Measure or conservatively account for input `File`/slice bytes, any `ArrayBuffer`,
native decoder storage, decoded channel PCM, mixdown, OfflineAudioContext or
resample output, Worker transfer/copy overhead, and retained/cache state. JS
heap alone is not a complete measurement of native audio memory. Freeze the
supported browser/machine protocol and a conservative total-peak envelope plus
safety margin before evaluating the implementation; the PCM calculation
`duration * sampleRate * channels * 4` is only one term.

**Verify**: benchmark config tests pass and emit stable machine-readable rows.

### Step 2: Gate before `arrayBuffer` or `decodeAudioData`

Inspect duration/sample rate/channel metadata through bounded header slices,
without `file.arrayBuffer()` or full sample decode. If the conservative total
peak exceeds the configured envelope, metadata is insufficient to prove it is
safe, or the browser lacks the required bounded path, skip sample
analysis and keep embedded tags. Mark the row visibly as `Analysis skipped:
file exceeds the safe decode budget`; allow explicit retry only when a bounded
adapter is available. Never silently fall back to the current full decode.

**Verify**: a synthetic two-hour file never calls `file.arrayBuffer`,
`decodeAudioData`, OfflineAudioContext, or the Essentia worker.

### Step 3: Spike a bounded segment decoder behind an adapter

In a worker, evaluate WebCodecs plus a maintained demuxer (or another
browser-local, license-compatible decoder) against the supported extension
matrix. The adapter must seek/demux only the chosen center window, cap decoded
frames before allocation, support cancellation, and return the same mono 44.1
kHz contract. Exact-pin any dependency and add its licence to notices.

Ship the adapter only for formats/browsers whose tests prove bounded decode and
numerically acceptable BPM/key parity. Unsupported cases stay tags-only. STOP
and report the support matrix instead of shipping a wrapper that still decodes
the full file.

**Verify**: long-file browser fixtures stay under the checked-in memory budget
and short-file results remain within the benchmark tolerance.

### Step 4: Correct progress and documentation

Separate `reading metadata`, `decoding bounded segment`, `analyzing`, and
`tags only` states. Correct docs so the guarantee matches actual format/browser
support and says files remain on-device.

**Verify**: Nuxt, browser, audio-config, convention, and full gates pass.

## Test plan

- Boundary estimates immediately below/above the budget.
- Missing/corrupt duration, extreme channel/sample-rate metadata, cancellation,
  unsupported codec, adapter error, and short-file regression.
- CI-generated temporary fixtures assert no whole-file read on rejection and
  enforce adapter allocation/frame caps. The versioned private-corpus protocol
  records long compressed/uncompressed browser profiles without committing or
  requiring private media in CI.

## Done criteria

- [ ] No file is fully decoded unless its conservative total-peak envelope is within the explicit budget.
- [ ] Oversized/unknown files retain tags and show an honest recoverable status.
- [ ] Any partial decoder proves bounded frames, cancellation, and benchmark parity per supported format.
- [ ] Documentation no longer overstates the 180-second guarantee.

## STOP conditions

Stop if metadata inspection itself requires full decode, if partial decoding
cannot be shown to be bounded, if parity falls outside Plan 056 tolerance, or
if a proposed decoder's licence/browser support is unsuitable.

## Maintenance notes

The safe tags-only fallback is an acceptable shipped result. Future codec
support must join the same format matrix and memory tests; do not broaden it by
extension alone.
