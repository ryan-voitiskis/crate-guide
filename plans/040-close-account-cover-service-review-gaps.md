# Plan 040: Close account-cover service progress and isolation gaps

> **Executor instructions**: Execute after Plan 036 is integrated so generated
> database types include both migrations. This is a service/security state
> machine: use database-backed object enumeration, preserve exact service-only
> access, prove fairness and prompt ordinary responses, run disposable deep-path
> smoke tests, and commit conventionally. The reviewer owns the tracker.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 032 and 036
- **Category**: durability / security / availability
- **Planned at**: commit `22f9d24`, 2026-07-19
- **Completed by**: commit `fc087a5` (integrated as `cb2a7ee`), 2026-07-19

## Why this matters

Independent review reproduced three service defects. The bounded recursive
Storage retry restarts breadth-first traversal at the root on every invocation,
so an object below eight nested folders is never reached. Claims order forever
by immutable creation time, so an old live-user row can be reclaimed after each
30-second delay and starve later deleted-account work. Finally, ordinary
cleanup constructs its own successful response but synchronously awaits orphan
work with no wall-clock bound, allowing an unrelated stalled dependency to make
the caller time out and retry.

Every valid object depth must make bounded progress, every available job must
receive fair service, and cross-account opportunistic work must never delay an
ordinary user's completed request.

## Scope

Create:

- `supabase/migrations/20260719130000_close_account_cover_cleanup_gaps.sql`

Modify:

- `supabase/tests/account_cover_cleanup_outbox.sql`
- the record-cover Storage policy pgTAP suite if separate
- `supabase/functions/_shared/accountCoverCleanup.ts`
- `supabase/functions/_shared/accountCoverCleanup.test.ts`
- `supabase/functions/cleanup-record-covers/handler.ts`
- `supabase/functions/cleanup-record-covers/handler.test.ts`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)
- `docs/discogs-integration.md`

Do not accept an HTTP user/path selector, expose outbox/object details to
browser roles, weaken exact service-role authentication, add a hosted schedule,
or make the ordinary response depend on background completion.

## Required implementation

### 1. Enumerate claimed account objects through a bounded service RPC

- Add a pinned-search-path `SECURITY DEFINER` RPC callable only by
  `service_role`. It accepts the internally claimed user UUID and returns at
  most 101 exact `storage.objects.name` values from the private
  `record-covers` bucket under `<user UUID>/`, ordered deterministically.
- PUBLIC, anon, and authenticated receive no execute privilege. The Edge HTTP
  request still accepts no user, path, cursor, limit, or body; the claimed ID is
  the only RPC input source.
- Validate the returned array/row shape, maximum count, UUID prefix, separators,
  and path segments before any removal. A malformed/ambiguous response retains
  the outbox job with generic failure.
- Use the first 100 names for one Storage removal request. A 101st row proves
  more work. Otherwise perform one confirming database enumeration after
  removal; only confirmed emptiness permits ordinary-job deletion and exact
  outbox completion.
- Keep synchronous full-tree account deletion separate. The retry consumer must
  no longer depend on recursive folder depth or a restarted traversal cursor.

Tighten authenticated record-cover INSERT policy to the product's exact
`<user UUID>/<owned record UUID>/<file>.webp` shape (exactly two folder
components). The database-backed service enumeration must still remove deeper
legacy objects created before this policy correction.

### 2. Make claim order fair after every attempt

- Replace the claim RPC in the new migration. Among currently available rows,
  order by `COALESCE(last_attempted_at, created_at)`, then stable creation/user
  ties.
- Set `last_attempted_at` when a row is claimed, not only when it is released,
  so an expired crash lease also moves behind untouched available work.
- Replace the obsolete availability index with one ordered by the same
  `COALESCE(last_attempted_at, created_at)`, stable tie keys, carrying
  `locked_until` for availability filtering; the fair claim must not bake in an
  avoidable sort/scan regression.
- Preserve `FOR UPDATE SKIP LOCKED`, one-row claims, short leases, token rotation,
  bounded attempt counts, and exact-token complete/release semantics.
- A released live-user row must not monopolize a consumer that runs once per
  minute while a newer deleted-user row is already available.

### 3. Detach opportunistic work from the ordinary response

- Schedule the already-redacted orphan task through the Edge runtime's
  background lifetime (`waitUntil` or a dependency-injected equivalent) after
  the ordinary response has been computed.
- The handler must return promptly without awaiting Auth, Storage, or outbox
  work. Scheduling failure and background rejection remain swallowed/opaque and
  cannot change ordinary counts/status.
- Keep at most one service-selected account batch per successful ordinary call.
  The dedicated service endpoint remains the reliable explicit consumer.

### 4. Keep documentation source-truthful

Update the cleanup section to describe database-backed all-depth enumeration,
fair attempt ordering, exact upload depth, and background opportunistic work.
Retain the explicit no-hosted-schedule/deployment evidence boundary.

## Tests

### pgTAP

Prove the list RPC's pinned security, fixed 101-row bound, exact bucket/prefix,
deterministic order, browser revocation, deep legacy-path visibility, and no
cross-account rows. Prove exact upload depth accepts the product path and rejects
deeper paths. Prove the claim index matches fair ordering, claim updates
`last_attempted_at`, and an untouched newer job is selected before an older
released/live or expired-attempted row.

### Deno

Prove one and multiple invocations remove depth > 8 objects and make monotonic
progress; 100/101/201 objects use exact bounds; malformed/cross-prefix/duplicate
rows fail closed; confirmation races retain work; and completion still follows
ordinary-job deletion. A two-row minute-cadence regression must process the
deleted account after the live row releases. A never-settling orphan dependency
must leave the ordinary handler response promptly settled and unchanged while
the injected scheduler owns the pending task.

### Disposable smoke

Create generated local accounts and a deep legacy Storage object with the
service role, enqueue the deleted-account outbox, invoke the no-body service
endpoint, and prove object/job removal. Prove authenticated upload rejects a new
deep path and accepts the exact product path. Remove every disposable row/object.

## Verification

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

## Done criteria

- [ ] Retry progress is independent of Storage folder depth.
- [ ] Available jobs rotate fairly after claim/release/crash lease expiry.
- [ ] Ordinary successful responses never await orphan dependencies.
- [ ] Browser roles gain no object/outbox selection capability or cross-account signal.
- [ ] New uploads use exact product depth while deep legacy objects remain removable.
- [ ] SQL, Edge, smoke, types, docs, and full gates pass.

## STOP conditions

Stop if object names must come from an HTTP caller, if browser roles can execute
the listing RPC, if a claimed account can return another prefix, if fairness
breaks `SKIP LOCKED`/exact-token safety, if background work changes ordinary
responses, if deep legacy objects remain unreachable, or if a required gate
fails twice.

## Maintenance notes

Call-count bounds are not progress bounds when traversal restarts. Keep retry
selection database-backed and target-free at the HTTP boundary, and keep
background opportunism strictly secondary to the dedicated consumer.
