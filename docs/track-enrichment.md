# Track Enrichment

Crate Guide enriches Discogs-imported tracks from a standard Rekordbox
`DJ_PLAYLISTS` XML export or local audio files. Parsing, tag reads, decoding,
and Essentia analysis stay in the browser until a user reviews and applies
staged changes.

## Workflow

1. The Tracks page surfaces missing BPM/key values and links to the workflow.
2. The user chooses Rekordbox XML or local audio.
3. The Rekordbox path parses a collection export with
   `app/utils/rekordboxXml.ts`.
4. The local path scans embedded metadata first. Missing values can be analyzed
   in explicit batches when the file passes the local decode-safety policy; all
   other files remain available as tags-only results.
5. `app/utils/trackEnrichment.ts` matches either source to loaded Crate Guide
   tracks and records.
6. `useTrackEnrichmentWorkflow` owns source selection, parse/match progress,
   stale-operation protection, filtering, staging, apply review, and the ordered
   `updateTracksBatch` write.
7. The thin `app/pages/enrichment.vue` route loads the collection and binds the
   composable to the source, review, and result components.
8. Staged updates are confirmed before the composable persists them.

The product names this destination **BPM & Key** rather than “Enrichment” in
navigation. The user-facing label describes the outcome; the route and internal
domain naming remain source-agnostic for future analyzers.

The product has no runtime dependency on Rekordbox itself or on tools that can
generate compatible XML.

## Data Invariants

- Existing BPM, key, and mode values are never overwritten.
- Key and mode are written only as an atomic pair.
- `key: 0` is valid and must not be treated as blank.
- Batch writes add null preconditions to the database query, protecting the
  fill-only rule if a track changes after review.
- Absolute local file paths are never persisted. Provenance contains only a
  sanitized relative `locationHint`.
- `audio_features` is merged by source key, preserving provenance from
  Rekordbox XML, embedded tags, and Essentia independently.
- Embedded tags are preferred over analyzed values for the same field.
- Essentia values are never staged automatically, even when the track match is
  high confidence. The user must confirm them in the review table.
- Essentia BPM is proposed only when `RhythmExtractor2013` confidence is at
  least `1.5`. Lower-confidence output remains in provenance.
- Essentia key is proposed only when internal strength is at least `0.8`, and
  always requires manual confirmation. A 30-track private benchmark found
  substantial disagreement with Rekordbox across all tested key profiles; that
  is treated as source uncertainty rather than proof that either source is
  ground truth.
- Benchmark cases manually verified as beatless ambient material produced
  low-confidence tempo output and were correctly withheld by the BPM threshold.

## Local Analysis

`useLocalAudioAnalysis` owns folder traversal, cache reads/writes, Web Audio
decoding, Worker request lifecycles, cancellation, and the sequential processing
queue. `music-metadata` reads tags without cover artwork or an exhaustive
duration scan or post-header search; duration is optional matching evidence and
is recovered from a validated WAV header or successful decode when available.
Large-folder status updates are throttled so processing does not repeatedly
recount the complete file list.

Before any whole-file `arrayBuffer` call, AudioContext creation, or Web Audio
decode, `app/utils/localAudioDecodePolicy.ts` reads at most the first 1 MiB and
applies the checked-in total-peak envelope. Only a standard RIFF/WAVE file with
16-bit or 24-bit integer PCM, a `fmt ` and `data` header inside that slice, no
more than two channels, a sample rate no higher than 192 kHz, internally
consistent byte rates, and a total estimate at or below 256 MiB may enter the
whole-file Web Audio path. Unsupported, corrupt, unknown, or oversized input is
kept as embedded tags and shown as **Tags only**; it is not silently retried
through the full decoder.

The `whole-file-pcm-wav-v1` estimate is:

```text
2 × file bytes
+ bounded header bytes
+ 2 × (duration × max(source rate, 44,100) × channels × 4-byte decoded samples)
+ 3 × (min(duration, 180s) × 44,100 × 4-byte analysis samples)
+ 32 MiB fixed safety margin
```

