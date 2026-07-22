# Session suggestion performance

This benchmark characterizes the existing pitch-driven suggestion path before
any optional optimization. The protocol and pass/fail budget below were checked
in before observing baseline results.

## Authorization and interpretation

- **Implementation authority:** the repository maintainer authorized the planned
  Plan 055 characterization work.
- **Budget provenance:** Codex proposed the numeric values and checked them in
  before observing the baseline. They are engineering regression defaults, not
  values independently selected or accepted by the maintainer and not a product
  latency promise.
- **Supported engine:** Playwright 1.59.1 bundled Chromium.
- **Baseline hardware:** Apple M5, 10-core CPU, 24 GB memory. No device serial,
  hardware UUID, or other unique identifier is recorded.
- **CPU protocol:** Chrome DevTools Protocol CPU throttle rate `4` for every
  warm-up and measured gesture.
- **Corpus:** a deterministic 10,000-track library generated from a fixed
  algorithm. The source deck, loaded tracks, played IDs, and pitch sequence are
  fixed by the benchmark.
- **Warm-up:** 10 complete synthetic fader gestures. Warm-up samples are
  discarded.
- **Measurement:** 40 complete synthetic fader gestures.

## Budget

The existing path passes only when all three conditions hold across the 40
measured gestures:

- suggestion recomputation duration p95 is at most `16.7 ms`;
- gesture frame-interval p95 is at most `20 ms`; and
- there are zero long tasks over `50 ms` attributable to suggestion
  recomputation.

If the baseline passes, Plan 055 retains the simpler suggestion algorithm and
lands the characterization gate. If it fails, the implementation must coalesce
pointer-driven recomputation to animation frames and use a stable bounded top-50
selection (or an equivalently proven approach), then rerun this same protocol.
Any optimization must preserve exact scores, filters, limit, descending order,
and original candidate order for ties.

## Results

The pre-optimization baseline was measured on 2026-07-22 with:

```bash
npx vitest run --project browser test/browser/sessionSuggestionsPerformance.browser.test.ts --reporter=verbose
```

| Metric                            | Raw samples | p95 / count | Budget     | Result |
| --------------------------------- | ----------: | ----------: | ---------- | ------ |
| Suggestion recomputation duration |         680 |      5.4 ms | <= 16.7 ms | Pass   |
| Gesture frame interval            |         640 |      9.9 ms | <= 20 ms   | Pass   |
| Attributable long tasks           |         680 |           0 | 0          | Pass   |

All 40 measured gestures produced the same deterministic result checksum
(`20953.676`). The checked-in browser test emits every raw recomputation and
frame-interval sample as JSON before applying the assertions, so a maintainer
can inspect the complete distribution on every run rather than relying only on
this snapshot.

The existing algorithm is therefore retained. Plan 055's optional animation
frame coalescing and bounded top-50 selection are intentionally not implemented:
the predeclared engineering STOP condition applies because the observed baseline
is within budget.
