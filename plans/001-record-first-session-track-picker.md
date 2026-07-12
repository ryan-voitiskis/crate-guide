# Plan 001: Redesign the session track picker around physical records

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 47c8b37..HEAD -- \
>   app/components/session/DialogLoadTrack.vue \
>   app/components/session/CardRecordBrowse.vue \
>   app/components/session/CardRecordLoadTrack.vue \
>   app/utils/loadTrackPicker.ts \
>   app/utils/loadTrackPicker.test.ts \
>   app/stores/sessionStore.ts \
>   app/stores/__tests__/sessionStore.test.ts
> ```
>
> Also run `git status --short`. Execute from a clean branch or isolated
> worktree. If any in-scope file changed since this plan was written, compare
> the "Current state" excerpts against the live code before proceeding; on a
> material mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (roughly one to two focused days including browser QA)
- **Risk**: MED — this replaces the main manual track-loading interaction and
  makes a small behavior change to deck RPM
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `47c8b37`, 2026-07-10

## Why this matters

Crate Guide currently asks a vinyl DJ to choose from a flat list of tracks.
That data shape does not match the physical task: the user normally identifies
a sleeve or catalogue number in a crate, then chooses a side/position such as
A1 or B2. Repeating a 48-pixel cover for every track wastes the strongest
recognition cue, removes release context from exact track searches, and makes
label or catalogue-number searches impossible.

After this plan lands, the picker will treat a **record** as the search-result
unit and a **track** as the final action. With no query it will work as a visual
sleeve browser. With a query it will return ranked record cards containing a
bounded, position-sorted track preview; a matched track will always be visible
and highlighted. A crate selector will let the digital scope match the
physical crate in front of the user.

Use the product term **record**, not **album**, in code and UI: the collection
contains singles, EPs, compilations, and albums.

## Current state

### Relevant files

- `app/components/session/DialogLoadTrack.vue` — owns search state, renders the
  current flat track list, and calls `session.loadTrack`.
- `app/components/session/DeckColumn.vue` — owns one dialog-open ref per deck;
  it should not need to change.
- `app/stores/tracksStore.ts` — provides `playableTracks` and
  `getTracksByRecordId`; do not change its generic search behavior for this
  feature.
- `app/stores/recordsStore.ts` — provides release metadata and record lookup.
- `app/stores/cratesStore.ts` — provides crates whose `records` arrays contain
  record IDs in crate order.
- `app/stores/sessionStore.ts` — owns deck state and track loading. It does not
  currently synchronize deck RPM from the selected track.
- `app/utils/sortTracksByPosition.ts` — existing non-mutating A1/A2/B1-aware
  sorter; reuse it rather than writing another position parser.
- `app/stores/__tests__/sessionStore.test.ts` and
  `app/utils/sortTracksByPosition.test.ts` — test-style exemplars.

### Existing behavior excerpts

`app/components/session/DialogLoadTrack.vue:18-27` currently computes a flat,
100-item track list:

```ts
const searchQuery = ref('')

const filteredTracks = computed(() => {
	const playable = tracks.playableTracks
	if (!searchQuery.value.trim()) return playable.slice(0, 100)
	return tracks
		.searchTracks(searchQuery.value)
		.filter((t) => t.playable)
		.slice(0, 100)
})
```

`app/components/session/DialogLoadTrack.vue:68-100` constrains the dialog to
`sm:max-w-xl`, gives the result area a fixed 400-pixel height, and repeats a
48-pixel cover inside every track button:

```vue
<DialogContent class="overflow-hidden sm:max-w-xl">
	<!-- ... -->
	<ScrollArea class="h-[400px]">
		<button v-for="track in filteredTracks" :key="track.id">
			<div class="size-12" />
		</button>
	</ScrollArea>
