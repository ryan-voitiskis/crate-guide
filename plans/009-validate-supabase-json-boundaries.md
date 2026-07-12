# Plan 009: Decode Supabase JSON into validated domain rows

> **Executor instructions**: Treat database JSON as untrusted structure, but do
> not migrate or delete stored data. Implement the fallback policy exactly,
> test every path, and stop if live legitimate variants contradict the plan.
> Update the tracker row when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   shared/types/supabase.ts \
>   shared/types/discogs.ts \
>   app/utils/supabaseRows.ts \
>   app/utils/supabaseRows.test.ts \
>   app/stores/recordsStore.ts \
>   app/stores/tracksStore.ts \
>   app/stores/sessionStore.ts \
>   app/stores/__tests__/recordsStore.test.ts \
>   app/stores/__tests__/tracksStore.test.ts \
>   app/stores/__tests__/sessionStore.test.ts
> ```
>
> Run `git status --short`. Plans 007 and 008 must be DONE because this plan
> relies on the reduced store surface and truthful fetch-result contracts.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 007 and Plan 008
- **Category**: tech-debt
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Supabase correctly types JSON columns as `Json`, but application stores assert
them directly into artist, label, enrichment, Beatport, and saved-session
domain types. Corrupt, legacy, or partially migrated rows therefore reach UI
and recommendation code before failing. This plan creates one explicit decode
boundary with conservative fallbacks and aggregated warnings, while preserving
all valid historical data.

## Current state

- `recordsStore.fetchAllRecords` casts whole rows at
  `app/stores/recordsStore.ts:110-112` with a comment assuming artists/labels
  always match application types.
- `tracksStore.fetchAllTracks` manually reconstructs every scalar/JSON field at
  `app/stores/tracksStore.ts:139-163`; each new column must be added manually.
- Track create/update response paths cast `audio_features` and other JSON again
  at `tracksStore.ts:172-247`.
- `sessionStore.fetchSavedSets` and both save branches use double assertions at
  `app/stores/sessionStore.ts:382-440`.
- `shared/types/supabase.ts:19-35` defines the intended `DatabaseRecord` and
  `Track` projections. `PlayedTrackEntry` and `SavedSet` currently live inside
  `sessionStore.ts:14-28`, even though they describe persisted rows.
- `shared/types/discogs.ts` already exports `isDiscogsArtistDb` and
  `isDiscogsLabelDb`; reuse them rather than creating incompatible guards.
- Historical `beatport_data` remains supported after Plan 007 and has two valid
  shapes: found data and a not-found marker.

The decoder validates only JSON-shaped fields. Supabase-generated scalar row
types remain authoritative; do not hand-validate every UUID/timestamp/string.
Never include raw JSON payload values in logs or toasts.

## Commands you will need

| Purpose           | Command                                                                                                                                                        | Expected on success |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Decoder tests     | `npx vitest run --project unit app/utils/supabaseRows.test.ts`                                                                                                 | exit 0              |
| Store tests       | `npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/sessionStore.test.ts` | exit 0              |
| Full verification | `npm run verify`                                                                                                                                               | exit 0              |
| Build             | `npm run build`                                                                                                                                                | exit 0              |
| Format            | `npm run format`                                                                                                                                               | exit 0              |

## Scope

**In scope**:

- `shared/types/supabase.ts`
- `shared/types/discogs.ts` only if an existing guard needs a correctness fix
  proven by tests
- `app/utils/supabaseRows.ts` (create)
- `app/utils/supabaseRows.test.ts` (create)
- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/sessionStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Supabase schema, migrations, generated types, RLS, RPCs, or stored JSON
  migration.
- Mutation payload formats or enrichment/Beatport schema redesign.
- Rejecting an entire load because one optional JSON value is malformed.
- Logging raw row values, artist names, local paths, credentials, or payloads.
- Cross-store ownership/type-cycle cleanup; Plan 010 follows this plan.
- General-purpose validation framework or new dependency.

## Git workflow

- Branch: `codex/009-validate-supabase-json`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `refactor(data): validate Supabase JSON rows`.
- Do not push or open a PR unless instructed.

## Target decoder contract

Define:

```ts
export type DecodeIssue = {
	entity: 'record' | 'track' | 'saved-set'
	id: string
	field: string
}

