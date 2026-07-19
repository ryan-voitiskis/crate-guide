# Plan 032: Add a service-owned retry path for deleted-account cover cleanup

> **Executor instructions**: Execute in an isolated worktree and treat all new
> service-role surfaces as security-sensitive. Follow the exact outbox and
> redaction contract below, run disposable account-deletion smoke tests, and
> commit conventionally. Do not edit the plan tracker.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001, 002, 007, 014, and 031
- **Category**: durability / security
- **Planned at**: commit `98f0bda`, 2026-07-19
- **Completed by**: commit `ab003ad` (integrated as `aed26ae`), 2026-07-19

## Why this matters

`delete-account` deletes the auth identity before its final Storage and queue
cleanup. If either post-delete operation fails, durable queue rows remain and
the response truthfully reports incomplete cleanup—but the only cleanup endpoint
requires `getUser()` for an auth identity that no longer exists. There is no
service-owned consumer, so the retained work is unreachable and a failed final
Storage pass may leave objects indefinitely.

Persist account-folder cleanup intent before deleting the identity, complete it
synchronously when possible, and make later bounded service processing possible
without trusting a deleted user's token or accepting a caller-supplied user/path.

## Scope

Create:

- `supabase/migrations/20260719124000_add_account_cover_cleanup_outbox.sql`
- `supabase/tests/account_cover_cleanup_outbox.sql`
- `supabase/functions/_shared/accountCoverCleanup.ts`
- `supabase/functions/_shared/accountCoverCleanup.test.ts`
- `supabase/functions/cleanup-orphaned-record-covers/index.ts`
- `supabase/functions/cleanup-orphaned-record-covers/handler.ts`
- `supabase/functions/cleanup-orphaned-record-covers/handler.test.ts`
- `supabase/functions/cleanup-orphaned-record-covers/deno.json` if required

Modify:

- `supabase/functions/delete-account/handler.ts`
- `supabase/functions/delete-account/handler.test.ts`
- `supabase/functions/cleanup-record-covers/handler.ts`
- `supabase/functions/cleanup-record-covers/handler.test.ts`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)

Do not add real service keys, deploy, claim a hosted schedule exists, accept a
user ID/path in either request body, or expose outbox data/counts to ordinary
users. Plan 022 owns final documentation after this lands.

## Required architecture

### 1. Add a service-only account cleanup outbox

Create `record_cover_account_cleanup_jobs` with one row per deleted/deleting
user, no auth-user foreign key, creation/attempt timestamps, non-negative
attempt count, and a bounded lease (`locked_until`). Enable RLS with no browser
policies; revoke PUBLIC/anon/authenticated; grant only required service-role
operations.

Add service-role-only RPCs with pinned search paths:

- idempotently enqueue the verified target account before identity deletion;
- atomically claim the oldest available/expired job using `FOR UPDATE SKIP
LOCKED` and a short lease, returning at most one user ID;
- complete/delete an exactly claimed job;
- release/mark failure without deleting it.

Revoke direct execution from browser roles. The Edge layer may never accept the
outbox user ID from a request.

### 2. Extract one bounded account-folder cleanup batch

Share the default Storage/service adapter between account deletion and retry
handlers. One retry batch must:

- list at most 100 entries under the claimed `<user UUID>/` folder, using the
  existing strict recursive listing/path validation rules;
- remove at most 100 exact listed paths with request-level Storage
  acknowledgement;
- when objects remain, release the lease for another bounded pass;
- only after a confirming empty listing, delete that user's ordinary
  `record_cover_cleanup_jobs`, then complete the account outbox job;
- on any Storage/database ambiguity, retain/release the outbox job, increment
  bounded attempt metadata, and disclose no user ID/path/private error.

Concurrent consumers must be safe through the database lease and idempotent
Storage deletion.

### 3. Persist intent before `deleteUser`

In `delete-account`:

- keep recent-auth, confirmation, and initial full-tree cleanup;
- enqueue the account cleanup outbox after initial cleanup but **before**
  `deleteUser`; if enqueue fails, abort deletion with a controlled 503 so the
  user identity still exists and can retry;
