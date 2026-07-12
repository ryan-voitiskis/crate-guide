# Plan 013: Extract the track-enrichment workflow from the route

> **Executor instructions**: Move workflow state and orchestration without
> changing matching, review-before-write, or blank-field-only semantics. Run
> every gate and stop if extraction becomes a second store or an algorithm
> rewrite. Update the tracker when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   app/pages/enrichment.vue \
>   app/composables/useTrackEnrichmentWorkflow.ts \
>   app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts \
>   test/nuxt/enrichment-page.nuxt.test.ts
> ```
>
> Run `git status --short`. Plans 006, 008, 009, and 012 must be DONE so the
> rendered harness, load contracts, decoded store rows, and UI wrappers are
> stable first.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 006, Plan 008, Plan 009, and Plan 012
- **Category**: tech-debt
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The 912-line enrichment route owns source selection, parsing, matching,
staging, filtering, pagination, batch persistence, result reconciliation,
summaries, toasts, dialogs, and layout. Rekordbox and local-audio entry paths
repeat state resets, while source switching and “start another” reset overlapping
but not identical subsets. This plan creates one tested workflow composable so
new sources/states have one lifecycle contract and the page returns to view/DOM
adaptation.

## Current state

- `app/pages/enrichment.vue:25-68` declares workflow/filter/apply types and
  roughly 18 refs spanning all phases.
- `parseFile` at lines 246-292 and `reviewLocalSources` at lines 294-330 repeat
  reset, match, default-stage, and review-transition logic.
- Source/reset operations at lines 332-353 manually clear overlapping fields.
- Staging/filter/pagination behavior occupies lines 70-239 and 355-382.
- `applyStagedRows` at lines 384-466 prepares updates, invokes one batch,
  reconciles per-row results, calculates summary counts, and emits one toast.
- Pure matching and payload semantics already live in
  `app/utils/trackEnrichment.ts` with substantial tests; do not move or alter
  them.
- XML parsing already lives in `app/utils/rekordboxXml.ts`; local Worker/cache
  behavior lives in `useLocalAudioAnalysis` and remains separate.
- Product constraints from `docs/track-enrichment.md`: review before write,
  fill blank BPM/key fields only, preserve source provenance, and never upload
  local audio.

The composable may coordinate existing stores/utilities, but it must not become
globally persistent Pinia state. A fresh route visit gets fresh workflow state.

## Commands you will need

| Purpose                   | Command                                                                                          | Expected on success |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| Composable tests          | `npx vitest run --project stores app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts`   | exit 0              |
| Rendered wiring           | `npm run test:nuxt -- enrichment-page`                                                           | exit 0              |
| Existing enrichment tests | `npx vitest run --project unit app/utils/trackEnrichment.test.ts app/utils/rekordboxXml.test.ts` | exit 0              |
| Full verification         | `npm run verify`                                                                                 | exit 0              |
| Build                     | `npm run build`                                                                                  | exit 0              |
| Format                    | `npm run format`                                                                                 | exit 0              |

## Scope

**In scope**:

- `app/composables/useTrackEnrichmentWorkflow.ts` (create)
- `app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts` (create)
- `app/pages/enrichment.vue`
- `test/nuxt/enrichment-page.nuxt.test.ts` (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- `app/utils/trackEnrichment.ts` matching/scoring/update semantics.
- `app/utils/rekordboxXml.ts` parsing semantics.
- `app/composables/useLocalAudioAnalysis.ts`, Worker, cache, queue, analyzer
  configuration, or local-file permission behavior.
- Enrichment child-component templates, existing workflow copy, overall page
  layout, or a new source type. The one exact collection-load failure notice
  defined below is in scope.
- Database schema/migrations or overwrite policy.
- Pinia persistence/global workflow state or a generic state-machine library.

## Git workflow

- Branch: `codex/013-extract-enrichment-workflow`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `refactor(enrichment): extract workflow state`.
- Do not push or open a PR unless instructed.

## Target boundary

Move into `useTrackEnrichmentWorkflow`:

- `ReviewFilter`, `ApplySummary`, source/view types;
- all row/staging/filter/pagination/parse/apply state;
- computed counts, progress, selection, filters, pages, and current step;
- source/step navigation and all reset operations;
- Rekordbox file parse and local-source review matching;
- staging row/bulk controls;
- batch update preparation, progress, result mapping, summaries, and toasts.

Keep in the page:

- file-input DOM ref and click/input/drop event adaptation;
- static workflow-step labels;
- initial store fetch and user key-format access;
- template/layout and props/events connecting existing child components.

The public entry point is exactly
`useTrackEnrichmentWorkflow(): TrackEnrichmentWorkflow`; it takes no arguments,
obtains `useRecordsStore()` and `useTracksStore()` internally, and is fresh for
each component invocation. Tests mock Pinia and `vue-sonner` using existing
repository patterns; do not add a dependency-injection framework.

`TrackEnrichmentWorkflow` returns only the following page-facing surface:

- writable refs: `activeSource`, `selectedFileName`, `rows`, `stagedRowIds`,
  `selectedFilter`, `currentPage`, `parseWarnings`, `parseErrors`, `isParsing`,
  `parseCompleted`, `parseTotal`, `isApplying`, `showApplyDialog`,
  `applyCompleted`, `applyTotal`, `lastApplySummary`, and `workflowView`;
- readonly computed refs: `currentStep`, `matchedRows`, `readyRows`,
  `reviewRows`, `unmatchedRows`, `doneRows`, `stagedRows`, `blockedCount`,
  `rowErrorCount`, `errorCount`, `matchRate`, `applyProgress`, `parseProgress`,
  `visibleParseWarnings`, `sourceLabel`, `filterOptions`, `filteredRows`,
  `stageableFilteredRows`, `stagedFilteredCount`, `filteredSelectionState`,
  `pageCount`, `pagedRows`, `shownStart`, `shownEnd`, `stagedBpmCount`, and
  `stagedKeyModeCount`;
- actions: `isStepComplete`, `canNavigateToStep`, `navigateToStep`, `parseFile`,
  `reviewLocalSources`, `selectSource`, `returnToSource`,
  `startAnotherSource`, `setRowStaged`, `setFilteredRowsStaged`,
  `clearStagedRows`, `openApplyReview`, `applyStagedRows`, and `returnToReview`.

Keep the file-input ref, `openFilePicker`, input/drop event adapters,
`workflowSteps`, initial collection loading, and user key-format access in the
page. Do not return store instances or expose internal initializer/reset
helpers.

## Steps

### Step 1: Characterize current workflow behavior

Before extraction, add composable-target tests defining:

- XML parse warnings and errors;
- eligible default staging only;
- local-source review reaches the same normalized review state;
- source switching/start-another clears rows, stages, file label, summary,
  errors, filter, and pagination consistently;
- return-to-source/review preserves or resets only the intended state;
- filter changes reset page one and page count clamps the current page;
- single/bulk staging rejects blocked/ineligible rows;
- empty staged/prepared sets warn and do not write;
- one `updateTracksBatch` call per apply, deterministic result-to-row mapping,
  mixed success/failure, progress, BPM/key counts, and one summary toast;
- apply flags/dialog clean up in `finally`, including thrown failures.

Use synthetic records/tracks/sources and mocked stores; no files/network/DB.

### Step 2: Extract one canonical review initializer

Create an internal function that receives source label plus built rows and owns:

- assigning rows;
- computing default staged IDs;
- resetting filter/page/apply summary/errors where appropriate;
- moving to review.

Both Rekordbox and local-audio entry paths must call it. Create one canonical
“start over” reset used by source switch and another-source action, with any
intentional difference made explicit in the function parameters—not duplicated
assignments.

**Verify**: reset/initialization tests pass.

### Step 3: Move derived review and staging state

Move counts, filter options, filtered/paged rows, selection state, pagination
watchers, and stage actions. Preserve row order, `rowsPerPage = 100`, filter
names, default filters, and all eligibility logic through
`canStageTrackEnrichmentRow`.

**Verify**: filter/pagination/staging tests pass; existing pure enrichment tests
remain unchanged and green.

### Step 4: Move parse/match/apply orchestration

Move asynchronous XML/local matching and batch application. Preserve:

- requestAnimationFrame yielding before expensive XML parse;
- progress callback semantics;
- source filename/provenance passed to update construction;
- exactly one batch store call and one summary toast;
- result index mapping to prepared row order;
- per-row applied/error/result track state;
- dialog/flag cleanup even on failure.

Do not move pure parser/matcher/update builders into the composable.

**Verify**: the complete composable suite passes.

### Step 5: Reduce the page to DOM/view adaptation

Replace local workflow script state with the composable return. Keep the
template's names stable where practical to minimize churn.

Add page-local
`collectionLoadState: Ref<'loading' | 'ready' | 'failed'>`, initialized to
`'loading'`. On mount, run both Plan 008 fetch actions concurrently and set it
to `'ready'` only when both resolve `true`; set it to `'failed'` when either
resolves `false`. Do not retry automatically or duplicate the store toasts.

Preserve the existing page shell/header/step layout. Disable every step button
unless the load state is ready. While loading, render the existing
`StateLoading`. When ready, render the existing source/review/apply content.
When failed, render one `NoticeError` in that content position with the exact
text `Collection data could not be loaded. Refresh to try again.` and do not
mount the source, review, or apply panels.

Add a rendered wiring test proving source selection, XML file event adaptation,
review table events, apply dialog, and summary controls call the composable
contract. It must also prove `[true, true]` reaches ready, while `[false, true]`
and `[true, false]` render the exact failure notice and no source controls. Do
not duplicate all composable scenarios in rendered tests.

**Verify**: `npm run test:nuxt -- enrichment-page` → pass with no console
warnings.

### Step 6: Run browser and full regression gates

Using synthetic/local non-sensitive input, browser-check:

- choose each source;
- move to review;
- stage/unstage;
- open/cancel apply review;
- apply a safe local test row only when an authenticated disposable local DB is
  already available;
- return/start another resets the expected state;
- narrow and wide layouts remain unchanged.

If authenticated local data is unavailable, report the write portion as
pending; do not create credentials or modify production data. If the route is
unavailable before authentication, report the interactive source, review,
stage, apply, and reset checks as pending rather than fabricating state; retain
the controlled composable and rendered wiring evidence for those contracts.

Run `npm run format`, focused tests, `npm run verify`, and `npm run build`.

**Verify**: all automated gates exit 0 and only scoped files changed.

## Test plan

- The composable suite owns state-transition and batch behavior exhaustively.
- The Nuxt test owns page-to-composable wiring and rendered controls only.
- The Nuxt test owns the page-local collection loading/ready/failed contract and
  exact failure notice.
- Existing pure matching/parser tests must remain unchanged.
- Assert one batch call and one toast explicitly; avoid timing sleeps by using
  controlled promises/progress callbacks.

## Completion and reconciliation

- Implemented by amended executor commit
  `fe931d4cf90f0106532932761539385bbb72943c` and integrated as
  `84d0495d32824949d282259b1e5e42c51e64e882` with the exact four-file scope:
  the new workflow composable and its tests, the reduced route, and the new
  rendered page test.
- `useTrackEnrichmentWorkflow(): TrackEnrichmentWorkflow` is the exact public
  entry point. It takes no arguments, obtains the record and track stores
  internally, returns the exact writable/computed/action surface listed in the
  target boundary, and exposes neither stores nor private lifecycle helpers.
  `app/pages/enrichment.vue` fell from 912 to 558 lines while retaining only
  DOM event adaptation, collection/user context, and view wiring.
- Both XML and local-audio review paths enter the canonical private
  `initializeReview` helper. Source switching and start-another use the
  canonical private `resetWorkflow` helper. A private operation generation,
  advanced and checked through begin/current-operation helpers, makes each
  asynchronous review lifecycle authoritative only while it remains current.
- Independent cold review caught a stale-operation race in which superseded XML
  or local review work could still publish progress, results, errors, or
  `finally` cleanup over a newer operation. The amended executor commit guards
  every such mutation; controlled tests prove stale XML progress/results and
  stale local errors/cleanup cannot override the newer review.
- Collection fetches now run concurrently. The page becomes ready only for the
  truthful `[true, true]` result; either exact-false result renders no workflow
  controls. The failure notice is exactly:
  `Collection data could not be loaded. Refresh to try again.` No duplicate
  toast is added.
- Focused verification passed 13 composable tests, 3 rendered wiring/load
  tests, and 37 unchanged pure parser/enrichment tests. The main integration
  worktree reran the focused gates, and an independent cold review approved the
  amended result.
- Full verification passed 41 files / 1028 application tests, 2 E2E tests, 4
  Edge tests, 6 type-generation tests, and 7 audio-configuration tests. The
  production build was green.
- Browser QA used the committed local server with deliberately invalid dummy
  Supabase configuration. `/enrichment` redirected unauthenticated visits to
  `/login` at 1280×900 and at the narrow viewport, with no console warnings or
  errors. Interactive source/review/stage/apply/reset behavior and an
  authenticated write remain explicitly pending under Step 6's allowance
  rather than fabricated; controlled composable and rendered tests cover those
  contracts.
- No Worker, parser, matcher, schema, overall layout, or workflow-copy change
  exists beyond the exact collection-load failure notice.

## Done criteria

- [x] One composable owns all workflow state, transitions, staging, filtering,
      pagination, parsing/matching orchestration, and apply reconciliation.
- [x] Rekordbox/local entry paths share one review initializer and consistent
      reset contract.
- [x] Page script contains only DOM adaptation, initial load/user context, and
      view wiring.
- [x] The workflow renders only after both collection fetches return true; a
      failed fetch shows the exact non-interactive failure state.
- [x] Matching, blank-only writes, provenance, order, existing workflow copy,
      and layout are unchanged; the exact collection-load failure notice is the
      only copy addition.
- [x] Composable/rendered/existing/full tests and build pass.
- [x] Available wide/narrow browser verification has no regressions or console
      errors; interactive and authenticated states are explicitly pending and
      covered by controlled/rendered tests under Step 6's allowance.
- [x] No Worker/cache/algorithm/schema/out-of-scope change exists.

## STOP conditions

Stop and report if:

- Extraction requires changing matching/scoring/update semantics.
- Worker, cache, local-audio queue, or parser internals must move.
- Batch result order cannot be mapped deterministically to prepared rows.
- The composable needs global persistence, a broad dependency-injection
  framework, or becomes a second store.
- Visible copy/layout beyond the exact collection-load failure state, or
  overwrite safety, must change.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- A future source should implement source-to-row creation, then enter the same
  review initializer; it must not clone route state.
- Keep pure matching/update policy in `trackEnrichment.ts` and transient
  orchestration in the composable.
