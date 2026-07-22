# Plan 065: Move Rekordbox parsing off the main thread

> **Executor instructions**: Profile representative exports, then replace the
> synchronous DOM parse with a cancellable Worker/SAX pipeline. Preserve exact
> source normalization and warnings. Do not merely move full-DOM allocation into
> a Worker and call it streaming.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/composables/useTrackEnrichmentWorkflow.ts app/utils/rekordboxXml.ts app/pages/enrichment.vue app/utils/rekordboxXml.test.ts test/nuxt/enrichment-page.nuxt.test.ts package.json`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 045, 052, and 053
- **Category**: performance / UX / worker
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

The UI reads the complete XML string, synchronously builds a DOM, materializes
all TRACK elements, and maps the collection twice before progress can advance.
Large Rekordbox exports freeze the main thread and cannot be cancelled during
the expensive phase.

## Current state

```ts
// useTrackEnrichmentWorkflow.ts:325-336
const fileContents = await file.text()
const result = parseRekordboxXml(fileContents)
```

`rekordboxXml.ts:310-354` uses `DOMParser`, `Array.from(...TRACK)`, then a second
map to add location hints. The file input has no byte/entry bound. Matching
yields later, but parsing does not.

## Commands you will need

| Purpose        | Command                                                                | Expected on success      |
| -------------- | ---------------------------------------------------------------------- | ------------------------ |
| Parser tests   | `npx vitest run --project unit app/utils/rekordboxXml.test.ts`         | all pass                 |
| Nuxt tests     | `npx vitest run --project nuxt test/nuxt/enrichment-page.nuxt.test.ts` | all pass                 |
| Browser worker | `npm run test:browser`                                                 | all pass and budgets met |
| Bundle budget  | `npm run build && npm run check:client-bundle-budget`                  | Plan 053 budget passes   |
| Full gate      | `npm run verify`                                                       | exit 0                   |

## Scope

**In scope**: parser modules/tests, a dedicated Rekordbox Worker/protocol,
workflow/page progress/cancellation UI, deterministic large XML fixtures, and
one exact-pinned SAX dependency plus notices if justified.

**Out of scope**: changing matching scores, persisting drafts (Plan 074),
uploading XML, retaining absolute paths, or accepting arbitrary XML entities.

## Git workflow

- Branch: `codex/065-move-rekordbox-parse-off-main-thread`
- Commit: `perf(enrichment): stream Rekordbox parsing in a worker`

## Steps

1. Add 1k/10k/100k-track generated exports and record main-thread long tasks,
   first-progress latency, total parse time, peak allocation where observable,
   cancellation latency, and output checksum. Establish checked-in budgets.
2. Define a Worker protocol with operation ID, byte progress, parsed count,
   bounded warning batches, completion/error, and cancel. Transfer/stream file
   chunks; never post raw absolute `location` values back to the UI.
3. Exact-pin a maintained, browser-compatible SAX parser after licence/bundle
   review. Reject DTD/DOCTYPE/external entities. Incrementally parse only the
   required COLLECTION/TRACK attributes, enforce configured file/track/attribute
   limits, and compute sanitized relative location hints without retaining a
   second full path copy. If common-directory calculation needs two passes, keep
   only bounded sanitized segments and document the memory model.
4. Preserve `parseRekordboxXml` as a pure compatibility oracle during migration.
   Run every golden/malformed fixture through both and compare tracks, warnings,
   entries declared, normalization, and error categories before removing the
   DOM production path.
   Emit an explicit sanitized-source snapshot version separately from the
   parser implementation/policy version. Maintain pure snapshot migrators; a
   later draft cannot reparse without the raw XML.
5. Wire progress, cancel, retry, page deactivation, and stale operation IDs into
   the workflow. Explain size/entry refusal and never claim a cancelled parse
   completed.

**Verify after each step**: focused parser/Nuxt tests; finally browser, bundle,
convention, and full gates.

## Test plan

Cover UTF-8 chunk boundaries, entities, malformed XML, parsererror equivalents,
missing COLLECTION, declared-count mismatch, Windows/Unix/file URI paths,
DOCTYPE rejection, oversized attributes/file/count, cancel at each phase,
stale Worker completion, and 100k-track budget behavior.

## Done criteria

- [x] Production parsing performs no synchronous full-file DOM construction on the main thread.
- [x] Progress begins during file parsing and cancellation settles within the budget.
- [x] Golden output matches current parser semantics exactly or has reviewed fixture updates.
- [x] Input/resource bounds, XML security, browser, bundle, and full gates pass.

## STOP conditions

Stop if the chosen parser permits external entities, if output parity cannot be
explained, if the Worker still retains full raw XML plus full DOM, or if the
bundle exceeds Plan 053's budget.

## Maintenance notes

Keep parser, sanitized-source snapshot, and matcher-policy versions distinct for
Plan 074. A compatible snapshot may be migrated then rematched; an incompatible
snapshot must require re-import because the raw XML is intentionally absent.
