# Handover Prompt: Crate Guide v2 Track Enrichment

You are picking up Crate Guide v2 enrichment work. Start by reading:

- `docs/tmp/track-enrichment-v2-plan.md` (the authoritative plan — read it fully)
- `AGENTS.md`
- Current `git status` in `/Users/vz/projects/crate-guide`
- If still present, POC worktree `/Users/vz/projects/crate-guide-local-audio-poc`

## Objective

Implement the plan: a generic Rekordbox XML importer that gets BPM/key onto Discogs-imported Crate Guide tracks so recommendations are useful again, with review-before-write and provenance stored in `tracks.audio_features`. Browser audio analysis is diagnostic only.

Hard constraint: Crate Guide must in no way depend on reklawdbox. The importer targets the standard Rekordbox `DJ_PLAYLISTS` XML format that any user can produce via Rekordbox's File → Export Collection. reklawdbox exists only in the development process, as the tool that generated our dev dataset.

## Current Known State

- Main repo: `/Users/vz/projects/crate-guide`, base branch `v2`.
- Beatport scraper disabled in `430ba06 fix(beatport): disable scraper`. Keep it disabled.
- POC worktree: `/Users/vz/projects/crate-guide-local-audio-poc`, branch `codex/local-audio-browser-poc`, commit `21b9ea7`.
- Dev dataset: `/Users/vz/Desktop/reklawdbox-full-library-20260709-224913.xml` — full-library export, 2,919 tracks, profiled in the plan (mixed tonality notations, 23 zero-BPM rows, 49 empty albums, zero-width chars in 3 rows). Use it for development validation and for deriving SANITIZED test fixtures.
- Do NOT use files under `~/reklawdbox-exports/` — those are staged-change subsets for re-import into Rekordbox, not collection exports.

Verify all of this before relying on it; it may drift.

## Important Product Decisions Already Made

- Rekordbox XML selected by the user is the primary source for top-level BPM/key. No reklawdbox-specific code, formats, or instructions anywhere in the app.
- The parser treats genuine Rekordbox exports as first-class: ignore unknown attributes and child elements (`TEMPO`, `POSITION_MARK`); never use `TrackID` for identity; `AverageBpm="0.00"` → null.
- Tonality must parse case-insensitive Camelot (`8A`, `1a`), note names (`Am`, `F#m`, bare `C` = major), and long form (`A Minor`); anything else → null + warning. Real libraries mix notations (~4% of the dev dataset).
- Authenticated enrichment page where the user selects the XML file (new pages are auth'd by default via `auth.global.ts`).
- Match XML rows to existing Discogs-imported records/tracks; review before writing.
- Fill blank top-level `tracks.bpm`, `tracks.key`, `tracks.mode` only. `key`/`mode` are an atomic pair. `key: 0` is valid C — blank checks must be explicit null checks.
- Provenance goes in `tracks.audio_features` (versioned `TrackAudioFeatures`; sources: `rekordboxXml`, `embeddedTags`, `essentiaBrowser`; read-modify-write merge). Getting the types right end to end is critical — the plan lists five mandatory type touchpoints, including the `fetchAllTracks` column mapping and `toTrackUpdatePayload` serializer in `app/stores/tracksStore.ts`.
- Batch applies go through a new `updateTracksBatch` store helper: no per-row toasts (note `updateTrack`'s `silent` option does NOT suppress its error toast), one summary toast, per-row errors rendered in the page.
- Duration matching uses three bands (≤8 s corroborates, 8–30 s neutral + warning, >30 s conflict → manual); missing duration or empty album on either side is neutral.
- Treat browser Essentia as diagnostic only; never promote out-of-range BPM.

## First Implementation Pass

1. Create a new branch from `v2`.
2. Add the `tracks.audio_features jsonb` migration; regenerate `shared/types/database.ts`; update `Track` in `shared/types/supabase.ts` (Omit-and-replace pattern); add `shared/types/audioFeatures.ts`.
3. Wire `audio_features` through `tracksStore` (fetch mapping + update serializer).
4. Implement the XML parser and tonality conversion utilities with unit tests (parser tests need `// @vitest-environment happy-dom` — all vitest projects are node env).
5. Implement matching utilities against loaded `records`/`tracks` with sanitized fixtures (no real absolute paths or personal collection data in the repo).
6. Add the enrichment page and minimal nav entry.
7. Add `updateTracksBatch` and the review/apply flow.
8. Validate with the dev dataset; spot-check that proposed BPM/key are mostly correct against known tracks.

## Files and Code Areas to Inspect

- `shared/types/database.ts`, `shared/types/supabase.ts`
- `app/stores/tracksStore.ts` (esp. `fetchAllTracks` mapping and `toTrackUpdatePayload`)
- `app/stores/recordsStore.ts`
- `app/utils/keyFunctions.ts` (`pitchClassMap`, `parseBeatportKey`)
- `app/utils/track-validation.ts` (`isValidBPM`)
- `app/utils/trackSuggestions.ts`
- `app/middleware/auth.global.ts`
- `app/pages/local-audio.vue` in the POC worktree
- `supabase/migrations/`

## Constraints

- Follow repo conventions from `AGENTS.md`; Conventional Commit messages; `npm run format` after changes.
- Preserve dirty worktree changes you did not make.
- Do not re-enable Beatport scraping.
- No reklawdbox dependency in the product, in any form.
- Never write absolute local file paths to Supabase — sanitized collection-root-relative hints only.
- Never automatically overwrite existing BPM/key/mode values.
- `audio_features` writes are read-modify-write merges, never blind replacement.

## Acceptance Criteria

- A user can select a standard Rekordbox collection XML export in Crate Guide.
- The app shows matched Crate Guide tracks with proposed BPM/key values and warnings.
- High-confidence blank-field updates are preselected and easy to approve.
- Applying writes top-level BPM/key/mode only where blank, and merges `audio_features` provenance for all approved rows.
- Reloaded tracks retain `audio_features` (survives `fetchAllTracks`) and drive existing recommendation code without refactors.
- Batch apply of a partially failing set shows exactly one summary toast plus per-row errors.
- Validation passes:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:run
SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=dummy npm run build
```