</DialogContent>
```

`app/stores/tracksStore.ts:348-386` searches track titles, track artists,
extra artists, genres, positions, and BPM. It does not join records, so it
cannot match release title, release artist, label, or catalogue number.

`app/stores/recordsStore.ts:359-369` separately knows how to search release
title, release artist, label name, and year, but its search result has no track
context and it also omits `label.catno`. The session picker must therefore use
a purpose-built, pure join/search helper rather than trying to combine the two
store search states.

`app/stores/sessionStore.ts:137-146` loads the selected track but leaves deck
RPM unchanged:

```ts
function loadTrack(trackId: string, deckIndex: number, matchTempo = false) {
	const track = tracks.getTrackById(trackId)
	if (!track) return

	const deck = decks.value[deckIndex]
	if (!deck) return

	deck.loadedTrack = track
```

`app/utils/sortTracksByPosition.ts` already supplies the required physical
track order:

```ts
export function sortTracksByPosition(tracks: Track[]): Track[] {
	return [...tracks].sort((a, b) => {
		if (!a.position && !b.position) return 0
		if (!a.position) return 1
		if (!b.position) return -1
		return a.position.localeCompare(b.position, undefined, {
			numeric: true,
			sensitivity: 'base'
		})
	})
}
```

### Repository conventions to preserve

- Nuxt 4 SPA, Vue 3 Composition API, TypeScript, Pinia, Tailwind CSS v4,
  shadcn-vue/reka-ui.
- Component names are type-first PascalCase. Use the planned names
  `CardRecordBrowse.vue` and `CardRecordLoadTrack.vue`.
- Use Tailwind utility classes only. Do not add `<style>` blocks or `@apply`.
- Components and utilities are auto-imported according to `nuxt.config.ts`.
- Reuse the existing `Dialog`, `ScrollArea`, `Select`, `Input`, `Button`, and
  `Badge` primitives. Do not add a component dependency.
- Use theme tokens such as `bg-accent`, `bg-primary/10`, `text-muted-foreground`,
  `border-border`, and focus-ring utilities; do not hard-code a new palette.
- Use `sortTracksByPosition` for track order.
- Run `npm run format` after changes.
- Commits use Conventional Commits; a suitable final message is
  `feat(session): redesign record-first track picker`.

## Commands you will need

| Purpose               | Command                                                                     | Expected on success                             |
| --------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| Focused utility tests | `npx vitest run --project unit app/utils/loadTrackPicker.test.ts`           | exit 0; all picker cases pass                   |
| Focused store tests   | `npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts` | exit 0; all session cases pass                  |
| Full tests            | `npm run test:run`                                                          | exit 0; all unit, store, and server tests pass  |
| Format                | `npm run format`                                                            | exit 0; only intended formatting changes remain |
| Lint                  | `npm run lint`                                                              | exit 0; no errors                               |
| Typecheck             | `npm run typecheck`                                                         | exit 0; no TypeScript errors                    |
| Build                 | `npm run build`                                                             | exit 0; Nuxt production build completes         |
| Existing E2E          | `npm run test:e2e`                                                          | exit 0; existing login redirect tests pass      |

Do not run an install unless dependencies are actually missing. This plan adds
no packages and must not modify `package.json` or the lockfile.

## Suggested executor toolkit

- Use the in-app browser or the repository's Playwright tooling for the final
  interaction and responsive checks. Verify the actual rendered dialog rather
  than inferring layout from classes.
- Use the existing authenticated local app if available. Do not put credentials
  or session data into tests or plan files.

## Scope

**In scope** — these are the only source/test files to modify or create:

- `app/components/session/DialogLoadTrack.vue`
- `app/components/session/CardRecordBrowse.vue` (create)
- `app/components/session/CardRecordLoadTrack.vue` (create)
- `app/utils/loadTrackPicker.ts` (create)
- `app/utils/loadTrackPicker.test.ts` (create)
- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `plans/README.md` — status update only when implementation is complete

**Out of scope** — do not touch these even though they look adjacent:

- `app/stores/tracksStore.ts` and its tests — generic track search still serves
  other pages; do not broaden or replace it here.
- `app/stores/recordsStore.ts` and its tests — do not couple the dialog to the
  record page's mutable search state.
- `app/stores/cratesStore.ts` — its existing getters are sufficient.
- `app/components/session/DeckColumn.vue` — the dialog contract remains
  `v-model:open` plus `deck-index`.
- `app/components/session/SuggestionCard.vue` and suggestion ranking.
- Database schema, migrations, Supabase queries, Discogs import, and Rekordbox
  enrichment.
- Persisting the chosen crate across browser reloads or devices.
- Changing whether non-playable tracks are globally considered playable.
- Adding virtualisation. The initial implementation may cap browse/search
  records as described below; profile before adding complexity.
- Any dependency upgrade or package addition.

## Git workflow

- Start only from a clean, up-to-date base. Prefer an isolated worktree.
- Branch: `codex/001-record-first-track-picker`.
- Preserve any unrelated user changes. Never reset, clean, or check out over
  them.
- One final logical commit is sufficient:
  `feat(session): redesign record-first track picker`.
- Do not push or open a PR unless the operator explicitly asks.

## Target interaction contract

The following behavior is decided and should not be redesigned during
implementation.

### Common dialog chrome

- Retain the title `Load Track to Deck N`.
- Replace the description with language that mentions finding a physical
  record, for example `Find a record, then choose the track you are loading.`
- Make the desktop dialog approximately `max-w-4xl` and at most 80dvh tall,
  with a fixed header/toolbar and exactly one outer scrolling results region.
- Use a full-width/single-column toolbar on narrow screens and search plus crate
  scope side-by-side from the `sm` breakpoint.
- Search placeholder:
  `Search records, tracks, artists, labels or cat. no.`
- Keep search focused when the dialog opens. Clearing/closing the dialog resets
  the query and focused/expanded record, but does not reset crate scope.
- A successful track click keeps the existing behavior: load to the target
  deck, close the dialog, and clear transient picker state.

### Empty-query browse mode

- Render record sleeves, not track rows.
- Use a responsive two-column grid on narrow screens and three or four columns
  on desktop. Artwork should be square and visually dominant.
- Each tile shows cover art (or an `ImageOff` fallback), record title, record
  artist, and the first label's catalogue number when present.
- Only show records that contain at least one playable track within the active
  scope.
- Selecting a tile replaces the grid inside the same dialog with a focused
  record view. The focused view has a Back button, prominent artwork and release
  metadata, and the complete position-sorted playable tracklist. It still uses
  the dialog's outer results scroll; it must not create an inner scrollbar.
- In `All records`, preserve the order of `records.records`. In a selected
  crate, preserve the order of the crate's `records` ID array.
- Limit the initial all-record sleeve browser to 100 records, matching the
  current safety cap. If the active scope contains more, show a quiet message
  asking the user to search or choose a crate rather than rendering an unbounded
  list.

### Query-present search mode

- Render one result card per record, never one row per matching track.
- Each result card has 128–144px artwork on desktop, stacked above content on
  narrow screens, plus release title, release artist, label, catalogue number,
  and year when present.
- Show at most five position-sorted track rows by default. A `Show N more`
  control expands that one card into the outer results flow. Expanded cards do
  not receive their own scrollbar.
- Each track row is a real button and includes: position, title, BPM, formatted
  key, and 33/45 RPM when known. Missing values are omitted rather than rendered
  as misleading zeroes.
- A track currently loaded on any deck receives a subdued `Deck N` badge.
  Tracks already present in `session.currentSession` receive a subdued `Played`
  badge. These tracks remain selectable.
- Track-level matches receive a clear but non-destructive highlight using theme
  tokens. Preserve the search input's focus while bringing the first matched
  track into the outer scroll region.
- `ArrowDown` in the search input moves focus to the first visible track button.
  Native Tab, Shift+Tab, Enter, and Space behavior must continue to work. Do not
  implement a bespoke command-palette dependency.
- Search mode may cap at 50 record results. Display a result count and a quiet
  truncation message if more matches exist.

### Search fields and ranking

Search is local and synchronous over data already loaded in Pinia. It must be
case-insensitive and whitespace-normalized. Split the normalized query into
tokens and require every token to appear somewhere in the joined record/track
search document so multi-term searches such as `shadowax trp026` work across
fields.

Include these fields:

1. Label catalogue number (`record.labels[].catno`)
2. Track title
3. Record title
4. Track artist and record artist
5. Label name
6. Track position
7. Track genre and record year as lower-priority fallback fields

Rank exact and prefix matches ahead of substring-only matches, with this field
priority:

1. Exact catalogue number
2. Exact track title
3. Exact record title
4. Prefix catalogue number or title
5. Artist
6. Label
7. Position, genre, and year

Use deterministic tie-breaking: first by score descending, then by the active
scope's original record order. Do not use fuzzy-edit-distance matching in this
plan.

`matchedTrackIds` should contain a track when the query directly matches any of
that track's title, artists, position, or genres. A match that exists only in
record metadata returns the record without highlighting an arbitrary track.

### Matched-track preview rule

Never reorder a record's tracks just to place matches first; physical position
order is part of the user's mental model. The five-row preview must nevertheless
contain the first matched track:

- Sort all playable tracks with `sortTracksByPosition`.
- If there is no track-level match, preview the first five.
- If the first matched track is outside the first five, choose a contiguous
  five-track window containing it, with up to two preceding tracks when
  possible.
- Highlight every matched track that falls within the window.
- `Show N more` reveals all tracks in their original position order.

### Crate scope

- Add `loadTrackCrateId: Ref<string | null>` to `useSessionStore` UI state and
  return it from the store. `null` means `All records`.
- Add a small setter only if it keeps the component simpler; direct v-model on
  the Pinia ref is acceptable if it matches existing store usage.
- The dialog reads `crates.crates` for selector options and the selected crate's
  `records` ID list for scope and ordering.
- If the selected crate is deleted or unavailable, safely fall back to
  `All records` rather than showing an empty picker.
- Do not persist this preference to Supabase. It is session UI state only.
- `clearSession()` should not reset the crate scope: clearing played history
  does not mean the physical crate has changed.

### RPM behavior

- In `sessionStore.loadTrack`, after validating the target deck and before
  recording session history, set `deck.rpm` when `track.rpm` is exactly `33` or
  `45`.
- When `track.rpm` is null or another number, leave the existing deck RPM
  unchanged.
- Do not change pitch/reset behavior as part of this step.

## Steps

### Step 1: Add deterministic record grouping, search, and preview utilities

Create `app/utils/loadTrackPicker.ts`. Keep it pure: no Pinia imports, DOM
access, Vue refs, or mutation of its inputs.

Export these types/functions (names may vary only if the replacement is equally
explicit and all callers/tests use it consistently):

```ts
export type LoadTrackRecordResult = {
	record: DatabaseRecord
	tracks: Track[]
	previewTracks: Track[]
	matchedTrackIds: string[]
	score: number
}

export type BuildLoadTrackResultsOptions = {
	records: DatabaseRecord[]
	tracks: Track[]
	query: string
	recordOrder?: string[]
}

export function buildLoadTrackRecordResults(
	options: BuildLoadTrackResultsOptions
): LoadTrackRecordResult[]

export function getLoadTrackPreview(
	tracks: Track[],
	matchedTrackIds: string[],
	limit?: number
): Track[]
```

Implementation requirements:

1. Filter to playable tracks before grouping.
2. Group tracks by `record_id` with a `Map`, not repeated full-array filters.
3. Drop records with no playable tracks.
4. Sort each grouped track array with `sortTracksByPosition`.
5. Apply the token inclusion rule, field scoring, deterministic tie-break, and
   matched-track rule from the target interaction contract.
6. Preserve the caller's input arrays.
7. Use the supplied `recordOrder` for crate ordering; otherwise preserve the
   `records` input order.

Create `app/utils/loadTrackPicker.test.ts`, using the existing record and track
fixture factories where convenient. Cover at least:

- empty query groups multiple tracks under one record;
- records with only non-playable tracks are omitted;
- track arrays are sorted A1/A2/B1 and inputs are not mutated;
- record title, track title, record artist, track artist, label name, catalogue
  number, position, genre, and year each find the expected record;
- catalogue-number exact match ranks above weaker substring results;
- `shadowax trp026`-style tokens can match across artist and catalogue fields;
- crate `recordOrder` filters and orders results correctly;
- record-only matches leave `matchedTrackIds` empty;
- a track-title match populates `matchedTrackIds`;
- a first match at track index 7 produces a five-track contiguous preview that
  contains the match and preserves physical order;
- empty and whitespace-only queries are equivalent.

**Verify**:

```bash
npx vitest run --project unit app/utils/loadTrackPicker.test.ts
```

Expected: exit 0 and all new utility tests pass.

### Step 2: Add the browse tile and record-with-tracks components

Create `app/components/session/CardRecordBrowse.vue` for the no-query sleeve
grid. It accepts one `DatabaseRecord`, emits `select`, and has one accessible
button covering the tile. Use an `<img>` with `object-cover` when a cover exists
and an `ImageOff` fallback otherwise. Add `data-testid="load-track-record-tile"`
and `:data-record-id="record.id"` to support browser verification.

Create `app/components/session/CardRecordLoadTrack.vue` for search-result and
focused-record rendering. Suggested props:

```ts
{
	result: LoadTrackRecordResult
	expanded?: boolean
	loadedDeckByTrackId: Record<string, number>
	playedTrackIds: Set<string>
}
```

Suggested emits:

```ts
{
	selectTrack: [trackId: string]
	toggleExpanded: []
}
```

Requirements:

- Render release art/metadata once per record.
- Render either `result.previewTracks` or all `result.tracks` based on
  `expanded`.
- Use `getFormattedKeyString` and `getKeyColour` exactly as the current dialog
  does, retaining the user's current key format.
- Give every track button `data-testid="load-track-option"`,
  `:data-track-id="track.id"`, and
  `:data-track-match="result.matchedTrackIds.includes(track.id)"`.
- Apply visible `focus-visible` styles and at least a 32px row height.
- Do not nest a `ScrollArea` in this component.
- Keep the responsive card stacked on narrow widths and side-by-side from `sm`.
- Preserve one click/Enter as the final load action. Clicking artwork or record
  metadata must not accidentally load a track.

**Verify**:

```bash
npm run typecheck
```

Expected: exit 0 with both new components auto-resolving and no prop/emit type
errors.

### Step 3: Replace the flat dialog with browse, focused-record, and search modes

Refactor `app/components/session/DialogLoadTrack.vue` to orchestrate the two new
components and the pure utility.

Add/use:

- `useCratesStore()` for the scope selector;
- `searchQuery` for transient query state;
- `focusedRecordId` for browse-to-record navigation;
- a `Set<string>` of expanded search result record IDs;
- computed scope record IDs/order from `session.loadTrackCrateId`;
- computed results from `buildLoadTrackRecordResults`;
- computed `playedTrackIds` and `loadedDeckByTrackId` maps;
- one dialog/results-root ref for scroll-into-view and keyboard focus movement.

Render exactly one of:

1. sleeve grid: no query and no focused record;
2. focused record: no query and a focused record;
3. grouped search results: query present.

Add `data-testid="load-track-dialog"` to dialog content,
`data-testid="load-track-search"` to the input, and
`data-testid="load-track-results"` to the one outer results region.

When query results change, use `nextTick` and a query scoped to the dialog root
to bring the first `[data-track-match="true"]` into the outer results viewport
with `scrollIntoView({ block: 'nearest' })`. Do not focus it automatically; the
user must be able to continue typing. `ArrowDown` from the input may explicitly
focus the first visible track button.

The crate selector should be hidden when no crates exist. When crates do exist,
show `All records` followed by crate names and optional record counts. A stale
selected crate ID must reset/fallback to null before building results.

Keep `handleTrackClick` as the single loading path. It calls
`session.loadTrack(trackId, props.deckIndex, false)`, closes the dialog, and
clears query/focus/expanded state. `handleOpenChange(false)` performs the same
transient reset without clearing `session.loadTrackCrateId`.

Empty states must distinguish:

- no playable records in the selected crate;
- no matches for the current query;
- a focused record becoming unavailable because data changed.

**Verify**:

```bash
npm run typecheck
npm run lint
```

Expected: both exit 0; no Vue template, auto-import, accessibility, or lint
errors.

### Step 4: Share crate scope in session UI state and synchronize known RPM

Update `app/stores/sessionStore.ts`:

1. Add `loadTrackCrateId = ref<string | null>(null)` beside the existing UI
   state and return it from the store.
2. Do not clear it in `clearSession`.
3. In `loadTrack`, after finding the track and deck, set `deck.rpm` only when
   `track.rpm === 33 || track.rpm === 45`.

Update `app/stores/__tests__/sessionStore.test.ts` with tests proving:

- loading a 45 RPM track sets the target deck to 45;
- loading a 33 RPM track sets the target deck to 33;
- loading a null/unsupported RPM track preserves the deck's existing RPM;
- `clearSession()` preserves `loadTrackCrateId`;
- a fresh session store defaults `loadTrackCrateId` to null.

Use `createMockTrack` and the existing `loadTrack`/`setRpm` test style. Do not
change session history or pitch assertions beyond what the RPM behavior
requires.

**Verify**:

```bash
npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts
```

Expected: exit 0; all existing and new session-store tests pass.

### Step 5: Format and run the full automated gate

Run formatting only after source/test changes are complete. Because the
project's required formatter targets the whole repository, execute this step
only in the clean branch/worktree required by this plan. If it modifies an
unrelated file, do not revert or stage that file automatically; stop and report.

```bash
npm run format
git status --short
npm run test:run
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Expected:

- every command exits 0;
- `git status --short` contains only the in-scope source/test files plus the
  plan status update;
- no package or lockfile change exists;
- existing tests remain green.

### Step 6: Verify the real interaction in a browser

Start or reuse the local app, sign in through an existing authorized session,
and test with a collection containing multiple records and at least one record
with more than five playable tracks. Use an actual browser rather than only DOM
inspection.

Desktop checks at approximately 1280x720:

1. Open `Load Track` on Deck 1. Confirm the search field is focused, the dialog
   is wider than the old picker, and there is only one results scrollbar.
2. With no query, confirm covers are visually dominant and no tracklists are
   shown in the sleeve grid.
3. Select a sleeve, confirm the Back affordance and complete position-sorted
   tracklist, then return to the grid.
4. Select a crate. Confirm only its records appear and that the choice survives
   closing/reopening the dialog and opening the picker for another deck.
5. Search by release title, track title, artist, label name, and catalogue
   number. Confirm one card per record and the expected ranking.
6. Search for a track below position five. Confirm it is in the preview,
   highlighted, and brought into view without stealing focus from the search
   input.
7. Expand a long record. Confirm all tracks appear in position order and no
   nested scrollbar is introduced.
8. Use ArrowDown, Tab, Shift+Tab, Enter, Space, and Escape. Confirm focus is
   visible and Enter/Space loads only the focused track.
9. Confirm `Played` and `Deck N` badges appear without disabling selection.
10. Load a known 45 RPM track and confirm the target deck switches to 45. Load
    a track with unknown RPM and confirm the prior deck RPM remains unchanged.

Narrow checks at approximately 390x844:

1. Confirm the dialog fits the viewport and its toolbar stacks.
2. Confirm sleeve grid uses two columns without horizontal overflow.
3. Confirm record cards stack artwork above track content and every track button
   remains readable/selectable.
4. Confirm the close control, Back control, search input, crate selector, and
   final track action remain reachable by keyboard/touch.

Inspect browser console output after both passes. Expected: no Vue warnings,
hydration errors, uncaught exceptions, or failed asset loops. Save any QA
screenshots outside the repository unless the operator asks for committed
artifacts.

If no authenticated local browser/data set is available, this is a STOP
condition. Do not weaken the acceptance test or add a test-only production
route to manufacture data.

## Test plan

### Pure utility coverage

File: `app/utils/loadTrackPicker.test.ts`.

Model its structure on `app/utils/sortTracksByPosition.test.ts` and use fixtures
from `test/mocks/fixtures/records.ts` and `test/mocks/fixtures/tracks.ts` where
helpful. Tests must cover grouping, every promised search field, multi-token
matching, ranking, crate ordering, playable filtering, matched-track IDs,
preview-window behavior, and input immutability.

Verification:

```bash
npx vitest run --project unit app/utils/loadTrackPicker.test.ts
```

### Session-store coverage

File: `app/stores/__tests__/sessionStore.test.ts`.

Extend existing `loadTrack`, `setRpm`, and `clearSession` describe blocks. Cover
33, 45, null/unsupported RPM, default crate scope, and preservation through
session clearing.

Verification:

```bash
npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts
```

### Rendered acceptance coverage

Use the browser checklist in Step 6. The required evidence is observable state:
one result card per record, matched track visible/highlighted, correct crate
scope, no nested scroll area, correct keyboard loading, responsive layout, and
known RPM reflected on the target deck.

## Done criteria

All of the following must hold:

- [ ] `app/utils/loadTrackPicker.ts` groups playable tracks by record, supports
      all specified search fields/ranking, and returns deterministic previews.
- [ ] `npx vitest run --project unit app/utils/loadTrackPicker.test.ts` exits 0
      with tests for grouping, search, ranking, scoping, and preview windows.
- [ ] Empty-query mode renders cover-dominant record tiles and no tracklists.
- [ ] Query mode renders one card per record with at most five preview tracks.
- [ ] A deep matched track is visible, highlighted, and position order is not
      changed.
- [ ] Expanding a record uses the dialog's one outer scroll region; there are no
      nested tracklist scrollbars.
- [ ] Record title, track title, record/track artist, label, catalogue number,
      position, genre, and year searches pass the utility tests and browser
      checks.
- [ ] Crate scope is shared across deck pickers, falls back safely when stale,
      and survives `clearSession()`.
- [ ] Track rows show position/title and optional BPM, key, RPM, Played, and
      Deck N metadata without disabling repeat selection.
- [ ] Loading known 33/45 RPM sets the deck speed; unknown RPM preserves it.
- [ ] `npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts`
      exits 0 with the new RPM and crate-state assertions.
- [ ] Desktop and 390px browser checks pass with no horizontal overflow, nested
      results scroll, console errors, or inaccessible final actions.
- [ ] `npm run format`, `npm run test:run`, `npm run lint`,
      `npm run typecheck`, `npm run build`, and `npm run test:e2e` all exit 0.
- [ ] `git status --short` shows no source/test changes outside the in-scope
      list and no package/lockfile changes.
- [ ] `plans/README.md` marks Plan 001 DONE (or the reviewer confirms they own
      index reconciliation).

## STOP conditions

Stop and report back without improvising if:

- The working tree contains unrelated changes that formatting/testing could
  overwrite.
- Any in-scope file materially differs from the Current state excerpts after
  the drift check.
- Implementing the picker requires changing `tracksStore`, `recordsStore`,
  database queries/schema, or another out-of-scope file.
- The loaded data does not contain record labels/catalogue numbers in the
  `DatabaseRecord.labels` shape assumed here.
- Crate `records` arrays do not contain record IDs in their intended display
  order.
- The existing `Select` or `Dialog` primitive cannot support the specified
  responsive/accessibility behavior without modification.
- A search query over the current collection is visibly slow enough to require
  virtualisation or indexing; record a measurement and report rather than
  adding architecture not specified here.
- An authenticated browser/data set is unavailable for final rendered QA.
- A verification command fails twice after one reasonable in-scope correction.
- `npm run format` modifies unrelated files.
- Completing the work appears to require a new dependency.

## Maintenance notes

- Keep the grouping/search helper pure. Future server-side pagination or remote
  search should replace its data source, not leak network concerns into the
  record card components.
- Catalogue number is intentionally ranked highly because it is a primary
  physical-record identifier; reviewers should reject changes that demote it
  to incidental metadata without product discussion.
- Preserve track position order even when several tracks match. Search ranking
  orders records, not tracks within a record.
- The 100-record browse cap and 50-record search cap are initial safety limits.
  Revisit them only with measured render/search performance and a clear empty
  state for truncated results.
- Persisting crate scope to the user profile is deliberately deferred. Session
  UI state is sufficient for the first version and avoids a schema/profile
  change.
- Component-level automated rendering tests are deferred because this repo's
  current Vitest projects do not include Vue component mounting. The pure logic
  is unit-tested and the integrated UI has an explicit browser acceptance gate.
  If component-test infrastructure is added later, the `data-testid` contracts
  in this plan are the intended stable hooks.
- In review, scrutinize keyboard focus preservation, scroll ownership, match
  ranking, crate ordering, and the null/unsupported RPM path; those are the
  highest-risk regressions.
