# Plan 006: Enforce atomic per-user and global Discogs request quotas server-side

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/migrations supabase/tests supabase/functions/_shared/discogs supabase/functions/authenticated-discogs-request supabase/functions/get-discogs-request-token supabase/functions/get-discogs-access-token shared/types/database.ts supabase/functions/_shared/types/database.ts supabase/functions/.env.example README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/001-add-database-test-gate.md`, `plans/002-enforce-database-type-parity.md`
- **Category**: security
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `eba2178` (integrated as `12d8d58`), 2026-07-19

## Why this matters

The browser has retry/backoff behavior and the proxy translates upstream 429s,
but authenticated users can still call every Discogs Edge Function directly and
consume the project's shared provider quota. A database-backed quota must be
atomic across Edge isolates, derive its subject from the verified user, and
reject excess requests before contacting Discogs. Both per-user and global
budgets are needed so one account cannot monopolize the consumer key and many
accounts cannot collectively exceed it.

## Current state

- `authenticated-discogs-request/handler.ts:62-73` injects only
  `createCredentials` and `makeRequest`; lines 296-299 immediately authenticate,
  resolve a URL, and contact Discogs.
- The handler already has a stable `discogs_rate_limited` envelope and
  `Retry-After` behavior for upstream 429s (`handler.ts:140-145,226-263`). Reuse
  that public contract for local denials.
- Request/access-token handlers authenticate before their upstream exchanges but
  have no local quota.
- `supabase/functions/_shared/discogs/credentials.ts:35-75` validates the caller,
  creates a service-role client, and keeps that client private inside the
  repository closure.
- `20260417120200_add_rate_limit_rpc.sql` created a caller-keyed generic limiter;
  `20260714121000_remove_unused_rate_limiter.sql:1-10` deliberately revoked and
  dropped it. Do not restore that API: it accepted caller-chosen keys and was
  granted to `authenticated`.
- Current SQL security tests use pgTAP and explicit role checks; model the new
  suite after `supabase/tests/discogs_credentials.sql`.
- `supabase/config.toml:14-16` caps PostgREST responses at 1,000 rows; the quota
  RPC must return one row.

## Commands you will need

| Purpose        | Command                                                        | Expected on success                     |
| -------------- | -------------------------------------------------------------- | --------------------------------------- |
| Database tests | `npm run test:db`                                              | all pgTAP suites pass                   |
| Generate types | `npm run genTypes`                                             | exit 0; both copies updated identically |
| Type parity    | `npm run check:database-types`                                 | exit 0                                  |
| Edge gates     | `npm run check:edge && npm run lint:edge && npm run test:edge` | exit 0                                  |
| Full gate      | `npm run verify:full`                                          | exit 0                                  |

## Scope

**In scope** (the only files you should modify):

- `supabase/migrations/20260719120000_add_discogs_request_rate_limits.sql` (create)
- `supabase/tests/discogs_request_rate_limits.sql` (create)
- `supabase/functions/_shared/discogs/rateLimit.ts` (create)
- `supabase/functions/_shared/discogs/rateLimit.test.ts` (create)
- `supabase/functions/_shared/discogs/credentials.ts`
- `supabase/functions/_shared/discogs/credentials.test.ts`
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.test.ts`
- `supabase/functions/authenticated-discogs-request/handler.ts`
- `supabase/functions/authenticated-discogs-request/handler.test.ts`
- `supabase/functions/get-discogs-request-token/handler.ts`
- `supabase/functions/get-discogs-request-token/handler.test.ts`
- `supabase/functions/get-discogs-access-token/handler.ts`
- `supabase/functions/get-discogs-access-token/handler.test.ts`
- `supabase/functions/.env.example`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)
- `plans/README.md` status row

**Out of scope**:

- Reintroducing `check_rate_limit(TEXT[], INT, INT)` or a public generic table
- Client-side-only throttling, IP-address collection, CAPTCHAs, or analytics
- Provider retry policy or import concurrency changes
- Any live Discogs or hosted Supabase configuration mutation
- Documentation narrative; Plan 022 owns final Discogs docs

