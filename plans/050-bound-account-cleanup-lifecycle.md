# Plan 050: Bound the account-cleanup lifecycle

> **Executor instructions**: Build on the durable account cleanup outbox from
> Plans 032, 040, and 042. Enqueue durable intent before unbounded work, keep
> deletion response time bounded, add row/path retention invariants, and use
> forward migrations only. Commit conventionally.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 032, 040, and 042
- **Category**: durability / resource bounds / data lifecycle
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

Account deletion recursively enumerates the entire cover tree into memory
before durable cleanup intent is enqueued. A sufficiently large account can hit
an Edge time or memory limit before either deletion or retry ownership exists.
`records.cover_storage_path` is also not constrained to the owning
`user_id/record_id` prefix, allowing a mismatched direct value to evade ordinary
cleanup. Per-user Discogs rate-limit rows have no account-deletion or expiry
retirement path.

## Scope

Create forward migrations for cover-path validation and rate-limit retirement.

Modify:

- `supabase/functions/delete-account/handler.ts`
- `supabase/functions/delete-account/handler.test.ts`
- `supabase/functions/_shared/accountCoverCleanup.ts`
- `supabase/functions/_shared/accountCoverCleanup.test.ts`
- account-cover and rate-limit pgTAP suites
- generated database type copies
- relevant account deletion and cleanup documentation

Do not make cleanup targetable by an HTTP-supplied user/path, weaken service
ownership, delete global quota rows, or require a hosted scheduler without a
repository-owned fallback.

## Drift check

```bash
git status --short
rg -n "removeAllAccountCoverObjects|enqueue\(|deleteUser|cover_storage_path|discogs_request_rate_limits" supabase/functions supabase/migrations supabase/tests
```

STOP if deletion cannot persist cleanup intent before Auth deletion, or if a
path constraint would reject any current canonical upload emitted by the app.
Preflight live-compatible stored values before adding the invariant.

## Required implementation

1. Persist cleanup ownership before traversal.
   - Enqueue/claim the account cleanup before any potentially wide Storage
     listing. Failure to persist intent remains a fail-closed pre-delete error.
   - Do at most one explicitly bounded best-effort page in the request, or skip
     synchronous cleanup and let the durable worker own all traversal.
   - Auth deletion success must not depend on enumerating every object in one
     invocation. Return whether cleanup remains queued without exposing paths.

2. Preserve retry progress and idempotency.
   - A timeout/crash after enqueue leaves claimable work.
   - Repeated account deletion/finalization calls cannot create conflicting
     cleanup ownership or prematurely complete ordinary cover jobs.
   - Rename vague internal adapters such as `createAdmin` and `processOne` while
     separating repository, traversal, and orchestration responsibilities where
     it materially clarifies the state machine.

3. Enforce managed-cover path ownership.
   - Add a trigger or preflighted invariant requiring non-null managed paths to
     use the exact `<row.user_id>/<row.id>/<managed filename>.webp` shape.
   - Validate INSERT and relevant UPDATE transitions. Preserve the queue/reuse
     guards and provide an explicit migration response for any legacy mismatch.

4. Retire per-user quota rows.
   - Delete the exact user's bucket during durable account deletion cleanup.
   - Add bounded service-owned pruning for expired non-global buckets. The
     global row and active windows remain intact.

5. Prove bounded behavior.
   - Simulate trees larger than one invocation's page/call budget and a never-
     settling listing dependency. Durable intent exists and the request returns
     within the declared boundary.
   - Prove valid cover paths pass and cross-record/user paths fail.
   - Prove only expired user buckets are pruned and account deletion removes its
     own bucket.

## Test plan

```bash
npm run format
npm run test:db
npm run genTypes
npm run check:database-types
npm run check:edge
npm run lint:edge
npm run test:edge
npm run check:discogs-docs
npm run check:conventions
npm run verify:full
git diff --check
```

Also run a disposable local smoke with more than one cleanup page and remove
every generated account/object afterward.

## Done criteria

- [ ] Durable cleanup intent exists before wide or failure-prone traversal.
- [ ] Account deletion request work is explicitly bounded in calls, rows, and time.
- [ ] Managed cover paths are constrained to their owning record and user.
- [ ] Expired/user-deletion quota rows retire without touching the global bucket.
- [ ] SQL, Edge, smoke, generated-type, documentation, and full gates pass.

## STOP conditions

Stop if durable cleanup can be lost after Auth deletion, if path preflight finds
unhandled production-compatible legacy shapes, if pruning can remove the global
bucket, or if ordinary deletion again depends on full-tree enumeration.

## Git workflow

- Branch: `codex/050-bound-account-cleanup-lifecycle`
- Commit: `fix(accounts): bound durable cleanup lifecycle`
