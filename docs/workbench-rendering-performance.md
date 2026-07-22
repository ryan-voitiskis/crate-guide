# Workbench rendering performance

This contract keeps the record, track, crate-candidate, and Discogs-candidate
surfaces usable with realistically large local collections. The protocol and
numeric limits were written before the pre-virtualization baseline was run.

## Authorization and interpretation

The repository owner authorized implementation of the full improvement
portfolio. The structural limits below are source-controlled engineering
defaults chosen during implementation; they are not presented as numbers the
owner selected. They can be revised in review when a different supported
viewport or accessibility constraint is demonstrated.

Structural limits are mandatory for every named surface and both supported
viewports. Timing values are diagnostic reference points only: wall-clock and
frame timings vary with the host, power state, browser build, and CI
virtualization. A timing regression must be investigated, but it does not fail
the default gate unless a separately calibrated hardware profile is selected.

## Deterministic protocol

- Engine: the repository's Playwright `1.59.1` Chromium.
- Viewports: `1440 x 900` desktop and `390 x 844` mobile.
- Corpora: 1,000 records, 10,000 tracks, 1,000 crate candidates, and 10,000
  Discogs release candidates. IDs, titles, artists, labels, positions, tempo,
  key, genre, and selection state are generated from the item index.
- Warm-up: load each surface once before collecting an interaction sample.
- Initial render: replace an empty store with the complete deterministic corpus,
  then wait for two animation frames.
- Filter and sort: apply the fixed query `needle-7`, then toggle the primary
  title sort twice. Each sample waits for two animation frames.
- Scroll: set the owning viewport to 50% of its scroll range and wait for two
  animation frames. Record mounted items before and after the scroll.
- Breakpoint: switch desktop to mobile and back once, waiting for the responsive
  media query and two animation frames after each transition.
- Cover-grid reflow: capture the first visible record before the desktop/mobile
  column change and require that record to remain in the first visible row after
  both reflows, even when no record is selected.
- Lifecycle: count mounted row/card wrappers, mounted cover components, signed
  cover requests, and long tasks. After scrolling away, verify that offscreen
  covers are absent and cannot publish a late URL into a recycled item.
- Retention: after returning to the top and waiting two frames, the mounted DOM
  count must return to the same bounded range; a full-corpus hidden tree is a
  failure.

The browser test emits a JSON record containing the corpus, viewport, timings,
long-task count, mounted-item high-water mark, mounted-cover high-water mark,
and cover-request counts. Raw timing data remains visible even though the
default assertions enforce only deterministic behavior and structural limits.

## Mandatory structural limits

The source of truth is
`shared/config/workbenchRenderingBudget.json`:

| Check                                           | Limit |
| ----------------------------------------------- | ----: |
| Mounted virtual rows/cards per surface          |    48 |
| Mounted record covers per surface               |    48 |
| Responsive row trees mounted at once            |     1 |
| Signed cover requests at rest                   |    48 |
| New signed cover requests for one scroll sample |    48 |

Selection counts, select-all behavior, filters, sorts, inspectors, and import
actions continue to operate on the complete collection. The caps apply only to
rendered presentation work; they do not truncate the underlying result set.

## Informational timing references

The predeclared references are 250 ms initial render, 100 ms filter, 100 ms
sort, 50 ms scroll, and 150 ms breakpoint transition. They are printed beside
measurements but remain informational unless a future change adds a named,
reproducible CPU and browser calibration profile.

## Baseline and result log

The pre-change Chromium run on 2026-07-23 failed the predeclared structural
limits as expected:

```bash
npx vitest run --project e2e test/e2e/workbench-rendering.e2e.test.ts --reporter=verbose
```

| Surface         |    Initial |  Scroll | Breakpoint | Long tasks | Mounted items | Mounted covers | Row trees | Retained items/covers | Result |
| --------------- | ---------: | ------: | ---------: | ---------: | ------------: | -------------: | --------: | --------------------: | ------ |
| Records desktop |   218.4 ms | 10.6 ms |    76.1 ms |          1 |         2,000 |          1,000 |         2 |         2,000 / 1,000 | Fail   |
| Tracks desktop  | 1,707.3 ms | 53.9 ms |        n/a |          3 |        10,000 |         10,000 |         1 |       10,000 / 10,000 | Fail   |

The records count proves both CSS-hidden responsive trees were mounted. The
track count proves the single responsive tree still rendered the complete
10,000-item collection. Scrolling retained the same full-corpus DOM and cover
work on both surfaces. These results were captured before virtualization and do
not alter the mandatory cap.

The post-virtualization Chromium run on 2026-07-23 passed every mandatory
structural check:

| Surface            |  Initial |  Filter |    Sort |  Scroll | Breakpoint | Long tasks | Mounted items/covers | Retained items/covers |
| ------------------ | -------: | ------: | ------: | ------: | ---------: | ---------: | -------------------: | --------------------: |
| Records table      |  14.9 ms | 25.0 ms | 49.6 ms | 13.9 ms |    24.9 ms |          0 |              24 / 24 |               29 / 29 |
| Record covers      |  39.3 ms |     n/a |     n/a | 13.1 ms |       pass |          0 |              20 / 20 |               32 / 32 |
| Tracks table       | 113.0 ms | 48.1 ms | 65.7 ms | 11.2 ms |    23.5 ms |          2 |              26 / 26 |               31 / 31 |
| Crate candidates   |      n/a |    pass |     n/a |    pass |        n/a |        n/a |              11 / 11 |               16 / 16 |
| Discogs candidates |      n/a |     n/a |     n/a |    pass |        n/a |        n/a |               13 / 0 |                18 / 0 |

The crate dialog filtered all 1,000 candidates to the deterministic last
record. The Discogs manifest changed all 10,000 selected releases to zero from
one select-all action while keeping only 13-18 candidate rows mounted. The
desktop/mobile cover reflow retained the same first-visible record and the
mounted card root remained the actual keyboard focus target.

| Signed-cover request sample | At rest | One scroll |
| --------------------------- | ------: | ---------: |
| Records table               |      24 |         29 |
| Record covers               |       0 |         32 |
| Tracks table                |      19 |         27 |
| Crate candidates            |       5 |         15 |

The zero warm record-cover value reflects signed URLs already resolved by the
table view in the same deterministic run; scrolling to uncached records still
created 32 requests. The deferred signer also completed URLs for unmounted table
rows after scrolling, and no stale URL was published into the recycled row
identity. Timing numbers remain informational host samples; the bounded DOM,
single responsive tree, selection behavior, request caps, and stale-result
assertions are the mandatory result.
