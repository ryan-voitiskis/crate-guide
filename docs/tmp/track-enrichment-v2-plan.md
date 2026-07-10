# Crate Guide v2 Track Enrichment Plan

Date: 2026-07-09 (revised: no reklawdbox dependency; verified against real full-library export)

## Goal

Get enough BPM/key data onto Discogs-imported Crate Guide tracks to make v2 useful in production again. The product feature is a generic Rekordbox XML importer: any user can produce the input via Rekordbox's File → Export Collection (or any tool emitting the standard `DJ_PLAYLISTS` format). Crate Guide must NOT depend on reklawdbox in any way — reklawdbox is development tooling only, used here to generate our own dataset and verify results.

Success for the next 1-2 weeks:

- Import a Rekordbox-compatible XML into Crate Guide.
- Match XML rows to existing Discogs-imported Crate Guide tracks.
- Review proposed BPM/key updates before writing.
- Fill blank `tracks.bpm`, `tracks.key`, and `tracks.mode` fields by default.
- Store provenance and source metadata in `tracks.audio_features` (jsonb), with types done properly end to end.
- Preserve the existing auth/frontend surface except a small navigation entry.

## Current Context

Crate Guide side:

- Main repo branch `v2` has Beatport scraping disabled at `430ba06 fix(beatport): disable scraper`.
- Browser audio POC exists in worktree `/Users/vz/projects/crate-guide-local-audio-poc` on `codex/local-audio-browser-poc` at `21b9ea7 feat(audio): add local browser analysis poc` (`app/pages/local-audio.vue`, 851 lines).
- The POC proved browser folder/file selection, tag parsing, Essentia WASM execution, and IndexedDB caching. It did NOT prove browser-Essentia quality (a FLAC fragment expected ~120 BPM returned 738.3 BPM). Browser Essentia stays diagnostic-only.
- `tracks` schema: `bpm numeric(4,1)`, `key smallint`, `mode smallint`, `duration integer` (milliseconds — Discogs import converts `"3:45"` → `225000`).
- The suggestion engine (`app/utils/trackSuggestions.ts:83-88`) requires BOTH `key` and `mode` non-null, so key/mode must be written as an atomic pair.
- `app/middleware/auth.global.ts` is deny-by-default (public routes are an allowlist), so any new page is authenticated automatically.

Rekordbox XML format facts (from reklawdbox source review + the real dataset below):

- Envelope: `<DJ_PLAYLISTS Version="1.0.0">` → `<PRODUCT .../>` → `<COLLECTION Entries="N">` → `<TRACK .../>` rows, optionally followed by `<PLAYLISTS>`.
- Per-`<TRACK>` attributes in our dataset: `TrackID`, `Name`, `Artist`, `Album`, `Genre`, `Kind`, `TotalTime`, `Year`, `AverageBpm`, `DateAdded`, `BitRate`, `SampleRate`, `Comments`, `PlayCount`, `Rating`, `Location`, `Remixer`, `Tonality`, `Label`, conditionally `Colour`. Genuine Rekordbox exports add more attributes (`Composer`, `Grouping`, `Size`, `DiscNumber`, `TrackNumber`, `Mix`, …) and child elements (`TEMPO` beat-grid markers, `POSITION_MARK` cues). The parser must treat the full native format as first-class: ignore unknown attributes and child elements.
- `TrackID` is not guaranteed stable across exports (reklawdbox emits a 1-based sequential index). Do not use it for identity.
- `TotalTime` is integer seconds. `AverageBpm` has 2 decimals; `AverageBpm="0.00"` means unanalyzed and must map to null. `Rating` uses the 0/51/102/153/204/255 encoding. `Location` is a percent-encoded `file://localhost/...` URI.
- `Tonality` is whatever notation the library carries — NOT guaranteed Camelot (see parser spec).
- BPM/key values originate from Rekordbox's own analysis; there are no confidence values in the XML.

## Development Dataset and Verification

