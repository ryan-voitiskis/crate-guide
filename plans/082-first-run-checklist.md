# Plan 082: First-run checklist, DJ wording for the sources lens, README positioning

> **Executor instructions**: This plan delivers the code-only parts of Phase 0
> ("Point the ship") of
> [docs/product-direction-2026-11.md](../docs/product-direction-2026-11.md).
> It adds no tables, migrations, Edge Functions or telemetry. Every checklist
> step is derived from store state the workbench already loads. It must not
> touch `app/utils/trackSuggestions.ts`, `CardTrackSuggestion.vue`,
> `ListTrackSuggestions.vue`, `InspectorTrack.vue` (owned by the Phase 2c
> ratings work) or `PanelSessionHistory.vue`, `CardSessionHistoryTrack.vue`,
> `app/stores/sessionPlayback.ts` (owned by the Phase 2b set planner work).
>
> **Drift check (run first)**:
> `git diff --stat f90fa44..HEAD -- app/pages/index.vue app/pages/tracks.vue app/stores/tracksStore.ts app/stores/cratesStore.ts app/stores/sessionSavedSets.ts app/stores/discogsAuthStore.ts app/composables/useWorkbench.ts test/nuxt/tracks-page-performance.nuxt.test.ts README.md`
> If any of these changed, re-read them before editing and reconcile this plan.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: product / activation
- **Planned at**: commit `f90fa44`, 2026-11-25
- **Status**: DONE
- **Product context**: Phase 0 of the product direction doc. Telemetry, also
  listed in Phase 0, is out of scope until the maintainer makes a privacy
  decision.

## Why this matters

A new account lands on the Session page, which shows an empty state and
nothing else. The core loop (own records → know BPM/key → plan a set → pack
the bag) is invisible until the user finds each page on their own. The share
of tracks with both BPM and key is the product's activation metric, and today
only the Tracks page shows it. A checklist on the Session home turns the loop
into five visible steps and makes the BPM/key share the headline number.

The Tracks page "Evidence" toggle leaks internal provenance vocabulary into a
top-level control. The README has no statement of who the product is for.

## Current state

- `app/pages/index.vue` renders `StateEmptyCollection` with no records, a
  bare message with records but no tracks, and the decks otherwise. It fetches
  saved sets on mount when `capabilities.canPersistSessions`.
- `app/pages/tracks.vue:72-86` computes `missingBpmCount`, `missingKeyCount`
  and `missingAnalysisCount` with three passes over `tracks.tracks`.
- Discogs connection is `discogsAuth.isOAuthed` (derived from the profile's
  `discogs_username`). Records imported from Discogs carry a `discogs_id`.
- Crates and saved sets are already in Pinia (`crates.crates`,
  `session.savedSets`). Demo seeds records, tracks and crates but no saved
  sets, and every write capability is false.
- `ChecklistAuthPassword.vue` shows `Checklist` is an accepted component kind.

## Product decisions (made unattended, for maintainer confirmation)

| Question                                 | Decision                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When is "Connect Discogs" done?          | When Discogs is connected, or any record in the library came from Discogs (a user who connected, imported and later disconnected has done the step).                                                                                                                             |
| When is "Import records" done?           | When the library has at least one record, imported or added manually.                                                                                                                                                                                                            |
| When is "Add BPM and key" done?          | When at least 60% of tracks have both BPM and key. 60% is the product doc's success target for active accounts. 100% would keep the checklist up for nearly everyone; any lower makes the step meaningless.                                                                      |
| When is "Build a crate" done?            | When at least one crate exists.                                                                                                                                                                                                                                                  |
| When is "Plan a set" done?               | When at least one saved set exists. Until the first saved-set fetch settles the checklist is not shown, so it never flashes an incomplete step that is actually done.                                                                                                            |
| Where does each step link?               | Discogs → Settings (where the connection is managed); records → Records; BPM/key → Tracks (tap tempo, key wheel and the Enrich button); crate → Crates; set → the decks on the same page, so the step shows a hint instead of a link.                                            |
| Who sees it?                             | Any writable workspace with at least one step incomplete. "New or sparse" is defined by the steps themselves: a large library with no BPM/key or no crates still benefits, and the dismiss control covers anyone who does not want it.                                           |
| Demo / read-only                         | Hidden. None of the steps can be acted on in a read-only workspace, and the demo is seeded, so a checklist would either be wrong or a dead end.                                                                                                                                  |
| Dismissal storage                        | `localStorage` key `crate-guide-first-run-checklist-dismissed`, per browser rather than per account, so no account identifier is written to device storage. Reads and writes are wrapped in try/catch; if storage is unavailable the dismissal lasts for the page lifetime only. |
| Placement                                | Above the empty state with no records, above the "add tracks" message with records but no tracks, and as a compact strip above the decks otherwise.                                                                                                                              |
| Tracks page toggle wording               | "Evidence" becomes **Sources** ("Show where BPM and key came from"). The inspector empty state and the mobile sheet description on the Tracks page lose "retained Evidence" too. Internal names (`viewMode === 'evidence'`, `track-view-evidence`, the lens component) stay.     |
| Lens internals (`ListTrackEvidenceLens`) | Unchanged. The lens is an expert comparison view whose filters and labels are specified in the enrichment docs; renaming inside it is a separate decision.                                                                                                                       |

## Scope

**In scope**:

