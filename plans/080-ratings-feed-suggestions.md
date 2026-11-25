# Plan 080: Let transition ratings feed suggestions

> **Executor instructions**: This plan adds the read side for transition
> ratings that the session history already stores. It must not change how
> ratings are written, the saved-set schema, the repositories, the database
> or the Edge Functions. Session history mutation belongs to a separate plan
> (planner reorder and export); treat `sessionPlayback.ts` history code,
> `PanelSessionHistory.vue` and `CardSessionHistoryTrack.vue` as read-only.
>
> **Drift check (run first)**:
> `git diff --stat f90fa44..HEAD -- app/utils/trackSuggestions.ts app/stores/sessionPlayback.ts app/stores/sessionSavedSets.ts app/stores/sessionStore.ts app/components/session/CardTrackSuggestion.vue app/components/session/ListTrackSuggestions.vue app/components/session/DeckColumn.vue app/components/library/InspectorTrack.vue shared/types/session.ts shared/types/library.ts test/browser/sessionSuggestionsPerformance.browser.test.ts`
> If any of these changed, re-read them before editing and reconcile this plan.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: product / session suggestions
- **Planned at**: commit `f90fa44`, 2026-11-25
- **Status**: DONE (pending maintainer confirmation)
- **Product context**: Phase 2c ("Close the feedback loop") of
  [docs/product-direction-2026-11.md](../docs/product-direction-2026-11.md).
  Built unattended overnight in parallel with Phase 2b (planner reorder and
  export) and part of Phase 0; it shares no edited files with either except
  this index table.

## Why this matters

Every saved set already records a 1–5★ rating for each transition, but
nothing reads it back. A DJ who rated "A into B" five stars three times gets
the same suggestion list as one who never played the pair. Feeding that
history into the suggestion order, and showing it on the card and in the
inspector, turns ratings from a chore into a tool and costs no new data.

## Current state

- `LibraryPlayedTrackEntry.transition_rating` (`shared/types/library.ts`) is
  `1..5 | null`. `CardSessionHistoryTrack.vue` shows the rating control on
  every entry except the first, so entry `i`'s rating describes the
  transition from entry `i - 1` into entry `i`.
- `sessionSavedSets.ts` holds `savedSets`. The live session is auto-saved to
  the active set two seconds after any change (`scheduleAutoSave`), and every
  mutation replaces the `savedSets` array (`publishSavedSet`, `deleteSet`,
  `clearSavedSetTracks`, fetch reconciliation); no path mutates it in place.
- Saved sets are fetched by `app/pages/index.vue` (session page) and by
  `DialogSetManager.vue`. The Tracks page never fetches them.
- `getTrackSuggestions` (`app/utils/trackSuggestions.ts`) filters by BPM
  reach, played tracks, same record and source track, scores harmony 70 % and
  tempo 30 %, and sorts by score with `null` last. It is called on every
  fader input via `sessionPlayback.getSuggestionsForDeck` from
  `DeckColumn.vue`.
- `test/browser/sessionSuggestionsPerformance.browser.test.ts` holds the
  10k-track p95 recompute budget at 16.7 ms with 4× CPU throttling.

## Product decisions (made unattended; confirm or revise)

1. **Source of history**: saved sets only. The live session reaches history
   through auto-save within about two seconds, which avoids double counting
   the active set. Workspaces that cannot persist sessions (Demo) have no
   history and behave exactly as before.
2. **Pair definition**: consecutive entries `(prev, next)` in a saved set,
   in stored order. A pair counts as a play whether or not it was rated; the
   rating attached to `next` is the rating of that pair. Self-pairs and empty
   track ids are ignored.
3. **Bonus shape**: `bonus = HISTORY_BONUS_MAX × weight × confidence` with
   - `HISTORY_BONUS_MAX = 0.08` (on the 0–1 compatibility scale),
   - `weight = (averageRating − 3) / 2` for rated pairs (−1 at 1★, 0 at 3★,
     +1 at 5★) and `UNRATED_PLAY_WEIGHT = 0.25` for pairs only ever played
     unrated (choosing a pair is a weak positive signal),
   - `confidence = min(plays, 3) / 3`.
     So a pair is penalised when it was rated badly; the bonus is in
     `[−0.08, +0.08]`.
4. **Never dominate compatibility**: the bonus does not change `score`; the
   card's badge and accessible label still report pure tempo and harmony
   compatibility. Sorting uses `score + historyBonus`. Two candidates can only
   swap when their compatibility differs by at most `2 × 0.08 = 0.16`, and a
   candidate without a compatibility score always sorts below every scored
   candidate. History never adds candidates: the BPM-reach, played, same-record
   and source filters are unchanged, and the result limit applies after the
   history-aware sort.
5. **Card**: when the pair (deck track → candidate) has history, the
   metadata row shows `↺ 3× · 4.5★` (or `↺ 2×` when unrated), with the full
   sentence "Played after this 3×, avg 4.5★" as its title and appended to the
   card's accessible label. The fixed 64 px card height is unchanged.
6. **Inspector**: a "Transition history" section, shown only when the track
   has history, lists up to three transitions into and three out of the track,
   best first (rated before unrated, then average rating, rated count and
   plays). Tracks no longer in the library are skipped. The Tracks page does
   not fetch saved sets, so the section asks the session store to fetch them
   once when the workspace can persist sessions and none are loaded.

## Commands you will need