## Git workflow

- Branch: `codex/006-discogs-rate-limits`
- Use focused Conventional Commits, for example
  `feat(database): add Discogs request quotas` and
  `fix(discogs): enforce server request limits`.
- Do not deploy, push, or open a PR unless instructed.

## Steps

### Step 1: Verify provider allowance and choose conservative defaults

Consult the current official Discogs API rate-limit documentation. Record only
the numeric authenticated allowance in the PR description, not credentials.
Use a 60-second window with defaults of 45 requests per user and 55 globally
only if both remain below the documented allowance. Environment overrides must
be positive integers and must satisfy `perUser <= global <= providerAllowance`.
The window override must remain between 60 and 120 seconds so configuration can
neither exceed the provider's per-minute allowance nor outgrow the public
retry-metadata cap. Enforce those bounds in both the Edge parser and the RPC;
the RPC must also independently reject global limits above 60.

Add names, not values, to `.env.example`:

```text
DISCOGS_RATE_LIMIT_PER_USER=
DISCOGS_RATE_LIMIT_GLOBAL=
DISCOGS_RATE_LIMIT_WINDOW_SECONDS=
```

**Verify**: a new `rateLimit.test.ts` configuration test accepts 45/55/60 and
rejects zero, non-integers, per-user greater than global, global greater than
the provider allowance, and windows outside 60–120 seconds.

### Step 2: Add a service-role-only atomic quota RPC

Create a forward-only migration with:

- table `public.discogs_request_rate_limits` containing `bucket_key TEXT PRIMARY
KEY`, `request_count INTEGER NOT NULL`, and `reset_at TIMESTAMPTZ NOT NULL`;
- RLS enabled and no policies;
- an index on `reset_at`;
- function
  `public.consume_discogs_request_quota(target_user_id UUID, per_user_limit INTEGER, global_limit INTEGER, window_seconds INTEGER)`
  returning one row: `allowed BOOLEAN`, `retry_after_seconds INTEGER`;
- `SECURITY DEFINER` and `SET search_path = pg_catalog, public`;
- execute revoked from PUBLIC, `anon`, and `authenticated`, granted only to
  `service_role`.

Inside the function, reject null user IDs and invalid bounds. Construct exactly
two keys internally: `discogs:global` and `discogs:user:<uuid>`. Acquire
transaction advisory locks for those keys in stable lexical order so concurrent
first inserts cannot pass independently. Reset expired buckets; dry-run both
budgets; if either would exceed its limit, increment neither and return the
maximum remaining reset delay. Otherwise upsert/increment both and return
`allowed=true, retry_after_seconds=0`. Never accept a caller-supplied key.

**Verify**: `npm run test:db` -> the new SQL file passes along with all existing
suites.

### Step 3: Write pgTAP security and semantics tests

In `supabase/tests/discogs_request_rate_limits.sql`, cover:

1. table exists with RLS and no `anon`/`authenticated` access;
2. RPC execute is service-role-only;
3. first requests increment user and global buckets;
4. duplicate calls reach the per-user limit exactly and the next call is denied;
5. denial increments neither bucket;
6. two users have independent user buckets but share the global bucket;
7. expired buckets reset;
8. invalid limits/user IDs raise;
9. keys are constructed internally and contain no arbitrary caller text.

Use a transaction and rollback like existing pgTAP files. Where pgTAP cannot
create true concurrency, add a SQL comment identifying advisory-lock review as
the concurrency proof and inspect the migration in review.

**Verify**: `supabase test db supabase/tests/discogs_request_rate_limits.sql` ->
all planned assertions pass (or use `npm run test:db` if the installed CLI does
not accept a file filter).

### Step 4: Expose quota consumption through the verified credential repository

In `credentials.ts`, extend `DiscogsCredentialRepository` with:

```ts
consumeRequestQuota(): Promise<{
  allowed: boolean
  retryAfterMs: number
}>
```

Implement it with the existing private service-role client and the already
verified `user.id`. Parse environment values through `rateLimit.ts`, invoke the
new RPC, require exactly one valid row, convert seconds to bounded milliseconds,
and throw a sanitized internal error for malformed database responses. Do not
expose the service client or accept a user ID/key from handlers.

