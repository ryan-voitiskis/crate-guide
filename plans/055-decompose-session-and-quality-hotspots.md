# Plan 055: Decompose session and quality hotspots

> **Executor instructions**: Execute after Plans 045 and 048 so corrected key
> utilities and saved-set ownership are stable. This is a behavior-preserving
> maintainability pass: prove consumers, split by cohesive responsibility, and
> avoid mechanical line-count targets. Commit conventionally.

## Status

- **Priority**: P3
- **Effort**: XL
- **Risk**: MED
- **Depends on**: Plans 045 and 048
- **Category**: maintainability / naming / test organization
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: TODO

## Why this matters

Several files contain multiple independently testable domains:

- `sessionStore.ts` (890 lines) combines deck playback/suggestions with a
  serialized saved-set persistence state machine.
- `trackEnrichment.ts` (931 lines) combines normalization, edit distance,
  artist/title comparison, candidate scoring, and review output.
- store test files range from 1,400 to 2,826 lines behind one large mock setup.
- the only E2E file is named `login-redirect` but also covers demo layout,
  pagination, settings, legal layout, and logout.

There are also source-confirmed unused APIs (`createRecord`, direct
`deleteRecord` after Plan 047, `searchTracks`, and some key option helpers) plus
structural comments that narrate obvious branches or markup.

## Scope

Modify/create within:

- `app/stores/sessionStore.ts` and session-focused modules/tests
- `app/utils/trackEnrichment.ts` and enrichment-focused modules/tests
- oversized store test suites under `app/stores/__tests__`
- `test/e2e/login-redirect.e2e.test.ts` and shared E2E fixtures from Plan 052
- source files containing proven dead public APIs or narration-only comments

Do not change Pinia store IDs/public behavior, saved-set ordering, deck
suggestion/scoring results, matching thresholds, E2E coverage, or database
contracts. Do not split historical migrations or scenario-coherent pgTAP files
merely to reduce line counts.

## Drift check

```bash
git status --short
wc -l app/stores/sessionStore.ts app/utils/trackEnrichment.ts app/stores/__tests__/*Store.test.ts test/e2e/*.test.ts
rg -n "createRecord\(|deleteRecord\(|searchTracks\(|getKeyOptionsAlt|combinedOptionsMapFnAlt" app test
rg -n '^\s*//|<!--' app/stores/sessionStore.ts app/components/records app/components/shared
```

STOP if a supposedly dead API has a runtime/auto-import consumer, if a split
would create circular store ownership, or if behavior characterization is
insufficient to prove score/session equivalence.

## Required implementation

1. Separate session domains.
   - Keep one public workbench session facade if consumers require it, but move
     deck/playback/suggestion behavior and saved-set persistence behind distinct
     typed modules with one owner for each mutable state machine.
   - Preserve serialized writes, account contexts, provenance, timers, fader
     cancellation, and the exact public API.

2. Separate enrichment pure functions.
   - Split normalization/tokenization, string similarity, artist comparison,
     candidate scoring, and final review projection into named modules.
   - Keep the index and public enrichment entry point stable. Add direct tests
     at the new boundaries instead of duplicating integration fixtures.

3. Split aggregate store tests by behavior.
   - Prioritize records, tracks, crates, session, user, and Discogs suites.
   - Use typed shared fixture/builders, but keep mocks local when sharing would
     conceal operation-specific behavior.
   - Name files for fetch/account lifecycle, CRUD, concurrency/reconciliation,
     and domain-specific workflows so focused filtering is truthful.

4. Split and rename E2E coverage.
   - Create authentication navigation, library bootstrap/pagination, and layout
     transition suites using the Plan 052 error-aware fixture.
   - Preserve all eight existing flows and avoid repeated 200-line mock setup.

5. Remove proven dead APIs and narration-only comments.
   - Confirm absence with source and auto-import-aware searches before removal.
   - Retain comments for concurrency, auth, storage, performance, external
     algorithm provenance, and counterintuitive product behavior.

## Test plan

```bash
npm run format
npm run test:run
npm run test:e2e
npm run test:browser
npm run check:conventions
npm run verify
git diff --check
```

Before/after characterization must assert identical saved-set/deck behavior,
enrichment candidate scores/order/reasons, and E2E flow count/outcomes.

## Done criteria

- [ ] Session playback and saved-set persistence have distinct cohesive owners.
- [ ] Enrichment normalization/comparison/scoring boundaries are independently testable.
- [ ] Oversized store and E2E suites are split by public behavior without coverage loss.
- [ ] Every removed API is proven unused and no auto-import contract breaks.
- [ ] Remaining comments explain non-obvious rationale or invariants.
- [ ] Application, E2E, browser, convention, and full gates pass.

## STOP conditions

Stop if a refactor changes a score/order/session result, creates circular Pinia
ownership, removes an auto-registered consumer, weakens concurrency tests, or
turns cohesive scenario tests into fragmented setup-heavy files.

## Git workflow

- Branch: `codex/055-decompose-session-and-quality-hotspots`
- Commit: `refactor: decompose frontend quality hotspots`