export type DecodedRow<T> = {
	row: T
	issues: DecodeIssue[]
}
```

Export `decodeRecordRow`, `decodeTrackRow`, and `decodeSavedSetRow`. Each returns
a usable row plus field-level issues. Issues contain entity, ID, and field name
only—never raw values.

Fallback policy:

- Record invalid `artists` or `labels` → `[]`.
- Track invalid `artists`, `extraartists`, or `genres` → `[]`.
- Track invalid legacy `beatport_data` or `audio_features` → `null`.
- Saved set non-array `played_tracks` → `[]`; mixed arrays retain valid
  `PlayedTrackEntry` items and omit invalid entries.
- Valid values round-trip without normalization loss.

Validity rules are also fixed:

- all numeric JSON fields must be finite;
- a `BeatportNotFoundMarker` requires `searched === true`,
  `notFound === true`, and finite `searchedAt`;
- found Beatport data requires finite `accessed`, string URL/genre/key/image,
  and finite BPM or null;
- a played entry requires a non-empty string `track_id`, finite non-negative
  `time_added`, finite `adjusted_bpm` or null, and integer
  `transition_rating` from 1 through 5 or null;
- audio-feature scores, timestamps, source fields, and numeric arrays must meet
  their declared finite/string/enum shapes; unknown configuration/source
  fields may be preserved only when all required version-1 structure is valid.

Issue reporting uses both channels once per store operation when any issue
exists:

- one `console.warn('Invalid saved data was reset to safe defaults', issues)`
  where `issues` contains only entity, ID, and field;
- one `toast.warning('Some saved data was reset to safe defaults.')`.

Do not emit one warning per row/field and do not include raw payload values.

Move `PlayedTrackEntry` and `SavedSet` into `shared/types/supabase.ts`, defining
`SavedSet` as a projection of the generated `sets` row with typed
`played_tracks`. Remove their store-local definitions.

## Steps

### Step 1: Build pure guards and decoder tests

Implement the decoder module using small type guards. Validate:

- Discogs artist/label arrays through existing guards;
- string genre arrays;
- both historical Beatport shapes;
- every required `TrackAudioFeatures` level: version, timestamps, applied
  source keys, match confidence/score/reasons/warnings, and optional source
  objects with their required scalar/array fields;
- played-track ID/timestamp/adjusted BPM/transition rating types.

Do not use truthiness for numeric fields: `key: 0`, `mode: 0`, BPM 0 where
schema permits it, and rating values must be handled explicitly.

**Verify**: decoder tests cover valid round trips, each invalid field fallback,
mixed saved-set filtering, nested malformed audio features, both Beatport
shapes, and issue redaction.

### Step 2: Decode every record response before state assignment

Use `decodeRecordRow` in fetch, create, and update response paths. Decode all
rows into a temporary array before assigning store state. Aggregate issues and
emit the exact console/toast pair from Target decoder contract once per
operation; console detail may contain only IDs and field names.

Keep Plan 008 boolean fetch semantics: a successful query with fallback issues
still returns true because a usable row was produced.

**Verify**: record-store tests prove valid rows preserve data, invalid JSON gets
fallbacks, exactly one console and one toast warning are emitted, and raw
invalid values are absent from logs.

### Step 3: Decode track responses and strip join metadata

For `fetchAllTracks`, destructure/remove the joined `records` object before
calling `decodeTrackRow`; do not use object spread that can retain it. Apply the
same decoder to create/update response rows.

Preserve serializer behavior and the Plan 007 legacy Beatport contract.

**Verify**: track tests prove no `records` property enters local state, valid
audio features and legacy Beatport data survive, invalid nested JSON falls back
once, and new scalar columns are retained through typed row projection.

### Step 4: Decode saved-set fetch and save responses

Move persisted session types to shared types and decode rows returned by
`fetchSavedSets` plus both update/insert branches of `saveSession`. A mixed
played-track array retains valid entries in original order.

**Verify**: session-store tests cover fetch, update, insert, malformed array,
mixed entries, and one redacted warning per operation.

### Step 5: Run regression and type gates

Run focused tests, `npm run format`, `npm run verify`, and `npm run build`.

**Verify**: all exit 0; searches for the old `as unknown as SavedSet` and whole
row `as DatabaseRecord[]` assertions return no matches in stores; only declared
files changed.

## Test plan

- Table-driven unit cases should identify the exact field fallback without
  snapshotting full malformed payloads.
- Use synthetic values only; no production row or local path belongs in tests.
- Store tests must prove decoder use on fetch and mutation responses, not only
  direct decoder correctness.
- Warnings are aggregated and redacted; assert both count and safe shape.
- Preserve order for valid arrays and mixed saved-session entries.

## Done criteria

- [ ] Every Supabase JSON response entering record, track, or saved-set state
      passes through one decoder.
- [ ] Valid data round-trips; malformed optional fields receive documented
      fallbacks and one redacted warning.
- [ ] Joined track metadata cannot leak into `Track` state.
- [ ] `PlayedTrackEntry`/`SavedSet` are persistence-domain types, not store-local
      interfaces.
- [ ] Double/whole-row assertions targeted by this plan are gone.
- [ ] No schema, migration, generated type, payload format, or stored data
      changed.
- [ ] Full verification/build pass with no out-of-scope changes.

## STOP conditions

Stop and report if:

- A current legitimate row uses an undocumented JSON variant; report only the
  entity ID and field/type shape, not contents.
- The fallback policy would discard a value users currently rely on.
- Correct decoding requires migrating stored data or changing generated types.
- Valid forward-compatible enrichment data cannot be distinguished from
  malformed data without a versioning decision.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Add new JSON columns to this decoder boundary and tests when schema evolves.
- Reviewers should scrutinize fallback policy and redaction more than syntax.
- Decoder issues are operational signals; do not silently remove warnings or
  turn them into raw-payload logs.