These terms conservatively cover the retained `File` and full input
`ArrayBuffer`, decoded PCM plus native decoder working storage at the larger of
the source and requested output rates, mono/resampled analysis data plus
Worker/WASM ownership or copies, and fixed browser/cache overhead. The adapter
requests a 44.1 kHz AudioContext and verifies that rate before reading the full
file; a browser that does not honor it stays tags-only. Arithmetic overflow,
missing duration, or metadata outside the validated limits fails closed. The
centered 180-second window bounds Essentia input only; it does **not** by itself
bound whole-file decode memory.

| Input                                      | Current result                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Validated 16/24-bit PCM WAV within 256 MiB | Whole-file decode, centered analysis window, then Essentia                         |
| PCM WAV above the envelope                 | Tags only: `Analysis skipped: file exceeds the safe decode budget`                 |
| Corrupt or incomplete WAV metadata         | Tags only: metadata cannot prove safe decoding                                     |
| AIFF/AIFC, RF64, float/extensible WAV      | Tags only: no verified safe browser decoder                                        |
| MP3, AAC/ALAC, FLAC, Ogg/Opus, APE, WV     | Embedded tags only until a genuinely bounded codec adapter is independently proven |

No partial decoder is shipped. The WebCodecs/demuxer spike stopped at the plan's
safety gate: wrapping a decoder is not enough evidence that demuxing, seek, and
frame allocation are bounded. A future format adapter must cap decoded frames,
support cancellation, pass generated browser fixtures in CI, meet the benchmark
parity tolerance, and have acceptable browser support and licensing before the
matrix above can be broadened.

For admitted audio, a continuous center segment of up to three minutes is mixed
to mono, resampled to 44.1 kHz when needed, and transferred to
`app/workers/localAudioAnalysis.worker.ts`. A private benchmark found that
concatenating separate windows could introduce a 2:3 tempo error on a manually
verified track; the continuous center segment recovered its approximately 156
BPM beatgrid.

The worker runs `RhythmExtractor2013` and `KeyExtractor` over that segment.
Results are cached in the dedicated `crate-guide-local-audio` IndexedDB analysis
cache using the analyzer version, configuration version, metadata-reader
version, sanitized relative path, file size, and modification time. Absolute
paths are not part of the key or stored provenance. Raw audio, file handles, and
unfinished review state are never cached.

This database is disposable acceleration state, not durable library storage and
not a backup. A future accountless library must use a different database and
must not add stores to this cache. Settings reports the result count and last
successful maintenance time, and offers a confirmed **Clear cache** action that
clears only the analysis-result and cache-metadata stores.

Each scan opens one schema-v2 connection, prefetches cache keys in 250-key
readonly transactions, and buffers writes in groups of 100. The connection
closes after success, failure, a blocked/version-changing upgrade, cancellation,
or scope disposal. A blocked upgrade is reported instead of deleting the old
cache; the v1-to-v2 upgrade preserves results and adds the `updatedAt` index and
cache-metadata store.

Maintenance runs at the start and end of a scan in this fixed order:

1. Remove keys from obsolete analyzer/configuration/tag-reader generations.
2. Remove writes strictly older than 90 days.
3. Remove the oldest writes above the 20,000-result cap.

The policy is deliberately oldest-write eviction, not LRU. Cache hits do not
rewrite `updatedAt`, avoiding a write and transaction for every hit. Deletes are
chunked in groups of 500, and keys written by the active session are protected
from that session's pruning pass. Maintenance is best-effort: cache failure is
shown as a warning, while scanned metadata and analysis remain available for the
current review.

The Essentia Worker is lazy and sequential. It is reused by another immediate
batch, then terminated after 30 seconds idle so its WASM heap is released. It is
also terminated on explicit stop, component disposal, or KeepAlive deactivation
when no batch is active. Deactivation never kills active work; if a background
batch finishes while inactive, the Worker terminates at completion.