- after identity deletion, use the same bounded/full synchronous cleanup path;
  on full success delete ordinary jobs and complete the outbox;
- on final Storage/queue failure, retain the outbox and return successful account
  deletion with incomplete flags as today;
- do not weaken existing response redaction or recent-auth semantics.

Crashes at every await boundary after outbox insertion must leave either a live
user who can retry or a service-owned outbox row.

### 4. Add service and opportunistic consumers

Create `cleanup-orphaned-record-covers` as a service-role-only POST/no-body
function:

- authenticate by exact service-role authorization using a dependency-injected,
  timing-safe comparison or an equivalently strong server-side role check;
- claim/process at most one bounded outbox batch;
- accept no user ID, path, or selector;
- return only generic `{ processed: boolean, complete: boolean }`-style state,
  never account/path/error details;
- reject ordinary user/anon tokens even though they are valid JWTs.

Also let a successful ordinary `cleanup-record-covers` call opportunistically
process at most one outbox batch after the caller's own work. This processing is
service-selected, never affects the caller's counts/status, and never exposes
cross-account information. It provides automatic progress while the app has
active authenticated users; the dedicated service endpoint covers operator or
future scheduled invocation when it does not.

Do not add a repository schedule that assumes unconfigured hosted secrets. Plan
022 must document the source-controlled service endpoint and explicitly state
that hosted scheduling/secret configuration requires separate verification.

## Tests

### pgTAP

Prove outbox schema/no-FK survival, RLS/grants, pinned/revoked RPCs, idempotent
enqueue, single claimant under lease, expired-lease reclaim, exact completion,
failure attempt increment, and job survival after auth-user cascade.

### Deno

Prove:

- delete-account aborts before `deleteUser` when outbox enqueue fails;
- crashes/failures after identity deletion retain the outbox;
- successful final cleanup completes it only after empty Storage and ordinary
  queue deletion;
- service endpoint rejects user/anon/malformed auth and all bodies;
- request chooses no target, processes one bounded claimed job, paginates across
  invocations, and redacts all identity/path/private failures;
- lease contention produces a generic no-work success;
- ordinary user cleanup can advance one orphan job but its response is identical
  whether no orphan, success, or orphan failure;
- Storage and database ambiguity retain retry state.

### Disposable smoke

With generated local users/objects only:

1. force or inject a post-delete cleanup failure so the auth user disappears
   while the outbox remains;
2. invoke the service cleanup function with the local service role and no body;
3. prove objects, ordinary queue rows, and outbox row disappear;
4. prove an ordinary user token cannot invoke the service function and sees no
   deleted-account information through its own cleanup response.

## Verification

```bash
npm run format
npm run genTypes
npm run check:database-types
npm run test:db
npm run check:edge
npm run lint:edge
npm run test:edge
npx vitest run --project stores app/stores/__tests__/userStore.test.ts
npm run check:conventions
npm run verify:full
git diff --check
```

All commands exit 0. Generated types contain only the outbox/RPC contract and
remain byte-identical. No production deployment is claimed.

## Done criteria

- [ ] Cleanup intent is durable before auth identity deletion.
- [ ] Every post-delete failure leaves service-owned retryable work.
- [ ] One bounded, leased service consumer can finish orphan folders without a
      deleted-user token or caller-selected target.
- [ ] Ordinary authenticated activity can safely make opaque progress.
- [ ] Browser roles gain no outbox/service privileges or cross-account signal.
- [ ] Account deletion/recent-auth and partial-success semantics remain truthful.
- [ ] SQL, Edge, generated-type, client, smoke, and full gates pass.

## STOP conditions

Stop if service-role authentication cannot be distinguished safely at the Edge
boundary, if an outbox row cannot be persisted before deletion without exposing
it to browsers, if folder cleanup cannot be bounded/idempotent, if ordinary
users can infer target identity/path/status, if generated types show unrelated
drift, or if verification fails twice.

## Maintenance notes

Hosted scheduling is an operational layer, not a source-code fact. Keep the
outbox lease and dedicated service endpoint usable by a future verified
scheduler, and keep ordinary-user opportunistic processing opaque and bounded.
