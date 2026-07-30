# Local audio cache performance

This contract covers the disposable IndexedDB cache used by local audio
analysis. It does not cover durable library data, raw audio, or remote backup.

## Mandatory gates

Every browser run enforces the checked-in connection and transaction ceilings,
cache-hit and cache-miss results, zero analysis-Worker starts, and the
post-batch heap ceiling when Chromium exposes that metric. The source of truth
is `shared/config/localAudioCache.json`.

The browser test always emits wall-clock measurements. It enforces their
checked-in budgets by default and whenever
`LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS=1`. An invalid value fails
configuration. GitHub-hosted CI explicitly sets the value to `0` because its
ephemeral Linux storage throughput is not a named or stable calibration
profile; timing remains visible there, while all deterministic resource and
correctness gates remain mandatory.

This separation does not increase or silently bypass the numeric budgets.
Run the strict profile with:

```bash
LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS=1 \
	npx vitest run --project browser \
	test/browser/localAudioCachePerformance.browser.test.ts \
	--reporter=verbose
```

## Protocol

The deterministic fixture runs cache-hit and cold-cache scans at 1,000 and
10,000 records. Each scenario clears the cache, opens one session, prunes,
performs a chunked read, buffers any cold writes, flushes, prunes again, and
closes. Writes use 250-record transactions, matching the read chunk size.

The 10,000-record cold scenario measured 1,843.8 ms with 108 transactions on
the local Chromium profile on 30 July 2026, within the unchanged 7,500 ms
budget. The same exact source measured 9,457.8 ms on a GitHub-hosted
two-core Linux runner while preserving one connection, 108 transactions,
10,000 misses, zero Worker starts, and the heap gate. That provider-bound
storage result is retained as diagnostic evidence rather than used to redefine
the calibrated limit.
