# Plan 079: Add tap tempo, a key picker and record annotation mode

> **Executor instructions**: This plan adds manual BPM and key entry that works
> while a record is playing. It writes through the existing `updateTrack`
> path with the existing version precondition. It must not touch
> `audio_features`, the Evidence model, the enrichment fill-only rule, the
> database schema or the Edge Functions. Manual values are user data, not
> provider or analyzer data. Treat Discogs-derived fields as untouched.
>
> **Drift check (run first)**:
> `git diff --stat 8984bfb..HEAD -- app/components/tracks app/components/records/DialogTrackEdit.vue app/components/records/SectionRecordTracks.vue app/components/library/InspectorTrack.vue app/utils/keyFunctions.ts app/utils/trackEditor.ts app/utils/track-validation.ts app/utils/formatting.ts app/stores/tracksStore.ts app/stores/trackEditStore.ts app/pages/tracks.vue test/nuxt/track-editors.nuxt.test.ts test/nuxt/FormTrackEditorFields.nuxt.test.ts`
> If any of these changed, re-read them before editing and reconcile this plan.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: product / metadata entry
- **Planned at**: commit `8984bfb`, 2026-11-18
- **Status**: DONE (implementation delivered in three stacked PRs; remove
  after the maintainer confirms the evidence below)
- **Product context**: Phase 1b of
  [docs/product-direction-2026-11.md](../docs/product-direction-2026-11.md).
  It is independent of Phase 1a (microphone analysis) and Phase 2c (ratings in
  suggestions) and shares no files with them.

## Why this matters

Most vinyl DJs do not own audio files for their records, so the Rekordbox XML
and local-audio enrichment paths cannot reach them. Today the only manual path
is the full track editor: a dialog with eleven fields, a free-text BPM input
and a 25-item key dropdown. Nobody annotates a record side with that while it
plays. A tap-tempo button, a Camelot wheel and a mode that walks a record from
A1 to B2 make "know the BPM and key of my records" possible for the whole
target demographic using the turntable they already own. It also lays the UI
groundwork that Phase 1a's microphone analysis will drop its results into.

## Current state

- `FormTrackEditorFields.vue:138-156` is a free-text BPM `Input` validated by
  `parseBPM` (30–300, decimals allowed).
- `FormTrackEditorFields.vue:177-200` is a `Select` over
  `getKeyOptionsForComposite`, 24 keys plus "Not specified", listed minor
  then major, no colour and no wheel.
- `InspectorTrack.vue:111-141` shows BPM and key read-only; its only action
  is "Edit", which opens the full dialog through
  `trackEdit.openEditTrackDialog`.
- `SectionRecordTracks.vue:62-64` renders `{{ track.key }}`, the raw pitch
  class integer, instead of a formatted key. This is a visible defect in the
  record dialog and is fixed in Step 3 because the component is rewritten.
- `tracksStore.updateTrack(id, updates, { expectedUpdatedAt, onConflict })`
  (`tracksStore.ts:619`) is the single-track write path with a version
  precondition and a conflict callback. `DialogTrackEdit.vue:170-207` shows the
  established conflict-review pattern.
- `keyFunctions.ts` already holds `pitchClassMap` with Camelot numbers and
  per-key colours, `createKeyComposite`, `parseKeyComposite`,
  `getFormattedKeyString` and `getKeyColour`. No wheel geometry exists.
- `capabilities.canMutateLibrary` gates every write surface; Demo is
  read-only (`useWorkbench.ts:93`).
- No tap-tempo or keyboard-annotation code exists anywhere in `app/`.
- `test/nuxt/track-editors.nuxt.test.ts` enforces that `DialogTrackEdit` and
  `DialogTrackDetails` share the exact form field contract. Any change to
  the fields must keep both dialogs in parity.
- `check:conventions` requires type-first PascalCase component names from the
  `COMPONENT_KIND_NAMES` list (`Picker`, `Control`, `Panel`, `Dialog`,
  `Button` are all valid prefixes).

## Commands you will need