| Purpose     | Command                                                                                                                                                        | Expected on success |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Unit        | `npx vitest run --project unit app/utils/transitionHistory.test.ts app/utils/trackSuggestions.test.ts`                                                         | all pass            |
| Stores      | `npx vitest run --project stores app/stores/__tests__/sessionStore.suggestions.test.ts`                                                                        | all pass            |
| Component   | `npx vitest run --project nuxt test/nuxt/session-suggestions.nuxt.test.ts test/nuxt/PanelTrackTransitions.nuxt.test.ts test/nuxt/track-quick-set.nuxt.test.ts` | all pass            |
| Benchmark   | `npx vitest run --project browser test/browser/sessionSuggestionsPerformance.browser.test.ts`                                                                  | within budget       |
| Conventions | `npm run check:conventions && npm run check:tailwind-canonical`                                                                                                | exit 0              |
| Full gate   | `npm run verify && npm run audit:prod`                                                                                                                         | exit 0              |

## Scope

**In scope**: a pure transition-history index and bonus
(`app/utils/transitionHistory.ts`), a shared composable
(`app/composables/useTransitionHistory.ts`), history-aware ranking in
`getTrackSuggestions`, an optional history argument on
`getSuggestionsForDeck`, the card display, a lazily loaded inspector panel
(`PanelTrackTransitions.vue`), tests and this plan.

**Out of scope**: rating writes, history mutation, saved-set schema or
repository changes, server-side aggregation, a user setting to disable the
bonus, and showing history for tracks no longer in the library.

## Steps

### Step 1: Index and bonus

`buildTransitionHistoryIndex(savedSets)` walks every set once and returns
`outgoing: Map<from, Map<to, TransitionPairStats>>` and the mirrored
`incoming` map. `TransitionPairStats` holds `plays`, `ratedCount`,
`ratingSum`, `averageRating` and `lastPlayedAt`. `getTransitionHistoryBonus`
implements decision 3; `rankTrackTransitions(index, trackId, direction,
limit)` implements the inspector order.

**Verify**: unit tests for pair extraction, unrated plays, self-pairs,
multi-set aggregation, the bonus bounds and the inspector order.

### Step 2: Ranking

`scoreTrack` takes an optional `TransitionPairStats` and returns
`transitionHistory` and `historyBonus`; `getTrackSuggestions` takes an
optional `transitionHistory` index, looks up the source track's outgoing map
once per call (one `Map.get` per candidate afterwards) and sorts by
`score + historyBonus`, keeping unscored candidates below scored ones.
`getSuggestionsForDeck(deckIndex, transitionHistory?)` passes it through.
`DeckColumn.vue` supplies the index from `useTransitionHistory()`, which
memoises the build by `savedSets` array identity so all decks and the
inspector share one build per saved-set change.

**Verify**: unit tests that a 5★ pair outranks an equal-compatibility
candidate, a 1★ pair sinks, a candidate more than 0.16 behind never
overtakes, unscored candidates stay last, and a boosted candidate just
outside the limit is promoted into it; a store test through
`getSuggestionsForDeck`; the browser benchmark stays within budget.

### Step 3: Card and inspector

Implement decisions 5 and 6. `InspectorTrack.vue` renders
`LazyPanelTrackTransitions` below the quick-set panel.

**Verify**: nuxt tests for the card line and label, and for the panel's
order, skipped deleted tracks, empty state and one-time fetch.

### Step 4: Gates and handoff

`npm run format`, `npm run check:conventions`, `npm run verify`,
`npm run audit:prod`; update the index row.

## Done criteria

- [x] Suggestions for a deck rank previously well-rated pairs higher and badly rated pairs lower, by at most 0.08 each way.
- [x] The compatibility badge and label are unchanged by history.
- [x] The card shows "played after this N×, avg R★" for pairs with history.
- [x] The inspector shows the best transitions into and out of a track.
- [x] The pair index is built once per saved-set change and shared.
- [x] Rating writes, history mutation, schema, repositories and Edge code are unchanged.
- [x] Conventions, `npm run verify` and `npm run audit:prod` pass.

## Verification evidence

- Regression tests: reverting the history-aware sort in
  `getTrackSuggestions` to the old score-only sort fails six ranking tests
  (five unit, one store); the card, panel and composable tests depend on the
  new code and fail without it.
- Browser benchmark (10k tracks, 4× CPU throttle) with a 400-set,
  12,000-entry history where the source track is followed by over 100
  distinct candidates: recompute p95 5.1 ms (4.5 ms on the baseline without
  history), frame interval p95 16.8 ms, no attributable long tasks; budget
  16.7 ms recompute p95.
- `npm run format`, `npm run check:conventions`, `npm run verify` and
  `npm run audit:prod` pass on the branch.

## STOP conditions

Stop and hand off if the bonus needs to exceed the documented bound to be
useful, if the browser suggestion benchmark cannot stay within budget, if
reading history requires changing how ratings are written or stored, or if
the saved-set array is found to be mutated in place (the memoised index
depends on replacement).

## Maintenance notes

The bound lives in `HISTORY_BONUS_MAX` and is asserted in
`app/utils/trackSuggestions.test.ts`. If a later plan adds a setting to turn
the bonus off, pass `null` for the index rather than special-casing the
scorer. If the planner work starts mutating saved sets in place, replace the
identity memo in `useTransitionHistory` with a version counter.
