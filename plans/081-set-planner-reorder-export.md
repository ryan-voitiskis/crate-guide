# Plan 081: Set planner reorder, BPM arc, export and "Pack this set"

> **Executor instructions**: This plan turns the session history into a small
> set planner. It changes only client code: no database migration, no Edge
> Function, no generated types and no change to the saved-set wire format
> (`LibraryPlayedTrackEntry`). Crate writes go through the existing
> `cratesStore.createCrate` and `cratesStore.addRecordToCrate` paths. It must
> not edit `app/utils/trackSuggestions.ts`, `CardTrackSuggestion.vue`,
> `ListTrackSuggestions.vue`, `InspectorTrack.vue` (owned by the Phase 2c
> session) or `app/pages/index.vue` and `app/pages/tracks.vue` (owned by the
> Phase 0 first-run session).
>
> **Drift check (run first)**:
> `git diff --stat f90fa44..HEAD -- app/stores/sessionPlayback.ts app/stores/sessionStore.ts app/stores/sessionSavedSets.ts app/components/session/PanelSessionHistory.vue app/components/session/CardSessionHistoryTrack.vue app/components/session/RatingSessionHistory.vue app/stores/cratesStore.ts`
> If any of these changed, re-read them before editing and reconcile this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: product / session planning
- **Planned at**: commit `f90fa44`, 2026-11-25
- **Status**: IN PROGRESS
- **Product context**: Phase 2b of
  [docs/product-direction-2026-11.md](../docs/product-direction-2026-11.md).
  Built overnight in parallel with Phase 2c (ratings in suggestions) and part
  of Phase 0 (first-run checklist); the three share no source files.

## Why this matters

The session page is the product's "Plan a set" surface, but its history is an
append-only log: the order is whatever was loaded first, there is no way to see
the tempo shape of the set, and the only output is a saved set inside Crate
Guide. DJs plan a set to play it from a bag and to post a tracklist afterwards.
Reordering, a BPM arc, a plain export and a one-click crate close that loop and
link planning to the coming Bag view (Phase 2a).

## Current state

- `sessionPlayback.ts` appends to `currentSession` in `loadTrack` and
  mutates `transition_rating` in place through `rateTransition(index)`. There
  is no other history mutation besides clearing.
- A rating on entry `i` describes the transition from entry `i - 1` into
  entry `i`; the first entry shows no rating control
  (`CardSessionHistoryTrack.vue`, `v-if="!isFirst"`).
- `sessionSavedSets.ts` deep-watches `currentSession` and autosaves to the
  active saved set, so any history mutation persists without new code.
- `CardSessionHistoryTrack.vue` shows the played (pitch-adjusted) BPM,
  falling back to the track BPM, and the track key in the user's key format.
- `LibraryTrack` has no energy field and `audio_features` carries no energy
  value; no energy data exists anywhere in the client.
- No clipboard or file-download helper exists in `app/`.
- `cratesStore` exposes `createCrate({ name, description, color })` and
  `addRecordToCrate(crateId, recordId, { silent })`, both no-ops in a
  read-only workbench. Demo capabilities set `canManageCrates: false`.
- No E2E test drives the session page; the E2E suite covers auth, bootstrap,
  layout and bundle laziness only.

## Scope

**In scope**:

- reorder and remove history entries, keyboard-accessible, with a defined
  rating rule and one-level undo
- a compact BPM arc in the history panel
- set-list export as plain text, Markdown and CSV, to clipboard or download
- "Pack this set" into a new or existing crate
- unit, store and nuxt tests

**Out of scope**:

- energy arc (no energy data exists; add once a source does)
- removing records from an existing crate when packing
- reordering inside saved sets that are not loaded into the history
- an E2E test (the E2E suite does not cover the session page; adding the
  first one needs seeded library fixtures and is its own task)

## Product decisions (made unattended; confirm at review)

1. **Rating rule.** A transition rating belongs to the ordered pair of
   adjacent entries (by entry identity, not track id, so a track played twice
   is distinct). After a move or removal, an entry keeps its rating only if its
   predecessor is the same entry as before; otherwise its rating is cleared.
   An entry moved to the top loses its rating because it has no predecessor.
   This never shows a rating for a transition the user did not rate.