| Purpose     | Command                                                                                                                                                  | Expected on success    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Unit        | `npx vitest run --project unit app/utils/tapTempo.test.ts app/utils/camelotWheel.test.ts`                                                                | all pass               |
| Component   | `npx vitest run --project nuxt test/nuxt/track-editors.nuxt.test.ts test/nuxt/FormTrackEditorFields.nuxt.test.ts test/nuxt/track-quick-set.nuxt.test.ts` | all pass               |
| Stores      | `npx vitest run --project stores`                                                                                                                        | all pass               |
| Conventions | `npm run check:conventions && npm run check:tailwind-canonical`                                                                                          | exit 0                 |
| Bundle      | `npm run build && npm run check:client-bundle-budget`                                                                                                    | within existing budget |
| Full gate   | `npm run verify`                                                                                                                                         | exit 0                 |

## Scope

**In scope**:

- a pure tap-tempo estimator with reset, outlier rejection and a stability
  signal
- a Camelot wheel key picker component, keyboard-operable, in both notations
- a compact "quick set" control (BPM tap + key wheel) embedded in the track
  inspector and the two track editor dialogs
- a record annotation mode in the record details dialog that walks tracks in
  position order with keyboard shortcuts
- optimistic single-track writes through `updateTrack` with the existing
  version precondition and conflict handling
- the `SectionRecordTracks` key display defect
- component and unit tests, documentation

**Out of scope**:

- any change to `audio_features`, Evidence, enrichment, fill-only rules
- database migrations, Edge Functions, generated types
- microphone or line-in analysis (Phase 1a)
- half/double-time detection beyond the explicit ×2 and ÷2 buttons
- writing BPM or key from the Session deck (a later, separate plan once the
  deck has a write path)
- time signature, duration or any other field

## Product contract

| Surface                       | What the user can do                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Track inspector (Tracks page) | Tap BPM, pick key on the wheel, see the value land without opening a dialog                               |
| Track editor dialogs          | Same control sits above the existing BPM input and key select; both stay in sync                          |
| Record details dialog         | "Annotate" enters a mode that focuses one track at a time, A1 → B2, with tap, key and next/prev shortcuts |
| Demo workspace                | Controls render disabled with the existing read-only affordance; no writes                                |

Language: the control is labelled **Tap tempo** and **Key**. Do not use
"enrichment", "evidence" or "analysis" on these surfaces; those words belong to
the file-based workflow.

## Git workflow

- Branches, stacked so each can be reviewed alone (base listed in each PR):
  - `claude/079-tap-tempo-utilities` (plan documents and Step 1)
  - `claude/079-quick-set-controls` (Step 2, based on the first)
  - `claude/079-record-annotation` (Steps 3 and 4, based on the second)
- Commits (one per step, Conventional Commits):
  - `feat(tracks): add tap tempo estimator and camelot wheel utilities`
  - `feat(tracks): add quick BPM and key controls to inspector and editors`
  - `feat(records): add record annotation mode`
  - `docs(tracks): document manual BPM and key entry`

## Steps

### Step 1: Pure utilities

Create `app/utils/tapTempo.ts`:

- `createTapTempo(options?)` returning `{ tap(timestampMs), reset(), state }`
  where `state` is `{ bpm: number | null, tapCount, stable: boolean }`.
- Keep the last 8 intervals. Discard an interval shorter than 200 ms (over 300
  BPM) or longer than 2,000 ms (under 30 BPM) and treat the latter as a new
  tap sequence. Drop intervals more than 25 % from the running median before
  averaging. Round the displayed BPM to one decimal; store full precision.
- `stable` is true after 4 accepted intervals whose spread is under 2 %.
- Export `halveBpm` and `doubleBpm` that clamp to `parseBPM` bounds and return
  `null` when out of range.

Create `app/utils/camelotWheel.ts`:

- `CAMELOT_WHEEL_SEGMENTS`: 24 entries derived from `pitchClassMap`, each
  `{ composite, pitchClass, mode, camelotNumber, label, colour, startAngle, endAngle, ring }`
  with major on the outer ring and minor on the inner ring, number 1 at
  twelve o'clock, clockwise ascending, so adjacent numbers sit next to each
  other as on a physical wheel.
- `getWheelNeighbours(composite)` returning the compatible composites (same
  number other ring, ±1 same ring) for highlighting.
- `moveSelection(composite | null, direction)` for `ArrowLeft/Right`
  (±1 number, same ring), `ArrowUp/Down` (switch ring), used by the picker's
  keyboard handling.