- `app/utils/trackAnalysisCoverage.ts`: one-pass BPM/key coverage summary,
  used by both the Tracks page and the checklist
- `app/utils/firstRunChecklist.ts`: pure step derivation
- `app/components/session/ChecklistFirstRun.vue`, lazy-loaded from
  `app/pages/index.vue`
- Tracks page toggle wording, its tests and the doc sentence that quotes it
- README positioning and target-segment section

**Out of scope**: telemetry, schema changes, the files owned by the sibling
sessions listed above, renaming the lens component or its internal labels.

## Steps

### Step 1: Coverage utility

Create `summarizeTrackAnalysisCoverage(tracks)` returning
`{ total, withBpm, withKey, withBpmAndKey, missingBpm, missingKey, missingAnalysis, percentWithBpmAndKey }`
in a single pass. A key counts only when both `key` and `mode` are set,
matching the existing Tracks page logic. `percentWithBpmAndKey` is floored so
the bar never claims 100% before every track is done; 0 tracks is 0%.
Replace the three computed counts in `tracks.vue` with one computed over this
helper. Colocated unit test.

### Step 2: Checklist derivation and component

`deriveFirstRunChecklist(input)` returns the five steps (`id`, `label`,
`description`, `done`, `href | null`), `completedCount`, `isComplete` and the
coverage summary. `FIRST_RUN_BPM_KEY_TARGET_PERCENT = 60`.

`ChecklistFirstRun.vue` reads the workbench stores, derives the steps, and
renders: a title, "N of 5 done", a dismiss button, the bar "N% of your tracks
have BPM and key" (`Progress`, with an accessible label), and an ordered list
of steps with a done/pending icon and a `NuxtLink` built with `getHref`
(so demo paths stay correct if it is ever shown there). It emits nothing;
dismissal is internal.

`index.vue` decides visibility cheaply (`capabilities.canMutateLibrary`,
loading flags settled, saved-set fetch settled, not dismissed, not complete)
and renders `LazyChecklistFirstRun` so the component stays out of the
initial bundle.

Nuxt test `test/nuxt/ChecklistFirstRun.nuxt.test.ts` and session page test
`test/nuxt/session-first-run.nuxt.test.ts`: step states from store state, the
live percentage, links, dismissal persisted and restored, storage throwing,
hidden when complete, hidden in a read-only workspace, hidden until saved
sets settle.

### Step 3: Sources wording

Rename the label, `aria-label` and the two explanatory strings in
`tracks.vue`. Update `tracks-page-performance.nuxt.test.ts` to assert the new
accessible name, and the `docs/track-enrichment.md` sentence that names the
"Tracks Evidence lens".

### Step 4: README

Add "Who it is for" with the one-line positioning and the segment table from
section 1 of the product direction doc.

## Verification

`npm run format`, `npm run check:conventions`, `npm run verify`,
`npm run audit:prod`, plus `npm run build && npm run check:client-bundle-budget`
for the lazy boundary.

## Done criteria

- [ ] A writable account with an incomplete step sees the checklist on the Session home in all three page states.
- [ ] The BPM/key bar shows the same numbers the Tracks page uses, from one shared helper.
- [ ] Dismissal survives a reload and degrades safely when storage throws.
- [ ] The checklist hides when every step is done and in demo/read-only workspaces.
- [ ] The Tracks page toggle says "Sources"; internal names are unchanged.
- [ ] README states the positioning and segments.
- [ ] Gates and bundle budget pass.

## Delivery notes

- Step links read **Connect Discogs**, **Start importing**, **Tap BPM and key**
  and **Make a crate**. They deliberately avoid the navigation labels
  (Settings, Records, Tracks, Crates, BPM & Key): a link named "Open
  Settings" made the existing E2E lookup of the Settings nav link ambiguous,
  and screen-reader link lists benefit from distinct names too. A unit test
  guards this.
- E2E coverage: `test/e2e/first-run-checklist.e2e.test.ts` signs in to an
  empty fixture account (which has saved sets, so 1 of 5 is done), checks the
  bar and a link, dismisses, and confirms the demo shows no checklist.
- The checklist loads as its own lazy chunk; the initial client JavaScript
  measured 740,792 raw / 234,801 gzip bytes, inside the 760,826 / 240,905
  limit.

## Review follow-ups (Astra, 2026-11-25)

- The saved-set fetch reruns whenever the workspace identity changes (sign-in
  finishing, an account switch while the page is kept alive), and only the
  latest fetch marks the list as known.
- The checklist also waits for the current owner's profile, so "Connect
  Discogs" cannot flash for a connected account, and treats
  `descriptor.readOnly` as read-only independently of capabilities.
- The plan-a-set hint stays visible on phones because that step has no link.
- Dismissing moves focus to the Session content instead of the document body.
- The coverage percentage uses integer maths (29 of 100 now reads 29%, not
  28%).
- Declined: hiding the checklist after a failed records or saved-set read.
  The page already shows its own empty state and an error toast on those
  failures, so the checklist agrees with what the page shows. Telling
  "loaded" from "failed" for saved sets needs a return-value change in
  `sessionSavedSets.ts`, which belongs in a separate change.

## STOP conditions

Stop and hand off if a step can only be derived with a new query or table, if
the checklist pushes the initial bundle over budget even when lazy-loaded, or
if any change is needed in the files owned by the sibling sessions.
