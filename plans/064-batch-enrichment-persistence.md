# Plan 064: Persist enrichment updates in owned batches

> **Executor instructions**: Replace serial per-row PostgREST updates with a
> bounded, authenticated batch contract. Preserve per-row preconditions,
> account replacement, ordered results, partial failure visibility, and local
> store reconciliation from Plan 044.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/stores/tracksStore.ts shared/types/trackUpdates.ts app/composables/useTrackEnrichmentWorkflow.ts app/stores/__tests__/tracksStore.test.ts supabase/migrations supabase/tests shared/types/database.ts supabase/functions/_shared/types/database.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 044 and 052
- **Category**: performance / correctness / database
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

`updateTracksBatch` is a batch in name only: it awaits one network update per
track. Large reviewed imports therefore take roughly row count times round-trip
latency. Naive parallelism would weaken cancellation, CAS, and account ownership,
so the durable fix is a bounded server batch with explicit per-row results.

## Current state

- `tracksStore.ts:593-640` loops `for (const batchUpdate ...)` and awaits
  `applyTrackUpdate` for each item.
- `applyTrackUpdate` applies null BPM/key preconditions and publishes one decoded
  owned row.
- `TrackBatchUpdate` currently has ID, updates, and null preconditions but no
  expected row revision.
- Only `useTrackEnrichmentWorkflow.ts:488` calls the batch API in production.

## Commands you will need

| Purpose     | Command                                                                    | Expected on success       |
| ----------- | -------------------------------------------------------------------------- | ------------------------- |
| Database    | `npm run test:db`                                                          | all pgTAP assertions pass |
| Store tests | `npx vitest run --project stores app/stores/__tests__/tracksStore.test.ts` | all pass                  |
| Types       | `npm run genTypes && npm run check:database-types`                         | generated copies match    |
| Full gate   | `npm run verify:full`                                                      | exit 0                    |

## Scope

**In scope**:

- `shared/types/trackUpdates.ts`
- `app/stores/tracksStore.ts` and tests
- `app/composables/useTrackEnrichmentWorkflow.ts` and tests
- one forward migration for a narrowly scoped enrichment batch RPC
- pgTAP security/correctness tests and generated type copies
- optional benchmark script/fixture

**Out of scope**: general arbitrary bulk track editing, changing fill-only
product semantics, overwriting nonblank BPM/key, evidence-only persistence
(Plan 075), or unbounded client concurrency.

## Git workflow

- Branch: `codex/064-batch-enrichment-persistence`
- Commit: `perf(enrichment): persist reviewed updates in batches`

## Steps

### Step 1: Characterize the existing public contract

Lock result order, progress callbacks, decode issues, partial failures,
cancellation on account replacement, duplicate IDs, and optimistic rollback in
tests. Add a 500-row request-count/latency harness.

**Verify**: characterization passes and proves one request per row today.

### Step 2: Add a narrow authenticated batch RPC

Create a forward migration for a maximum 100-item JSON batch. Each item carries
ordinal, track ID, expected `updated_at`, allowed enrichment fields, and null
preconditions. Derive the user from `auth.uid()` and prove ownership through the
track's record; never accept `user_id`. Validate duplicate IDs, item/JSON sizes,
numeric/key ranges, and `audio_features` codec shape.

Use compare-and-set on `updated_at` plus BPM/key preconditions. Each request has
a random operation ID; each item has its ordinal and canonical request hash.
Write a bounded, owner-scoped idempotency receipt in the same transaction as an
update/status so retrying the identical operation returns the original outcome
instead of turning a committed timeout into `stale`. Reject an operation ID
reused with a different hash and prune receipts after a documented retry window.

Return exactly one redacted server status per input ordinal (`updated`, `stale`,
`not_found`, `invalid`) and the complete updated row only when owned. Keep
execute privileges allowlisted and test anonymous/cross-user denial.

**Verify**: pgTAP proves ownership, bounds, CAS, rollback, ordering, and grants.

### Step 3: Chunk and reconcile on the client

Send sequential bounded chunks (start at 100; do not create unbounded parallel
RPCs). Expose a discriminated public outcome union: `updated` with its row;
`stale`, `not_found`, or `invalid` with a redacted issue; client-synthesized
`unknown` with the retry operation/item identity; and `unattempted`. Decode every
returned row, reconcile through Plan 044's per-ID operation revision, keep
results in input order, and call progress once per terminal or accurately
unknown row. Retry `unknown` with the same operation ID/hash so the server
receipt resolves commit ambiguity; a new operation is never used until that
read-back/retry contract settles. Account replacement stops future chunks and
prevents settled old chunks from publishing.

If an `unknown` survives beyond receipt retention, refetch the row, rematch its
current value/revision, and require renewed review; never infer success or retry
under a fresh operation ID automatically.

**Verify**: store/workflow interleaving tests pass.

### Step 4: Prove scale and document maintenance

Run 1, 99, 100, 101, and 500-row local-stack cases. Compare request count and
elapsed time without setting a hosted-latency claim.

**Verify**: 500 rows use five RPC calls, preserve 500 ordered statuses, and all
format/convention/type/full gates pass.

## Test plan

Cover mixed success/stale/invalid rows, duplicate IDs, concurrent manual edit,
account A to B between chunks, timeout before and after a committed chunk,
same-ID/same-hash replay, same-ID/different-hash rejection, receipt expiry,
decode failure, progress monotonicity, retry of failures, and max payload
rejection.

## Done criteria

- [x] A 500-row apply uses five bounded requests rather than 500 serial requests.
- [x] Server identity, row revision, and fill-only preconditions are enforced per item.
- [x] Client results/progress remain ordered and truthful under partial failure and account change.
- [x] Same-operation retry resolves timeout-after-commit without a false stale/failure result.
- [x] SQL, generated types, store/workflow, and full gates pass.

## STOP conditions

Stop if the RPC must accept arbitrary columns or owner IDs, if `updated_at`
cannot be a reliable CAS after Plan 044, if per-row results become ambiguous,
or if hosted payload limits require a smaller chunk (measure and document it).

## Maintenance notes

Plan 075 may evolve audio-evidence merging. It must extend this narrow RPC or an
equivalent atomic merge contract rather than reintroducing stale client JSON.