- Labels use `getFormattedKeyString` so the wheel respects the user's
  `key_format` preference while the layout stays Camelot.

Add colocated `tapTempo.test.ts` and `camelotWheel.test.ts`: interval
rejection, median outlier drop, stability threshold, reset, halve/double
clamping, all 24 segments present exactly once, neighbour sets, selection
movement wrap-around at 12 → 1.

**Verify**: `npx vitest run --project unit app/utils/tapTempo.test.ts app/utils/camelotWheel.test.ts` passes with no component imports.

### Step 2: Quick set control, inspector and editors

Create `app/components/tracks/PickerKeyWheel.vue`:

- Inline SVG, 24 `<button role="radio">` segments inside a
  `role="radiogroup"`, `aria-label="Key"`, each labelled with the formatted
  key. Uses segment colours from `camelotWheel.ts`; the selected segment gets a
  ring, compatible neighbours a lighter outline.
- `v-model` of the composite string (`'none'` for cleared). A "Clear" button
  below the wheel.
- Arrow keys move selection with `moveSelection`; `Enter`/`Space` confirm;
  `Escape` clears focus without changing the value.
- Tailwind only; the wheel scales to its container, minimum 176 px, with
  `prefers-reduced-motion` honoured for the selection transition.

Create `app/components/tracks/ControlTapTempo.vue`:

- A large "Tap" button (spacebar when focused), the live BPM readout with the
  stability indicator, tap count, "Reset", "×2", "÷2" and "Use" buttons.
- Emits `update:bpm` only on "Use" (or `Enter`), never on every tap, so a
  misfire does not write.
- The button's `aria-live="polite"` region announces the current estimate.

Create `app/components/tracks/PanelTrackQuickSet.vue`:

- Props: `track`, `readOnly`. Composes `ControlTapTempo` and `PickerKeyWheel`.
- Writes through a new composable `app/composables/useTrackQuickSet.ts`:
  - `setBpm(track, bpm)` and `setKey(track, composite)` call
    `tracks.updateTrack(track.id, patch, { silent: true, expectedUpdatedAt: track.updated_at, onConflict })`.
  - Key and mode are always written together, mirroring `parseKeyComposite`.
  - On conflict, show `NoticeTrackEditConflict`-style copy inline ("This track
    changed elsewhere. Reload to continue.") and re-enable after the store
    refreshes; never retry blind.
  - A pending write disables the "Use" and wheel buttons for that field only.
- The panel shows the current value next to each control so the user sees
  before/after.

Embed:

- `InspectorTrack.vue`: render `PanelTrackQuickSet` between the BPM/key/time
  strip and the `<dl>`, hidden when `readOnly`. Keep the "Edit" button for
  everything else.
- `FormTrackEditorFields.vue`: add `PanelTrackQuickSet`-equivalent inputs that
  bind to the form fields (`bpmValue`, `keyCompositeValue`) rather than writing
  directly, since the dialog owns submission. Implement this as an optional
  slot or a `mode="form"` prop on the control components, not a second copy of
  them. Both `DialogTrackEdit` and `DialogTrackDetails` pick it up through the
  shared form component, so the parity test stays green.

Add `test/nuxt/track-quick-set.nuxt.test.ts`:

- tapping four times at a 500 ms stub clock shows 120.0 and `stable`
- "Use" calls `updateTrack` once with `{ bpm }` and the track's
  `expectedUpdatedAt`
- choosing a wheel segment writes `{ key, mode }` together; "Clear" writes
  `{ key: null, mode: null }`
- a conflict callback renders the inline notice and makes no second write
- `readOnly` renders no interactive controls
- keyboard: ArrowRight from 8A selects 9A; ArrowUp from 8A selects 8B

Extend `FormTrackEditorFields.nuxt.test.ts` so the wheel updates
`keyComposite` and the tap control updates `bpm` in form mode, and keep
`track-editors.nuxt.test.ts` passing unchanged.

**Verify**: component tests pass; `npm run check:conventions` passes;
production build keeps `/tracks` and the editor chunks inside the existing
bundle budget (the wheel is SVG and small; if the chunk grows by more than
8 KB gzip, lazy-load the panel with `LazyPanelTrackQuickSet`).

### Step 3: Record annotation mode

In `DialogRecordDetails.vue` add an **Annotate** toggle next to "Add Track"
(hidden when `!capabilities.canMutateLibrary`). When active:

- `SectionRecordTracks.vue` renders a focused row for one track with the
  `PanelTrackQuickSet` expanded beneath it, and the other tracks collapsed to
  their one-line summary. Order is `sortTracksByPosition` (already exists in
  `app/utils/sortTracksByPosition.ts`).
- Shortcuts while the dialog has focus and no text input is active (reuse the
  `isEditableTarget` guard pattern from `CommandWorkbench.vue:23-29`):
  `J`/`ArrowDown` next track, `K`/`ArrowUp` previous, `Space` tap,
  `Enter` use BPM, `Escape` leave annotation mode. Show the shortcuts in a
  one-line legend under the toggle.
- Advancing to the next track does not write anything; only "Use" and the
  wheel write. A tap sequence resets when the focused track changes.
- Progress line: "3 of 6 tracks have BPM and key".

Fix `SectionRecordTracks.vue:62-64` to render
`getFormattedKeyString(track.key, track.mode, preferences.currentKeyFormat, 'short')`
with `getKeyColour`, or `–` when unset, and show BPM to one decimal.

Add tests to `test/nuxt/record-details-annotation.nuxt.test.ts`: order
follows position sort including `null` positions last; `J`/`K` move focus and
wrap; `Space` does not fire while an input is focused; leaving the mode keeps
values already written; Demo renders no toggle; the key cell shows `8A`, not
`0`.

**Verify**: new and existing record-details tests pass; the dialog still meets
the keyboard focus behaviour covered by `library-mutation-dialogs.nuxt.test.ts`.

### Step 4: Documentation

- Add a short "Manual BPM and key" section to `docs/track-enrichment.md`
  stating that manual values write directly to `bpm`, `key`, `mode`, do not
  create Evidence, and are never overwritten by the fill-only enrichment path
  because that path only fills nulls.
- README feature list: change the "BPM & Key" bullet to mention tap tempo and
  the key wheel.
- Update the status row in `plans/README.md`.

**Verify**: `npm run format`, `npm run check:conventions`, `npm run verify`.

## Test plan

Unit: estimator maths and wheel geometry (Step 1). Component: quick-set
writes, conflict path, read-only, keyboard, form-mode parity (Step 2);
annotation order, shortcuts, progress, key cell (Step 3). Stores: unchanged
suite must pass since `updateTrack` is not modified. E2E: none required; if
`workbench-rendering.e2e.test.ts` asserts the inspector's DOM shape, update
the assertion rather than hiding the panel.

## Done criteria

- [x] A user on the Tracks page can set BPM by tapping and key by clicking a wheel without opening the editor dialog.
- [x] Both editor dialogs expose the same controls bound to the form, and `track-editors.nuxt.test.ts` passes unchanged.
- [x] Record details has an annotation mode that walks tracks in position order with keyboard shortcuts and shows progress.
- [x] Every write goes through `updateTrack` with `expectedUpdatedAt`; a conflict is shown and never silently overwritten.
- [x] `audio_features`, enrichment, schema and Edge code are byte-identical to the baseline.
- [x] Demo renders the surfaces read-only with no write attempt.
- [x] The record dialog shows a formatted key instead of a raw integer.
- [x] Bundle budget, conventions and `npm run verify` pass.

## STOP conditions

Stop and hand off if: the shared form-field contract test cannot be kept green
without forking `FormTrackEditorFields`; the quick-set write needs a change to
`updateTrack`'s signature or to the version precondition; the wheel cannot be
made keyboard-operable with the existing `ui` primitives; or anyone proposes
recording manual entry in `audio_features`, which would require the Evidence
source-key enum and its database trigger to change and belongs to a separate
plan.

## Maintenance notes

The estimator and wheel utilities are deliberately framework-free so Phase 1a
(microphone analysis) can reuse `PanelTrackQuickSet` as the landing surface
for its proposed values, and Phase 2a (the Bag) can reuse `PickerKeyWheel`
for filtering. Keep them in `app/utils` and `app/components/tracks`.