2. **Undo.** When a move or removal clears at least one rating, or removes an
   entry, a toast offers **Undo** for that one edit. Undo applies only if the
   history has not changed since; otherwise it reports that it cannot undo.
3. **Remove.** "Remove from set" is included because a planner without it
   forces clearing the whole session to fix one mis-load. It follows the same
   rating rule.
4. **Keyboard.** Each entry has labelled "Move up" and "Move down" buttons
   (disabled at the ends) and `Alt+ArrowUp` / `Alt+ArrowDown` on the focused
   entry. Focus follows the moved entry and a polite live region announces the
   new position. Pointer drag (native HTML drag and drop) is offered in
   addition, never instead.
5. **BPM for arc and export.** The value shown in history: the played BPM
   (pitch-adjusted at load time), falling back to the track BPM.
6. **Key for export.** The track key in the user's key format
   (`key_format`), short form, as in history.
7. **CSV.** RFC 4180: comma separator, CRLF line endings, fields quoted when
   they contain a comma, quote, CR or LF, quotes doubled. Text cells that
   start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` to stop
   spreadsheet formula execution (OWASP CSV injection guidance). The
   downloaded file starts with a UTF-8 BOM so Excel reads accented names
   correctly; the clipboard copy has no BOM.
8. **Pack this set.** Collects the distinct record ids of the set's tracks in
   set order, skipping tracks no longer in the library. "New crate" creates a
   crate (default name: the saved set name, else `Set YYYY-MM-DD`) and adds the
   records. "Existing crate" adds only the missing records and never removes
   any. Writes are sequential through the store; the result toast reports
   added, already present and failed counts. Hidden behind a disabled button
   with an explanation when `canManageCrates` is false or the workbench is
   read-only.

## Steps

### Step 1: Pure planner utilities

`app/utils/setPlanner.ts`:

- `moveSetEntry(entries, from, to)` and `removeSetEntry(entries, index)`
  returning `{ entries, clearedRatings }` with new arrays and shallow-copied
  entries whose rating changed. Out-of-range or no-op inputs return `null`.
- `getSetEntryBpm(entry, track)` (played BPM, then track BPM).
- `getSetArcPoints(values)` for the sparkline geometry.
- `collectSetRecordIds(entries, getTrack)`.

`app/utils/setListExport.ts`:

- `buildSetListRows(entries, getTrack, keyFormat)`
- `formatSetListText`, `formatSetListMarkdown`, `formatSetListCsv`
- `escapeCsvField`, `escapeMarkdownText`, `createSetListFilename`

`app/utils/textFileExport.ts`: `copyTextToClipboard` and
`downloadTextFile` (Blob plus object URL, revoked after the click).

**Verify**: `npx vitest run --project unit app/utils/setPlanner.test.ts app/utils/setListExport.test.ts`

### Step 2: Store mutations

`sessionPlayback.ts` gains `moveHistoryEntry`, `removeHistoryEntry` and
`undoHistoryEdit`; the store re-exports them. Clearing the session or the
account invalidates the undo snapshot.

**Verify**: `npx vitest run --project stores app/stores/__tests__/sessionStore.history.test.ts`

### Step 3: UI

- `CardSessionHistoryTrack.vue`: move up/down and remove buttons, keyboard
  shortcuts, drag handle.
- `PanelSessionHistory.vue`: focus management, live region, undo toast,
  `MetricSessionBpmArc`, `ControlsSessionExport`, `DialogPackSet`.
- `usePackSet.ts`: the crate orchestration, tested in the stores project.

**Verify**: `npx vitest run --project nuxt test/nuxt/session-history-planner.nuxt.test.ts`
and `npx vitest run --project stores app/composables/__tests__/usePackSet.test.ts`

### Step 4: Gates

`npm run format`, `npm run check:conventions`, `npm run verify`,
`npm run audit:prod`.

## Evidence

Recorded in the PR description and its final comment.

## STOP conditions

- A change would alter the saved-set JSON shape or need a migration.
- Packing would need a bulk membership RPC to be usable (it does not for
  sets of normal length; revisit if sets exceed about 60 records).
