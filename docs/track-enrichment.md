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
   in explicit batches by an Essentia Web Worker.
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
duration scan; duration is optional matching evidence and is recovered if a
file is later decoded. Large-folder status updates are throttled so processing
does not repeatedly recount the complete file list. Audio that still needs BPM
or key is decoded with the Web Audio API. A continuous center segment of up to
three minutes is mixed to mono, resampled to 44.1 kHz when needed, and
transferred to `app/workers/localAudioAnalysis.worker.ts`. Bounding the segment
avoids renderer memory failures on long uncompressed files while skipping
DJ-oriented intro and outro sections. A private benchmark also found that
concatenating separate windows could introduce a 2:3 tempo error on a manually
verified track; the continuous center segment recovered its approximately 156
BPM beatgrid.

The worker runs `RhythmExtractor2013` and `KeyExtractor` over that segment.
Results are cached in IndexedDB using the analyzer version, configuration
version, metadata-reader version, sanitized relative path, file size, and
modification time. Absolute paths are not part of the key or stored provenance.

Folder access uses the File System Access API where available and falls back to
`webkitdirectory`. No audio bytes are sent to Crate Guide's server.

## Analyzer Configuration and Cache Maintenance

`shared/config/localAudioAnalysis.json` is the shared owner of production
analyzer identity, configuration identity, sample/window limits, confidence
thresholds, and Essentia extractor parameters. `app/utils/localAudio.ts` maps
those named fields to the positional arguments consumed by the Worker. The
private benchmark script also starts from the same JSON defaults, then applies
explicit environment overrides to an immutable effective configuration.

The benchmark writes selected effective settings into `analysisMetadata` on
every result and on its summary: analyzer/configuration versions, sample rate,
maximum analysis duration, rhythm-extractor settings, selected key profiles,
analysis layout, estimate inclusion, and the loaded Essentia runtime version.
It does not claim to serialize every threshold or key-extractor field, so retain
the shared JSON and benchmark environment alongside any private research result.

Cache invalidation is manual and deliberate. Any change to production analysis
behavior or extractor arguments must also change `configurationVersion` in the
shared JSON. An analyzer implementation/dependency change must update
`analyzerVersion`; a tag-reader behavior change must update
`LOCAL_AUDIO_METADATA_VERSION` in `app/utils/localAudio.ts`. These values are
part of the cache key, so the version bump prevents a new behavior from reusing
old results. Research-only benchmark overrides do not change production cache
identity and must not be promoted without updating the shared configuration and
its version.

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
  app/utils/localAudio.test.ts
npx vitest run --project stores \
  app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts
npx vitest run --project nuxt \
  test/nuxt/enrichment-page.nuxt.test.ts \
  test/nuxt/useLocalAudioAnalysis.nuxt.test.ts \
  test/nuxt/localAudioCache.nuxt.test.ts
npm run test:audio-config
npm run verify
npm run build
```

The rendered enrichment-page suite protects the thin route's collection-load
and workflow bindings. The Nuxt local-audio suite exercises Worker success,
failure, cancellation, and disposal through a fake Worker boundary.
`app/utils/localAudio.test.ts` pins the shared config mapping and cache-key
versions, while `scripts/benchmark-local-audio.test.cjs` pins effective
benchmark settings and output metadata.

Use a sanitized XML fixture for automated tests. Real collection exports may be
used for local browser verification but must not be committed.

For local analyzer research, create a private tab-separated manifest with
`path`, expected BPM, expected key, artist, and title columns, then run:

```bash
node scripts/benchmark-local-audio.cjs /path/to/private-manifest.tsv
```

The benchmark requires `ffprobe` and `ffmpeg` on `PATH` as well as the local
audio, manifest, and analyzer dependencies.

Set `ESSENTIA_KEY_PROFILES` to a comma-separated profile list and
`ESSENTIA_ANALYSIS_LAYOUT=distributed` to compare research configurations. Do
not use distributed output as production evidence without checking it against
the continuous center layout. Do not commit manifests, benchmark output,
collection paths, or audio files.