Update every repository test fixture to implement the new method. Add tests
that prove the verified user ID and validated limits are passed and database
error text is not copied into a public response.

**Verify**: `cd supabase && deno test functions/_shared/discogs/credentials.test.ts functions/_shared/discogs/rateLimit.test.ts`
-> all pass.

### Step 5: Enforce the quota in all three Discogs handlers

After request validation and caller authentication, but immediately before each
upstream Discogs fetch, call `credentials.consumeRequestQuota()` in:

- `authenticated-discogs-request/handler.ts`;
- `get-discogs-request-token/handler.ts`;
- `get-discogs-access-token/handler.ts`.

If denied, return 429 without invoking the upstream fetch. Use code
`discogs_rate_limited`, a controlled retryable message, `retry_after_ms`, and a
`Retry-After` header. The authenticated-read handler must preserve its request
ID envelope. OAuth handlers may use the same body fields without a request ID.
Do not consume quota for missing auth, malformed bodies, or callback-token
mismatch.

The accounting unit for this plan is one authenticated Edge-handler invocation.
The access-token handler's follow-up identity write is part of that same OAuth
transaction, and its optional avatar request is unauthenticated; neither is
charged as a second handler invocation. A denied access-token invocation must
still prove that neither the token exchange nor the nested identity helper ran.
Changing this to per-fetch or variable-cost reservations would require a new
atomic multi-unit RPC contract and retry design rather than sequentially
consuming partial quota inside an irreversible OAuth callback.

Add handler tests for allowed, denied, and limiter-error paths. On denial assert
the fetcher/makeRequest is not called and no credential/provider detail is
logged.

**Verify**: `npm run test:edge` -> all existing and new handler cases pass.

### Step 6: Generate types and run the complete gate

Start local Supabase if necessary, run `npm run genTypes`, and confirm the only
generated changes describe the new table/function. Never hand-edit either type
copy.

**Verify**: `npm run format && npm run check:database-types && npm run test:db && npm run check:edge && npm run lint:edge && npm run test:edge && npm run verify:full`
-> exit 0.

## Test plan

- pgTAP owns privileges, key construction, window reset, user isolation, global
  sharing, and non-consuming denials.
- Deno helper tests own configuration validation and RPC response decoding.
- All three handlers get explicit no-upstream-on-429 tests.
- Existing upstream-429 classification tests must remain green; local and
  provider rate limits intentionally share the public error code.
- Perform a local authenticated smoke by setting very low synthetic limits,
  making allowed calls, then observing a local 429. Do not contact live Discogs
  in an automated test.

## Done criteria

- [ ] Quota state is shared across isolates in Postgres and updated atomically.
- [ ] Subjects and bucket keys derive only from a server-verified user.
- [ ] Only `service_role` can execute the quota RPC or read its table.
- [ ] Per-user and global limits deny before upstream contact.
- [ ] Denials include bounded retry metadata and do not consume either bucket.
- [ ] Every Discogs Edge handler enforces the same limiter.
- [ ] Generated types are byte-identical and were produced by `genTypes`.
- [ ] Database, Edge, and full verification gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Current official Discogs documentation does not establish an authenticated
  allowance, or the 45/55 defaults are not conservative.
- The old generic limiter has been restored by another change; reconcile before
  adding a second table.
- The RPC would need execute permission for `authenticated` or accept
  caller-controlled keys.
- Atomic behavior cannot be proved for concurrent first inserts.
- Adding the method requires exposing the service-role client to handlers.
- A generated type diff includes unrelated schema changes.
- A verification command fails twice after an in-scope fix.

## Maintenance notes

- Revisit defaults only against current official provider documentation and keep
  per-user below global below provider allowance.
- Periodically purge long-expired bucket rows in a separate maintenance change
  if table growth becomes material; do not add a scheduler here.
- Reviewers should focus on privilege grants, advisory-lock ordering, denial
  non-consumption, and no-upstream handler assertions.
