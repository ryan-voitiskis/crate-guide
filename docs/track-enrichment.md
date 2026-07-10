# Track Enrichment

Crate Guide enriches Discogs-imported tracks from a standard rekordbox
`DJ_PLAYLISTS` XML export. The workflow is intentionally browser-local until a
user reviews and applies staged changes.

## Workflow

1. The Tracks page surfaces missing BPM/key values and links to the workflow.
2. The user chooses an enrichment source. rekordbox XML is available now;
   local Essentia analysis is the planned second source.
3. The user exports a collection XML from rekordbox.
4. `app/utils/rekordboxXml.ts` parses and normalizes the XML in the browser.
5. `app/utils/trackEnrichment.ts` matches source rows to loaded Crate Guide
   tracks and records.
6. `app/pages/enrichment.vue` presents ready, manual-review, unmatched, staged,
   and applied views.
7. Staged updates are confirmed before `updateTracksBatch` persists them.

The product names this destination **BPM & Key** rather than “Enrichment” in
navigation. The user-facing label describes the outcome; the route and internal
domain naming remain source-agnostic for future analyzers.

The product has no runtime dependency on rekordbox itself or on tools that can
generate compatible XML.

## Data Invariants

- Existing BPM, key, and mode values are never overwritten.
- Key and mode are written only as an atomic pair.
- `key: 0` is valid and must not be treated as blank.
- Batch writes add null preconditions to the database query, protecting the
  fill-only rule if a track changes after review.
- Absolute local file paths are never persisted. Provenance contains only a
  sanitized relative `locationHint`.
- `audio_features` is merged by source key. A rekordbox import preserves data
  produced by other enrichment sources.

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

Run the standard checks after changing the parser, matcher, persistence, or
review flow:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Use a sanitized XML fixture for automated tests. Real collection exports may be
used for local browser verification but must not be committed.
