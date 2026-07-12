# Plan 007: Retire disabled ingestion and remove test-maintained dead APIs

> **Executor instructions**: This is deliberate deletion work. Prove every
> symbol remains caller-free before deleting it, preserve persisted legacy
> Beatport data, and run every gate. Stop if scope expands. Update the tracker
> row when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   app/components/import/DialogBeatportImport.vue \
>   app/components/import/ImportTrackCardResult.vue \
>   app/components/import/ImportTrackCardSearching.vue \
>   app/components/crates/DialogCrateForm.vue \
>   app/composables/useBeatportScraper.ts \
>   app/composables/__tests__/useBeatportScraper.test.ts \
>   app/composables/useValidation.ts \
>   app/stores/beatportStore.ts \
>   app/stores/__tests__/beatportStore.test.ts \
>   app/stores/tracksStore.ts \
>   app/stores/__tests__/tracksStore.test.ts \
>   app/stores/cratesStore.ts \
>   app/stores/__tests__/cratesStore.test.ts \
>   app/utils/beatport/scraper.ts \
>   app/utils/beatport/scraper.test.ts \
>   server/api/beatport/search.get.ts \
>   server/api/beatport/search.get.test.ts \
>   server/utils/getClientIp.ts \
>   shared/types/beatport.ts \
>   test/nuxt/DialogCrateForm.nuxt.test.ts
> ```
>
> Run `git status --short`. Plan 006 must be DONE so the create-only crate form
> can receive a rendered regression test.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 006
- **Category**: tech-debt
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The repository maintains roughly 2,000 lines of Beatport fetching code behind
three permanent `false` switches, plus store APIs and a validation composable
with no production callers. Tests currently preserve this unreachable surface
and make unrelated refactors more expensive. The supported direction is
Rekordbox XML and private local analysis; old `beatport_data` rows remain useful
as historical display data and must survive.

## Current state

- Beatport fetching is independently disabled in
  `app/composables/useBeatportScraper.ts:71-86`,
  `app/stores/beatportStore.ts:104-157`, and
  `server/api/beatport/search.get.ts:39-58`.
- `DialogBeatportImport.vue` has no production caller. Its two track-card
  components are only called from that dialog.
- `server/utils/getClientIp.ts` is called only by the disabled endpoint.
- `shared/types/supabase.ts:27-35` and `app/stores/tracksStore.ts:47-109` still
  model/serialize persisted legacy Beatport data. `DialogTrackDetails.vue`
  displays raw historical data and remains supported.
- Caller searches at `004d548` find no non-test consumers for:
  `getTracksByIds`, `getTracksByBpmRange`, `getTracksByKey`,
  `getTracksByGenre`, `getCompatibleTracks`, `getCratesByIds`,
  `getCrateRecords`, `searchCrates`, `getCrateStats`, `duplicateCrate`, and
  `useValidation`.
- `getCratesContainingRecord` **does** have production callers in
  `DialogAddToCrate.vue` and `AlertConfirmRemoveRecord.vue`; retain it.
- `DialogCrateForm.vue:6-82` supports add/edit, but both callers use create-only
  mode. Real editing is implemented in `DialogCrateDetails.vue:22-127`.

Do not edit applied migration history. The existing rate-limit RPC/table may be
revisited after type-generation hardening, but dropping it would introduce a
database deployment concern unrelated to this deletion plan.

## Commands you will need

| Purpose           | Command                                                                                                             | Expected on success                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Store tests       | `npx vitest run --project stores app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts` | exit 0                                 |
| Crate form test   | `npm run test:nuxt -- DialogCrateForm`                                                                              | exit 0                                 |
| Full verification | `npm run verify`                                                                                                    | exit 0                                 |
| Build             | `npm run build`                                                                                                     | exit 0; deleted server route is absent |
| Format            | `npm run format`                                                                                                    | exit 0; intended survivors only        |

## Scope

**Delete**:

- `app/components/import/DialogBeatportImport.vue`
- `app/components/import/ImportTrackCardResult.vue`
- `app/components/import/ImportTrackCardSearching.vue`
- `app/composables/useBeatportScraper.ts`
- `app/composables/__tests__/useBeatportScraper.test.ts`
- `app/composables/useValidation.ts`
- `app/stores/beatportStore.ts`
- `app/stores/__tests__/beatportStore.test.ts`
- `app/utils/beatport/scraper.ts`
- `app/utils/beatport/scraper.test.ts`
- `server/api/beatport/search.get.ts`
- `server/api/beatport/search.get.test.ts`
- `server/utils/getClientIp.ts`

**Modify**:

- `shared/types/beatport.ts`
- `app/stores/tracksStore.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/cratesStore.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/components/crates/DialogCrateForm.vue`
- `test/nuxt/DialogCrateForm.nuxt.test.ts` (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- `beatport_data` database column, generated types, serializers, historical
  `BeatportTrackData`/`BeatportNotFoundMarker`, or legacy detail display.
- Applied rate-limit migration, table, or RPC; no cleanup migration here.
- Active `searchTracks`, `getCratesContainingRecord`, track filters, track
  suggestions, record lookup, or crate edit detail behavior.
- Rekordbox/local-audio enrichment logic.
- General store reorganization; Plans 008–010 own that sequence.

## Git workflow

- Branch: `codex/007-retire-disabled-code`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Two logical commits are acceptable:
  - `refactor(beatport): retire disabled ingestion`
  - `refactor: remove unused application APIs`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Re-prove the deletion set

Run repo-wide caller searches including tests, then repeat excluding tests. Pay
special attention to auto-registered component tags, which have no import.

**Verify**:

```bash
rg -n "useBeatportStore|useBeatportScraper|DialogBeatportImport|ImportTrackCardResult|ImportTrackCardSearching|getClientIp" app server shared test
rg -n "getTracksByIds|getTracksByBpmRange|getTracksByKey|getTracksByGenre|getCompatibleTracks|getCratesByIds|getCrateRecords|searchCrates|getCrateStats|duplicateCrate|useValidation" app server shared test
```

Expected: matches are limited to the declared definitions, exports, tests, and
the Beatport dialog's two child tags. Stop if any new production caller exists.

### Step 2: Remove the disabled Beatport pipeline

Delete the declared client/store/dialog/scraper/server files. In
`shared/types/beatport.ts`, remove only disabled status/message constants and
`SearchTrackParams`; retain the two persisted data interfaces. Keep
`tracksStore` serialization imports and behavior intact, adjusting the import
only if required after type cleanup.

Do not remove `beatport_data: null` from new track payloads: it is part of the
current persisted shape.

**Verify**:

```bash
rg -n "useBeatportStore|useBeatportScraper|DialogBeatportImport|BEATPORT_SCRAPING_DISABLED|SearchTrackParams|getClientIp" app server shared
rg -n "BeatportTrackData|BeatportNotFoundMarker|beatport_data" shared/types app/stores/tracksStore.ts app/components/tracks/DialogTrackDetails.vue
```

Expected: first search has no matches; second confirms legacy types,
serialization, and display remain.

### Step 3: Prune only proven-unused store/composable APIs

Remove the listed track/crate actions, their returned exports, and only their
matching tests. Delete `useValidation.ts`. Retain `getCratesContainingRecord`
and its tests because it has active callers.

**Verify**:

```bash
rg -n "getTracksByIds|getTracksByBpmRange|getTracksByKey|getTracksByGenre|getCompatibleTracks|getCratesByIds|getCrateRecords|searchCrates|getCrateStats|duplicateCrate|useValidation" app
rg -n "getCratesContainingRecord" app
```

Expected: first search returns no matches; second returns the store definition,
export, and two production callers.

### Step 4: Make `DialogCrateForm` create-only

Remove the optional `crate` prop, `isEditing`, edit initialization,
`updateCrate` branch, and conditional edit copy. Preserve:

- `open`/`update:open` contract;
- create payload with `records: []`;
- `saved` event used by nested creation in `DialogAddToCrate`;
- name/description/color validation and loading behavior.

Add a Nuxt test proving a successful create uses `createCrate`, emits the new
crate and closes; validation failure does not call the store. Assert no
`updateCrate` path remains.

**Verify**: `npm run test:nuxt -- DialogCrateForm` → all new cases pass.

### Step 5: Run the complete regression set

Run focused store/server/component tests, then `npm run format`,
`npm run verify`, and `npm run build`.

**Verify**:

```bash
test ! -e server/api/beatport/search.get.ts
rg -n "/api/beatport/search|useBeatportStore|useBeatportScraper" app server shared
npm run build
```

Expected: the file test and build exit 0; `rg` exits 1 with no matches. Compare
the implementation diff against the implementation-start SHA and confirm only
declared files changed.

## Test plan

- Delete tests whose only subject was the deleted pipeline/API; do not rewrite
  them into vacuous “disabled” tests.
- Existing track tests must continue proving legacy `beatport_data` and
  `audio_features` serialization.
- Existing crate tests for active actions remain.
- New rendered crate-form tests cover the only supported create contract.

## Completion and reconciliation

- Implemented by commit `f4b83688caf52b80b414f6a099ec01aa8a748f7e`,
  integrated as `d451ce0d8b7f2f2b8aef15a996462ab7e8697bef`.
- Final caller searches return no retired Beatport or caller-free API symbols.
  `getCratesContainingRecord` remains defined, exported, tested, and used by
  `DialogAddToCrate.vue` and `AlertConfirmRemoveRecord.vue`. The implementation
  diff is exactly 20 files: 13 deletions, 6 modified survivors, and 1 new Nuxt
  test, with no migration or generated-type change.
- `DialogCrateForm` is create-only and retains the open/close, `saved`,
  validation, loading, and `createCrate({ records: [] })` contracts. Its
  optional crate prop, edit copy/state, and `updateCrate` branch are gone.
- Reviewer diagnosis identified Vee Validate's debounced asynchronous schema
  validation as the rendered-test timing boundary, not an application defect.
  The create and validation assertions use `vi.waitFor` instead of relying on a
  fixed tick/flush sequence.
- Track-store tests preserve all legacy serialization variants: found Beatport
  data in create payloads, not-found markers in update payloads, and explicit
  `null` in new-track payloads.
- Verification used Node 24.12.0 and npm 11.6.2. Clean install, focused
  store/crate-form checks, full `npm run verify`, production `npm run build`,
  caller searches, formatting, and `git diff --check` all passed.

## Done criteria

- [x] No active Beatport fetch/store/dialog/server code or tests remain.
- [x] Historical Beatport row types, serialization, and detail display remain.
- [x] Every listed caller-free API and test-only branch is gone.
- [x] `getCratesContainingRecord`, active filters/suggestions, and real crate
      editing remain.
- [x] No migration or generated database type changed.
- [x] Full verification and production build pass.
- [x] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- Any deletion candidate has gained a production caller.
- `getClientIp` has another server consumer.
- Removing ingestion requires changing stored `beatport_data`, an applied
  migration, or legacy display behavior.
- The crate form's optional edit mode has a caller not found by tag search.
- A verification gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Treat `beatport_data` as legacy read-compatible data, not an active ingestion
  feature. A future reactivation should begin with a new design and one gate,
  not resurrect these files blindly.
- The dormant rate-limit schema is deliberately deferred; review it only with
  local DB tests and regenerated types available.
