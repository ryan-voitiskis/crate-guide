# Plan 063 rendering acceptance request

- **Status:** pending maintainer decision
- **Prepared:** 2026-07-23
- **Decision owner:** repository maintainer
- **Implementation:** complete and locally verified

This record isolates the remaining acceptance STOP from the completed technical
work. It does not treat general authorization to implement the portfolio as
acceptance of numbers the maintainer did not select.

## Recommended decision

Accept the checked-in values as **engineering regression defaults**, not as
universal end-user latency guarantees:

- automated engine: repository Playwright Chromium;
- viewports: `1440 x 900` and `390 x 844`;
- corpora: 1,000 records, 10,000 tracks, 1,000 crate candidates, and 10,000
  Discogs candidates;
- maximum mounted rows/cards, covers, signed-cover requests at rest, and new
  signed-cover requests per scroll: `48`;
- maximum responsive presentation trees: `1`;
- timing references remain diagnostic until a named hardware/throttle profile
  is separately accepted.

The complete protocol, pre-change failure, and post-virtualization results are
recorded in [`workbench-rendering-performance.md`](../workbench-rendering-performance.md).
The post-change run remained below every structural limit while preserving
full-list filtering, sorting, selection, responsive behavior, keyboard focus,
and accessibility counts.

## Decision choices

Record exactly one:

- **Accept recommended defaults:** close the acceptance STOP and mark Plan 063
  `DONE`. Future changes may recalibrate the versioned contract through review.
- **Revise:** provide the replacement engine, viewports, corpora, structural
  limits, and any calibrated hardware/throttle timing gates. Rerun the full
  protocol before closing the STOP.
- **Reject:** state which supported behavior or evidence is insufficient; keep
  Plan 063 `BLOCKED`.

## Acceptance record

| Field                           | Recorded value |
| ------------------------------- | -------------- |
| Decision                        | Pending        |
| Decision owner                  | Pending        |
| Effective date                  | Pending        |
| Accepted engine/browser version | Pending        |
| Accepted viewports              | Pending        |
| Accepted corpora                | Pending        |
| Accepted structural limits      | Pending        |
| Timing interpretation           | Pending        |
| Required follow-up              | Pending        |

An accepted decision must update the status here and in
`workbench-rendering-performance.md`, then update Plan 063 and the portfolio
ledger in the same reviewed change. Until then, passing regression tests does
not close the explicit acceptance STOP.
