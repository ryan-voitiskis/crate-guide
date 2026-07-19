# Plan 020: Index enrichment candidate matching

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Run the "Drift check" section first. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md` unless a reviewer
> told you they maintain the index.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/010-page-full-library-queries.md`
- **Category**: performance
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `efaf635` (integrated as `01e3395`), 2026-07-19

## Why this matters

The enrichment matcher prepares every candidate, then scores and sorts the full candidate set for every source row. The asynchronous entry point yields between source rows, but one row can still monopolize the main thread while it performs a full scan. Large libraries therefore grow toward `source rows × candidate tracks`, making review generation progressively slower and less responsive.

The optimization must preserve the existing conservative matching rules. In particular, fuzzy spelling, artist containment, duration/value corroboration, ambiguity handling, duplicate-source blocking, confidence, and reason ordering are product behavior—not implementation details that can be relaxed for speed.

## Current state

`app/utils/trackEnrichment.ts` currently prepares a flat candidate array and scans it for every source row:

```ts
const candidates = candidateMetadata
	.map((candidate) => scoreCandidate(source, sourceMetadata, candidate))
	.filter((candidate): candidate is ScoredCandidate => candidate !== null)
	.sort((a, b) => b.score - a.score)
```

`buildTrackEnrichmentRows` and `buildTrackEnrichmentRowsAsync` both reuse that flat array. The asynchronous version yields after batches of rows, but the work within each row remains unbounded by library size.

The current tests in `app/utils/trackEnrichment.test.ts` already characterize several sensitive cases, including fuzzy spelling with corroboration, extra artists, conflicting duration/value data, ambiguous candidates, and duplicate source rows. Those cases form the minimum semantic baseline for this change.

## Proposed design

Create a pure candidate-index module and use it to produce a conservative title shortlist before running the existing scorer:

- Keep `scoreCandidate` as the final authority for eligibility, score, confidence, reasons, and ambiguity.
- Build title buckets once from every normalized candidate-title variant.
- Bucket long titles by first character and normalized length. The current fuzzy predicate requires matching first characters for sufficiently long strings, so this can eliminate impossible candidates without changing results.
- For each source-title variant, union every length bucket that could still satisfy the existing fuzzy length threshold. For short titles, query all eligible length buckets without assuming a matching first character.
- Include exact-title buckets directly.
- Deduplicate candidates while preserving original input order so stable-sort tie behavior remains unchanged.
- Fall back to the complete candidate list when the source lacks a usable title or when the index cannot prove a candidate impossible.
- Continue to run the full existing scorer and stable score sort on the shortlist.
- Keep the async progress and yield contract. Do not move matching to a Web Worker in this plan; bounded per-row work plus the existing yields should be measured before adding worker complexity.

The shortlist rule must be a strict superset of every candidate whose title could pass the existing title matcher. It is acceptable to retain extra candidates; it is not acceptable to omit a candidate that the exhaustive implementation could select.

## Commands you will need

| Purpose            | Command                                                                                                  | Expected on success                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Matcher unit tests | `npx vitest run --project unit app/utils/trackEnrichmentIndex.test.ts app/utils/trackEnrichment.test.ts` | exit 0; characterization, completeness, and work-reduction cases pass |
| Workflow tests     | `npx vitest run --project stores app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts`           | exit 0; async parity, progress, and cancellation cases pass           |
| Formatting         | `npm run format`                                                                                         | exit 0; only in-scope files receive formatting changes                |
| Conventions        | `npm run check:conventions`                                                                              | exit 0                                                                |
| Full gate          | `npm run verify`                                                                                         | exit 0                                                                |

## Scope

Create:

- `app/utils/trackEnrichmentIndex.ts`
- `app/utils/trackEnrichmentIndex.test.ts`

Modify:

- `app/utils/trackEnrichment.ts`
- `app/utils/trackEnrichment.test.ts`
- `app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts` only if its progress/cancellation assertions need to cover the indexed path

Do not change:

- scoring weights or thresholds
- confidence classifications
- reason text or ordering
- source-row duplicate blocking
- the enrichment review UI
- the asynchronous cancellation-generation contract

## Drift check

Before editing:

```bash
git rev-parse --short HEAD
git status --short
rg -n "prepareCandidateMetadata|scoreCandidate|buildTrackEnrichmentRowsAsync|canBeFuzzyMatch" app/utils/trackEnrichment.ts
rg -n "fuzzy|ambiguous|extraartists|onProgress|duplicate" app/utils/trackEnrichment.test.ts app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts
```

Expected:

- The SHA is `99a570f`, or the executor records and reviews drift before continuing.
- Candidate preparation is shared, but each source row still maps, filters, and sorts the full candidate array.
- The existing characterization tests are present.

STOP if another change has already introduced a candidate index, altered the fuzzy predicate, or changed score/confidence semantics. Reconcile that design before applying this plan.

## Steps

1. Add characterization coverage before refactoring.
   - Preserve every existing expected row exactly.
   - Add fixtures around the fuzzy boundary: first-character mismatch, short-title behavior, accepted/rejected length differences, multiple normalized title variants, equal scores, and stable input-order ties.
   - Add a deterministic corpus test that records the exhaustive implementation's selected candidate, confidence, proposed fields, and reasons.

2. Extract the title-admissibility logic into `trackEnrichmentIndex.ts`.
   - Move or share the normalized-title length/first-character predicate rather than duplicating its constants.
   - Define a prepared-candidate identity that is stable across multiple title variants.
   - Build exact-title and `(first character, length)` buckets in one pass.
   - Expose a pure `getCandidateShortlist(index, sourceTitleVariants)` function suitable for direct unit testing.

3. Prove shortlist completeness independently of scoring.
   - In a seeded synthetic corpus, compare the shortlist with a test-only exhaustive filter using the same title-admissibility predicate.
   - Assert that every exhaustively admissible candidate is present in the shortlist.
   - Assert that shortlist order follows original candidate order and candidates with multiple matching title variants occur once.
   - Cover the no-title fallback explicitly.

4. Integrate the index into both row builders.
   - Build the index once beside prepared candidate metadata.
   - Retrieve a shortlist for each source row and pass only that list through `scoreCandidate` and the existing stable sort.
   - Keep the exhaustive fallback for cases the index cannot safely narrow.
   - Ensure synchronous and asynchronous builders share the same indexed row-building path.

5. Add a deterministic work-reduction test.
   - Generate at least 10,000 candidates with varied first characters and title lengths and at least 100 representative source rows.
   - Count shortlist candidates, not elapsed wall-clock time.
   - Require total candidate evaluations to be at most 15% of `sources × candidates` for that corpus.
   - Keep a separate adversarial same-prefix corpus to document the safe worst-case fallback without imposing an unrealistic ratio.

6. Reconfirm workflow behavior.
   - Assert sync/async output parity.
   - Assert progress reaches the same values in the same order expected by the UI.
   - Assert generation-based cancellation still prevents stale review rows from committing.

7. Document the complexity near the index construction and shortlist function.
   - State the completeness invariant.
   - State that worst-case behavior can still be exhaustive for correctness.
   - Avoid performance claims based only on wall-clock timing.

## Test plan

Run:

```bash
npx vitest run --project unit app/utils/trackEnrichmentIndex.test.ts app/utils/trackEnrichment.test.ts
npx vitest run --project stores app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts
npm run format
npm run check:conventions
npm run verify
```

Expected:

- Characterization and indexed results are identical.
- The seeded completeness test drops no admissible candidate.
- The representative corpus stays at or below 15% of exhaustive candidate evaluations.
- Sync/async parity, progress, and stale-generation behavior remain green.
- Formatting, conventions, and the full verification suite pass.

## Git workflow

Use branch:

```text
codex/020-index-enrichment-matching
```

Commit with:

```text
perf(enrichment): index candidate matching
```

Stage only the files listed in this plan. Do not push or open a pull request unless explicitly requested.

## Done criteria

- Candidate metadata and the title index are built once per import.
- The shortlist is proven to contain every title-admissible candidate.
- Existing scoring, confidence, reasons, ambiguity, and duplicate behavior are unchanged.
- Representative candidate evaluations are at most 15% of the exhaustive baseline.
- Async progress and cancellation behavior remain intact.
- All targeted and repository verification commands pass.

## STOP conditions

- Any existing characterization output changes.
- The shortlist cannot be proven complete against the title predicate.
- Realistic work reduction misses the stated threshold.
- Cancellation or progress semantics regress.
- The implementation requires changing matching thresholds to achieve the target.

If a STOP condition occurs, preserve the characterization additions, revert the optimization work, and report the failing corpus and measured evaluation counts before proposing a worker or different index.

## Maintenance notes

- When title-normalization or fuzzy-match rules change, update the index admissibility logic and its completeness test in the same commit.
- Keep performance assertions deterministic and comparison-count based; wall-clock benchmarks can supplement them but should not gate CI.
- Reassess a Web Worker only if profiling after this change still shows user-visible main-thread stalls.