Dev dataset: `/Users/vz/Desktop/reklawdbox-full-library-20260709-224913.xml` — a full-library export (generated via reklawdbox, which is fine for development; the product never touches reklawdbox). Profile, verified 2026-07-09:

- 2,919 `<TRACK>` rows, `Entries` attribute matches; all self-closing (no children).
- Tonality: 0 empty; ~96% uppercase Camelot (`8A`); 109 rows in other notations — lowercase Camelot (`1a`, `3a`) and note names (`Am`, `F#m`, `Abm`, bare `C`/`F#` = major).
- BPM: 23 rows with `AverageBpm="0.00"` (unanalyzed) — must become null, never 0.
- 49 rows with empty `Album`; 0 rows with empty `Artist`; 0 duplicate `Location`s.
- 3 rows contain zero-width/invisible Unicode characters in text fields (Bandcamp-style, e.g. `In Days Of Old (2010​-​2013)`) — normalization must strip them.

Do NOT use the older files under `~/reklawdbox-exports/` — those are staged-metadata-change subsets meant for re-import into Rekordbox (the 27-track file is one), not collection exports.

Development verification loop: import this file on the enrichment page, and spot-check that matched tracks' proposed BPM/key are mostly correct against known tracks before shipping. A fresh dataset can be regenerated with reklawdbox when needed (dev-only; via its MCP `write_xml` with an all-track-IDs playlist).

Test fixtures derived from this file must be sanitized before committing: replace `/Users/vz/...` absolute paths and personal collection contents with synthetic equivalents that preserve the interesting shapes (mixed tonality notations, zero BPM, empty albums, invisible characters, XML entities).

## Product Approach

Source priority for top-level `bpm`/`key`/`mode`:

1. Rekordbox XML selected by the user (Rekordbox's own analysis).
2. Embedded local file tags from browser-selected audio folders.
3. Browser Essentia analysis — diagnostic only unless quality checks later prove it.

Hard constraint: no reklawdbox dependency in the product — no reklawdbox-specific code paths, formats, cache-DB readers, or invocation instructions in the app. The importer targets the standard Rekordbox XML format, full stop.

Recommended user workflow:

1. Export your collection from Rekordbox (File → Export Collection), or produce a Rekordbox-compatible XML any other way.
2. Open the Crate Guide enrichment page.
3. Select the XML file.
4. Review matched tracks and proposed values.
5. Apply approved blank-field updates.
6. Use the session/recommendation UI with enriched track data.

## Database and Types

Getting types right is a hard requirement. There are five touchpoints; missing any one of them silently breaks the feature:

1. Migration — new file in `supabase/migrations/`:

```sql
ALTER TABLE public.tracks
ADD COLUMN IF NOT EXISTS audio_features jsonb;
```

2. Regenerate `shared/types/database.ts` with the Supabase CLI so the `tracks` Row/Insert/Update types include `audio_features: Json | null`.

3. `shared/types/supabase.ts` — re-type the jsonb column on `Track` using the existing `Omit`-and-replace pattern (exactly how `beatport_data` is handled):

```ts
export type Track = Omit<
	Database['public']['Tables']['tracks']['Row'],
	'artists' | 'extraartists' | 'genres' | 'beatport_data' | 'audio_features'
> & {
	artists: DiscogsArtistDb[]
	extraartists: DiscogsArtistDb[]
	genres: string[]
	beatport_data: BeatportTrackData | BeatportNotFoundMarker | null
	audio_features: TrackAudioFeatures | null
}
```

4. `app/stores/tracksStore.ts` — two changes, both mandatory:
   - `fetchAllTracks` maps every column explicitly (`tracksStore.ts:114-134`); add `audio_features: track.audio_features` or the column is silently dropped on every load.
   - `toTrackUpdatePayload` (`tracksStore.ts:70-89`) needs an `audio_features` branch that casts `TrackAudioFeatures` to the generated `Json` type (mirroring `serializeBeatportData`).

5. New `shared/types/audioFeatures.ts` defining the versioned shape below.

`TrackAudioFeatures` — versioned from day one; `sources` is a per-source-keyed map so future sources (or richer analysis data) can be added additively without a migration, and imports merge instead of clobbering:

```ts
export type TrackAudioFeatures = {
	version: 1
	updatedAt: string
	// What was written to top-level fields, and from which source.
	applied: {
		bpm: { source: AudioFeatureSourceKey; appliedAt: string } | null
		keyMode: { source: AudioFeatureSourceKey; appliedAt: string } | null
	}
	// How this track was matched on the most recent import.
	match: {
		confidence: 'high' | 'medium' | 'manual'
		score: number
		reasons: string[]
		warnings: string[]
	}
	sources: {
		rekordboxXml?: RekordboxXmlSource
		embeddedTags?: EmbeddedTagsSource
		essentiaBrowser?: EssentiaBrowserSource
	}
}

export type AudioFeatureSourceKey = keyof TrackAudioFeatures['sources']

export type RekordboxXmlSource = {
	importedAt: string
	fileName: string
	name: string | null
	artist: string | null
	album: string | null
	genre: string | null
	// Sanitized: path relative to the collection root, never absolute.
	locationHint: string | null
	averageBpm: number | null // 0.00 in XML → null; round to 1 decimal for tracks.bpm
	tonality: string | null // verbatim: Camelot, lowercase Camelot, or note name
	parsedKey: number | null
	parsedMode: number | null
	totalTimeSeconds: number | null
	year: number | null
	kind: string | null
	sampleRate: number | null
	bitRate: number | null
	rating: number | null // raw Rekordbox encoding: 0/51/102/153/204/255
	playCount: number | null
	comments: string | null
	remixer: string | null
	label: string | null
	dateAdded: string | null
}

export type EmbeddedTagsSource = {
	importedAt: string
	raw: Record<string, unknown>
}

export type EssentiaBrowserSource = {
	importedAt: string
	analyzerVersion: string | null
	warnings: string[]
	raw: Record<string, unknown>
}
```

Merge semantics: writes to `audio_features` are read-modify-write. An import replaces only its own key under `sources` (plus top-level `updatedAt`, `match`, and any `applied` entries it changed) and preserves the other sources. Never blind-replace the whole object.

Path hygiene: never store absolute local paths in Supabase. `locationHint` is the decoded `Location` URI stripped of everything up to and including the collection root (e.g. `play/play22/Daniel Stefanik - #four.wav`). Absolute paths may live only in browser memory/IndexedDB.

## Parsing and Matching

Implement a browser-side Rekordbox XML parser using `DOMParser`.

Parse each `<TRACK>` into a structured source row:

- Read the attributes listed in the format facts above; ignore unknown attributes and ALL child elements (`TEMPO`, `POSITION_MARK`) so genuine Rekordbox collection exports parse identically.
- `AverageBpm`: parse as number; treat `0` (i.e. `"0.00"`) and unparseable as null; round to 1 decimal before proposing (column is `numeric(4,1)`).
- `TotalTime` is integer seconds.
- Do not use `TrackID` for identity.
- Malformed rows produce a warning row, never a thrown error.

Tonality parsing — real libraries mix notations (verified: ~4% of the dev dataset is non-uppercase-Camelot). Handle all of, case-insensitively:

- Camelot: `8A`/`8a` (minor), `8B`/`8b` (major) → reverse-lookup `camelotMinor`/`camelotMajor` in the existing `pitchClassMap`.
- Note names: `Am`, `F#m`, `Abm` (trailing `m` = minor); bare note `C`, `F#`, `Eb` = major.
- Long form: `A Minor`, `C Major` — existing `parseBeatportKey` semantics (extend or wrap it; its regex does not match `Am` or bare notes).
- Anything else → `key: null, mode: null` plus a warning.

Normalize strings for matching:

- Lowercase, Unicode-normalize (NFKC), strip diacritics.
- Strip zero-width/invisible characters (ZWSP and friends — present in the real dataset via Bandcamp titles).
- Normalize apostrophes/quotes/dashes; remove punctuation that does not distinguish titles; collapse whitespace.
- Strip leading track numbers (`01 `, `01 - `, `A1 `) from filename-derived titles.
- Ignore release-year suffixes like `(2023)` in album/folder names.

Match XML rows against loaded `records` and `tracks`. Note: Discogs import already inherits record artists onto tracks that have none (`discogs-data.ts`), so track-level artist matching works for single-artist albums too.

- High confidence: normalized title matches, at least one normalized artist matches, normalized XML album matches record title (or path album hint), and duration corroborates or is neutral (see bands below).
- Medium confidence: title and artist match, and either album/record matches or duration corroborates.
- Manual: multiple candidates, weak title-only match, duration conflict, missing artist/title, unparseable tonality with no BPM, or proposed value conflicts with an existing non-null value.
- Empty XML `Album` (49 rows in the dev dataset) is not a conflict — album criteria are simply unavailable for those rows.

Duration comparison — three bands, not a single cutoff (Discogs vinyl timings are label-printed approximations and often differ from digital masters):

- Corroborates: |Δ| ≤ 8 s.
- Neutral: 8 s < |Δ| ≤ 30 s → keep tier, add a warning.
- Conflicts: |Δ| > 30 s → manual.
- Either side missing a duration is neutral (no demotion) — many Discogs tracks have `duration: null`.

Units: Rekordbox `TotalTime` is seconds; Crate Guide `tracks.duration` is milliseconds. Convert before comparing.

Blank-field checks: `key: 0` is C and valid. Every "is this field blank" check uses `== null` / `=== null`, never truthiness. The codebase already has this bug class documented (`tracksStore.ts:326`).

## Review and Apply UI

Build an authenticated enrichment page (any new page is auth'd by default via `auth.global.ts`; just don't add it to the public allowlist). Port selectively from the POC's `local-audio.vue` — do not copy the 851-line single file; split per repo component conventions.

Core controls:

- Select Rekordbox XML file.
- Optional: select local audio folder for tag/fallback analysis.
- Summary cards: total XML rows, matched high, matched medium, manual review, approved, applied, errors.
- Filters: all, high confidence, medium confidence, manual, conflicts, fillable blanks, already complete.
- Table rows: Crate Guide record/track, XML artist/title/album, current BPM/key, proposed BPM/key, source + match confidence, warnings, approval checkbox.

Default approval:

- Preselect high-confidence rows where at least one top-level field is blank and the proposed value is valid.
- Never preselect medium/manual/conflict rows.

Apply policy:

- Fill `bpm` only when existing `track.bpm` is null and proposed BPM passes `isValidBPM` range (30–300).
- `key`/`mode` are an atomic pair: fill only when BOTH existing fields are null and BOTH proposed values are valid. If exactly one is null, flag for manual review.
- Always write `audio_features` (read-modify-write merge) for approved rows, even when top-level fields were already present.
- Show per-row errors and a final applied count.

Batch apply and toast policy — `updateTrack`'s `{ silent: true }` only suppresses the success toast; `toast.error` at `tracksStore.ts:214` fires unconditionally, so a naive loop over a failing batch spams one error toast per row. Add a store-level `updateTracksBatch(updates[])` helper that:

- Reuses the optimistic-update/revert logic per row.
- Suppresses all per-row toasts (success and error).
- Runs sequentially or with small bounded concurrency, reporting progress to the page.
- Returns per-row results; the page renders row-level errors and shows exactly one summary toast (`Applied 41 of 43. 2 failed.`).

## Browser Audio Fallback

Keep the browser audio POC as fallback/diagnostic, not release-critical source truth:

- Retain `music-metadata` tag reading if already useful.
- Keep browser Essentia behind an explicit toggle or separate diagnostic action.
- Never promote browser-Essentia BPM outside 30–300 to top-level `tracks.bpm`.
- Store suspicious results only in `audio_features.sources.essentiaBrowser` with warnings.
- Cache browser analysis in IndexedDB with a versioned key (path hint, size, mtime, analyzer version).
- No Web Worker work unless real collection testing shows the page locking up.

## Implementation Sequence

1. Create a new branch from `v2`.
2. Add the `audio_features` migration; regenerate `shared/types/database.ts`; update the `Track` type in `shared/types/supabase.ts`; add `shared/types/audioFeatures.ts`.
3. Wire `audio_features` through `tracksStore` (fetch mapping + update serializer) — the two mandatory store changes above.
4. Add XML parser + tonality conversion utilities with unit tests (uppercase/lowercase Camelot, note names, bare-note major, long form, zero BPM).
5. Add matching utilities with unit tests and sanitized fixtures derived from the dev dataset.
6. Add the enrichment page and nav entry; port file/folder-picker + tag-extraction pieces from the POC as needed.
7. Add `updateTracksBatch` and the review/apply flow.
8. Validate with the dev dataset (`/Users/vz/Desktop/reklawdbox-full-library-20260709-224913.xml`) against a small subset of the real collection; spot-check BPM/key correctness.
9. Ship once import/review/apply works and recommendations have enough enriched rows.

## Test Plan

Unit tests:

- Test environment: all vitest projects run `environment: 'node'`, where `DOMParser` does not exist. Parser test files need `// @vitest-environment happy-dom` (add `happy-dom` as a dev dependency) or an injectable XML-parsing seam.
- Fixtures: sanitized excerpts of the dev dataset (see Development Dataset section) — no real paths or personal collection data in the repo.
- Parser handles XML entities, missing/unknown attributes, child elements (ignored — genuine Rekordbox exports have `TEMPO`/`POSITION_MARK`), numeric parsing, `AverageBpm="0.00"` → null, malformed rows.
- Tonality conversion: `8A`, `8B`, `1a`, `Am`, `F#m`, `Abm`, bare `C`/`F#`/`Eb` (major), `A Minor`, `C Major`, garbage → null + warning.
- Normalization strips zero-width characters and diacritics.
- Matcher: high confidence for title/artist/album + corroborating duration; neutral on missing duration or empty album; conflict >30 s → manual; ambiguous candidates rejected.
- Fill-blanks payload: does not overwrite existing values; treats `key: 0` as PRESENT, not blank; enforces key/mode atomicity.
- `audio_features` merge: importing source B preserves source A; `applied` provenance recorded.
- `updateTracksBatch`: per-row results, no per-row toasts, partial-failure summary.

Browser/manual tests:

- Import the dev dataset XML on the enrichment page.
- Confirm high-confidence matches are preselected; spot-check proposed BPM/key against known tracks.
- Apply a small batch; verify Supabase rows have top-level BPM/key/mode and merged `audio_features`.
- Reload tracks and confirm `audio_features` survives `fetchAllTracks` and recommendation scoring has usable candidates.
- Optional: select local audio folder and confirm tag extraction still works.

Validation commands:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:run
SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=dummy npm run build
```

## Out of Scope for This Release

- Any reklawdbox integration in the product: no cache-DB (`internal.sqlite3`) readers, no feature-JSON import, no MCP invocation instructions in the app. reklawdbox's analyzer features (confidences, danceability, loudness, kick patterns, sections, …) are valuable, but importing them would couple Crate Guide to reklawdbox — if ever revisited, the versioned `sources` map accepts new keys without a migration.
- Re-enabling Beatport scraping.
- Building a browser-to-local-tool helper service of any kind.
- Full automatic collection-wide writes without review.
- Perfect MIR accuracy.
- Relicensing decisions beyond accepting Essentia inside the current POC/private phase.
