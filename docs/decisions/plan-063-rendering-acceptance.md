# Plan 063 rendering acceptance request

- **Status:** accepted
- **Prepared:** 2026-07-23
- **Decision owner:** repository maintainer
- **Accepted:** 2026-07-28
- **Implementation:** complete and locally verified

This record resolves the acceptance STOP after the completed technical work. It
records the maintainer's specific acceptance rather than treating general
authorization to implement the portfolio as acceptance of numbers the
maintainer did not select.

## Accepted decision

The maintainer accepted the checked-in values as **engineering regression
defaults**, not as
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

## Acceptance record

| Field                           | Recorded value                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Decision                        | Accept recommended defaults                                                                       |
| Decision owner                  | Repository maintainer                                                                             |
| Effective date                  | 2026-07-28                                                                                        |
| Accepted engine/browser version | Repository Playwright `1.59.1` Chromium                                                           |
| Accepted viewports              | `1440 x 900` desktop and `390 x 844` mobile                                                       |
| Accepted corpora                | 1,000 records; 10,000 tracks; 1,000 crate candidates; 10,000 Discogs candidates                   |
| Accepted structural limits      | 48 mounted rows/cards, covers, and signed-cover requests; one responsive presentation tree        |
| Timing interpretation           | Diagnostic until a named reproducible hardware/throttle profile is separately accepted            |
| Required follow-up              | Recalibrate only through reviewed evidence for a changed supported viewport or accessibility need |

This decision closes Plan 063's acceptance STOP. Future changes may revise the
versioned contract through review and must rerun the complete protocol.