Folder access uses the File System Access API where available and falls back to
`webkitdirectory`. No audio bytes are sent to Crate Guide's server.

### Cache performance budget

`shared/config/localAudioCache.json` owns connection, chunk, retention, Worker
idle, and performance budgets. Before the session refactor, a serial cache hit
opened one database/transaction per file and a cold entry opened two. The
following before/after rows were captured on 22 July 2026 with the same Vitest
Browser / Playwright HeadlessChrome 147 runner. Wall times are regression
signals for this runner, not product latency promises.

| Scenario    | Baseline connections / transactions / ms | Session connections / transactions / ms |
| ----------- | ---------------------------------------: | --------------------------------------: |
| 1,000 hits  |                    1,000 / 1,000 / 119.4 |                           1 / 16 / 18.9 |
| 10,000 hits |                10,000 / 10,000 / 1,208.4 |                          1 / 88 / 179.0 |
| 1,000 cold  |                    2,000 / 2,000 / 268.5 |                          1 / 24 / 144.6 |
| 10,000 cold |                20,000 / 20,000 / 2,906.0 |                       1 / 168 / 1,847.4 |

Browser rows also record Worker starts and post-session heap when Chromium
exposes `performance.memory`. Cache-only scans must start zero Workers. The
checked-in heap-growth ceiling is 64 MiB; unsupported memory APIs produce an
explicit `null` metric rather than failing the functional cache test. Worker
creation/reuse/idle termination is instrumented separately at the composable
boundary because a window's JS heap is not a complete measure of a Worker's
WASM/native memory.

## Analyzer Configuration and Cache Maintenance

`shared/config/localAudioAnalysis.json` is the shared owner of production
analyzer identity, configuration identity, sample/window limits, decode-safety
policy, confidence thresholds, and Essentia extractor parameters.
`app/utils/localAudio.ts` maps the analyzer fields to the positional arguments
consumed by the Worker. The private benchmark script also starts from the same
JSON defaults, then applies explicit environment overrides to an immutable
effective configuration.

The benchmark writes selected effective settings into `analysisMetadata` on
every result and on its summary: analyzer/configuration versions, sample rate,
maximum analysis duration, the complete decode-safety policy,
rhythm-extractor settings, selected key profiles, analysis layout, estimate
inclusion, and the loaded Essentia runtime version. It does not claim to
serialize every threshold or key-extractor field, so retain the shared JSON and
benchmark environment alongside any private research result.

Cache invalidation is manual and deliberate. Any change to analyzer output or
extractor arguments must also change `configurationVersion` in the shared JSON.
An analyzer implementation/dependency change must update `analyzerVersion`; a
tag-reader behavior change must update `LOCAL_AUDIO_METADATA_VERSION` in
`app/utils/localAudio.ts`. These values are part of the cache key, so the version
bump prevents new result behavior from reusing old results. Decode admission is
versioned separately by `decodeSafety.policyVersion`: an existing completed
analysis can be reused without reading or decoding the file, while every new
decode must pass the current safety policy. Research-only benchmark overrides
do not change production cache identity and must not be promoted without
updating the shared configuration and its applicable version.

## Matching Policy

Artist identity is required before a title match is considered. Exact and
small fuzzy title/artist matches can become high confidence when album or
duration evidence corroborates them. Partial artist matches, close competing
candidates, duration conflicts, existing-value conflicts, and duplicate XML
claims on one track require manual review or are blocked.

Duration comparison accounts for Discogs vinyl timing variance:

- Up to 8 seconds: corroborates the match.
- More than 8 and up to 30 seconds: neutral with a warning.
- More than 30 seconds: conflict requiring manual review.

## Persistence

Top-level `tracks.bpm`, `tracks.key`, and `tracks.mode` remain the consumer
surface used by track recommendations. Versioned provenance and raw source
metadata live in `tracks.audio_features`; its application type is defined in
`shared/types/audioFeatures.ts`.

