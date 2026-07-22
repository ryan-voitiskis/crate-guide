# Plan 066: Bound the local-audio cache and Worker lifecycle

> **Executor instructions**: Measure connection/heap behavior first. Keep this
> IndexedDB database a disposable analysis cache, separate from the durable
> local-library database planned later. Do not parallelize whole-file decoding.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/utils/localAudioCache.ts app/composables/useLocalAudioAnalysis.ts app/workers/localAudioAnalysis.worker.ts test/nuxt/localAudioCache.nuxt.test.ts test/nuxt/useLocalAudioAnalysis.nuxt.test.ts app/pages/settings.vue`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 056 and 058
- **Category**: performance / resource lifecycle
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

Each cache get/put opens and closes IndexedDB, so a 10k-file cold scan can make
up to 20k serial opens. Version/path/mtime keys have no retirement policy, and
the Essentia Worker/WASM stays resident after successful batches under global
KeepAlive.

## Current state

- `localAudioCache.ts:17-70` opens a database per operation and has one store,
  no index, no pruning.
- `useLocalAudioAnalysis.ts:391-473` awaits cache read/write per file.
- `ensureWorker` creates lazily; successful batch completion does not terminate.
- `localAudioAnalysis.worker.ts:10-20` retains one Essentia instance for Worker
  lifetime.

## Commands you will need

| Purpose     | Command                                                                                                             | Expected on success     |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Cache tests | `npx vitest run --project nuxt test/nuxt/localAudioCache.nuxt.test.ts test/nuxt/useLocalAudioAnalysis.nuxt.test.ts` | all pass                |
| Browser     | `npm run test:browser`                                                                                              | cache/heap budgets pass |
| Full gate   | `npm run verify`                                                                                                    | exit 0                  |

## Scope

**In scope**: cache module/composable/Worker, schema upgrade tests, a cache
status/clear control in Settings, performance corpus, and docs/privacy wording.

**Out of scope**: durable library data, raw audio caching, background sync,
partial decoding (Plan 058), or persisting file handles/drafts (Plan 074).

## Git workflow

- Branch: `codex/066-bound-local-audio-cache-and-worker`
- Commit: `perf(audio): bound cache and worker lifecycle`

## Steps

1. Add 1k/10k cache-hit/cold-scan instrumentation for DB opens, transactions,
   wall time, Worker starts, and post-batch heap where supported. Check in
   explicit budgets; retain a functional fallback when memory metrics are not
   exposed.
2. Upgrade the cache schema forward. Add an `updatedAt` index and a session API
   that holds one connection for a scan, supports chunked multi-get/buffered
   writes, closes on completion/error/versionchange, and reports blocked
   upgrades. A 10k hit scan must use one connection and bounded transactions,
   not 10k opens.
3. Prune deterministically at session start/end: remove obsolete analyzer/
   configuration generations first, then entries older than 90 days, then the
   oldest-written overflow by `updatedAt` above a documented 20,000-entry cap.
   This is deliberately not called LRU: cache hits do not write access timestamps
   and recreate the churn being removed. Pruning is best-effort and chunked; it
   must never delete the active version's just-written batch.
   Expose count/last-pruned/clear-cache without calling it a library backup.
4. After successful or failed batch completion, start a 30-second idle timer.
   Reuse the Worker for an immediate next batch; terminate on timeout, explicit
   cancel, scope disposal, or route deactivation when no batch is active.
   Keep active background work alive and cancel timers on reactivation.
5. Document cache eviction and separation from durable library/provenance.

**Verify after each step**: focused tests; finally browser, conventions, and
full gate.

## Test plan

Cover version upgrade, blocked/versionchange, connection error, batched hits and
misses, write failure, each prune tier, concurrent session attempt, clear while
idle, KeepAlive deactivate/reactivate, idle timer reuse/termination, active
batch protection, and quota failure.

## Done criteria

- [x] A 10k-file cache scan uses bounded connections/transactions and meets the recorded budget.
- [x] Old cache generations/age/oldest-write overflow retire without touching durable library data.
- [x] Essentia Worker/WASM terminates after idle/deactivation and is reused for immediate work.
- [x] Cache settings, privacy wording, focused/browser/full gates pass.

## STOP conditions

Stop if pruning could target the future durable library DB, if a schema upgrade
would clear existing cache without consent, or if route deactivation would kill
an active batch.

## Maintenance notes

The entry/age limits are policy constants with tests. Revisit them using real
storage telemetry, not by silently increasing them when a fixture fails.