The database column is introduced by
`supabase/migrations/20260709120000_add_track_audio_features.sql`. Generated
Supabase types must be refreshed whenever that schema changes.

## Validation

Use the focused suites while changing matcher, workflow, Worker, cache, or
configuration behavior:

```bash
npx vitest run --project unit \
  app/utils/trackEnrichment.test.ts \
  app/utils/localAudio.test.ts \
  app/utils/localAudioDecodePolicy.test.ts
npx vitest run --project stores \
  app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts
npx vitest run --project nuxt \
  test/nuxt/enrichment-page.nuxt.test.ts \
  test/nuxt/CardLocalAudioCache.nuxt.test.ts \
  test/nuxt/PanelTrackEnrichmentLocalAudio.nuxt.test.ts \
  test/nuxt/useLocalAudioAnalysis.nuxt.test.ts \
  test/nuxt/localAudioCache.nuxt.test.ts
npm run test:audio-config
npm run test:browser
npm run verify
npm run build
```

The rendered enrichment-page suite protects the thin route's collection-load
and workflow bindings. The Nuxt local-audio suites exercise the tags-only UX,
budget refusal, decoder failure, Worker success/failure, cancellation, and
disposal through injected boundaries. Generated unit fixtures cover exact
budget boundaries, corrupt headers, extreme metadata, and unsupported
containers without committing media. The browser suite generates disposable
16-bit and 24-bit PCM WAVs and exercises Chromium's real `decodeAudioData`
implementation after policy admission. `app/utils/localAudio.test.ts` pins the
shared config mapping and cache-key versions, while
`scripts/benchmark-local-audio.test.cjs` pins effective benchmark settings and
machine-readable output metadata.

Use a sanitized XML fixture for automated tests. Real collection exports may be
used for local browser verification but must not be committed.

For local analyzer research, create a private tab-separated manifest with
`path`, expected BPM, expected key, artist, and title columns, then run:

```bash
node scripts/benchmark-local-audio.cjs /path/to/private-manifest.tsv
```

The benchmark requires `ffprobe` and `ffmpeg` on `PATH` as well as the local
audio, manifest, and analyzer dependencies.

For private memory profiles, record the date, OS and machine model/RAM, browser
and version, analyzer/runtime versions, `decodeSafety.policyVersion`, source
container/codec/sample rate/channel count/bit depth/duration/file size, policy
decision and estimate, observed browser-process and OS peak, result parity, and
cancellation behavior. Include short and long compressed and uncompressed
cases, but keep the manifest, raw measurements containing paths, and all media
outside the repository. Browser JS heap numbers alone are not evidence for
native decoder or AudioBuffer memory. CI uses only generated disposable
fixtures; a private file must never be made a required test dependency.

Benchmark overrides are trimmed before use. Empty or whitespace-only values
fall back to the shared analyzer defaults. Supported overrides are:

- `ESSENTIA_KEY_PROFILES`: a comma-separated list containing `diatonic`,
  `krumhansl`, `temperley`, `weichai`, `tonictriad`, `temperley2005`, `thpcp`,
  `shaath`, `gomez`, `noland`, `edmm`, `edma`, `bgate`, or `braw`
- `ESSENTIA_ANALYSIS_LAYOUT`: `center` or `distributed`
- `ESSENTIA_RHYTHM_METHOD`: `multifeature` or `degara`
- `ESSENTIA_INCLUDE_ESTIMATES`: `0` or `1`

Unsupported values fail before ffmpeg or Essentia starts. Use
`ESSENTIA_ANALYSIS_LAYOUT=distributed` only to compare research configurations;
do not use distributed output as production evidence without checking it
against the continuous center layout. Do not commit manifests, benchmark
output, collection paths, or audio files.

To opt into the disposable installed-tool smoke test, point
`ESSENTIA_BENCHMARK_SMOKE_MANIFEST` at a small private local manifest and run
`npm run test:audio-config`. The test never downloads tools or modifies corpus
files and remains skipped when that variable is absent.
