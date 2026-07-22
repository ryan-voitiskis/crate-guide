# Discogs Integration

## Scope and evidence boundary

Crate Guide uses Discogs OAuth 1.0 to import a user's collection. This document
describes the current application, migrations, tests, and source-controlled
local/deploy commands. It does not assert that a hosted function, secret, or
database migration is deployed; verify the target Supabase project separately
before a release.

## Trust boundaries

- The browser derives connection state from public profile fields and never
  directly reads or writes private Discogs credentials.
- Each Discogs Edge handler passes the caller's `Authorization` header to
  `createDiscogsCredentialRepository`. The repository calls
  `supabase.auth.getUser()` before creating a service-role client, then scopes
  every credential read/write and quota acquisition to that verified user ID.
- `discogs_credentials` has RLS enabled, no browser policy, and no
  secret-returning browser RPC. `anon` and `authenticated` have no table access;
  among application roles, only `service_role` has credential CRUD privileges.
- `authenticated-discogs-request` accepts a small structured endpoint union and
  constructs the Discogs URL server-side. It is not an arbitrary URL proxy and
  supports reads only.
- Source-controlled `supabase/config.toml` sets `verify_jwt = false` for each
  function so asymmetric project signing keys do not depend on legacy gateway
  verification. Every handler still authenticates its caller internally before
  privileged work. Hosted gateway settings remain an environment verification
  responsibility.
- Local function commands use `--no-verify-jwt` only for emulation. That bypasses
  the local gateway check, not handler authentication.

## OAuth flow

### Request token

1. The browser invokes `get-discogs-request-token` with its Supabase session.
2. The handler verifies the caller through the credential repository. The
   shared provider transport acquires server-side Discogs quota for that
   verified user immediately before dispatch.
3. The handler calls Discogs's request-token endpoint. OAuth consumer data,
   signature, nonce, timestamp, and callback travel in the `Authorization`
   header; the endpoint URL has no OAuth query parameters.
4. The returned request token and secret are written directly to the caller's
   private credential row with the service role. Only the public request token
   is returned to the browser.
5. The browser redirects to Discogs's authorization page with that public
   request token in the protocol-required authorization URL.

### Access token and identity

1. Discogs redirects the browser with the public request token and verifier;
   the browser sends them in the JSON body of `get-discogs-access-token`.
2. The handler verifies the Supabase caller, reads only that user's pending
   credential row with the service role, and rejects a callback-token mismatch.
3. The quota-bound transport posts to Discogs's access-token endpoint.
   The OAuth token, verifier, PLAINTEXT signature, nonce, and timestamp are in
   the `Authorization` header, not the URL.
4. The handler stores the private access token and secret for the verified user,
   then performs a separately charged signed identity request. If identity JSON,
   its upstream request, or the profile write fails, the handler returns
   `discogs_identity_pending`. A retry sends only `{ "resume": true }`; the
   server reloads access credentials for the current authenticated user and
   never repeats the verifier exchange or accepts a user/token selector.
5. An avatar lookup is separately charged, trusted-host-only, and optional. Its
   failure cannot invalidate a valid identity. Subsequent signed API requests
   use HMAC-SHA1 and place OAuth data in the `Authorization` header; URL query
   parameters are limited to signed business pagination values.
6. The caller-scoped client publishes only public `discogs_username` and avatar
   profile fields, then the repository clears obsolete request credentials.
   Client stores derive connected state from those valid public identity fields.

`disconnect_discogs` remains an authenticated, identity-bound database RPC. It
derives `auth.uid()`, deletes that user's credential row, and clears the public
Discogs identity fields atomically; it does not return credentials.

## Authenticated collection reads and import

`useDiscogsApi` exposes `getFolders()`, `getFolderReleases()`, and `getRelease()`.
It invokes `authenticated-discogs-request` with one of three structured request
variants: `folders`, `folder_releases`, or `release`. The handler validates IDs
and pagination, obtains the collection username through the caller-scoped
profile client and constructs an `api.discogs.com` URL. The shared signed
transport acquires quota immediately before performing one GET.

The import pipeline then:

1. filters releases already present in the user's library;
2. fetches full release data with bounded retry/cancellation behavior;
3. validates and transforms Discogs artists, labels, track positions,
   durations, genres, and RPM metadata; and
4. calls `import_record_with_tracks`, which inserts a record and its tracks in
   one database transaction and is idempotent for a user's Discogs release ID.

Completed/cancelled/failed transfer summaries are persisted per verified user
in session storage. Private OAuth values are not part of that snapshot.

## Server-side quota

Every provider dispatch passes through the quota-bound transport, including
request-token exchange, access-token exchange, identity, optional avatar, and
authenticated collection reads. Quota is acquired immediately before fetch.
The transport calls the repository's `consumeRequestQuota()`; denial cannot
dispatch a provider request. The service role invokes
`consume_discogs_request_quota` with the verified user UUID and validated
configuration; clients cannot supply bucket keys or execute the RPC.

The database function creates one user bucket and one shared global bucket,
locks both keys in stable order with transaction advisory locks, evaluates and
updates them atomically, and does not consume budget on denial. A denial returns
a stable HTTP `429` response with `code: discogs_rate_limited`, `retryable: true`,
bounded `retry_after_ms`, and a matching `Retry-After` header.

Defaults and bounds are enforced in both the Edge configuration reader and the
database function:

| Variable                            | Default | Contract                                                      |
| ----------------------------------- | ------- | ------------------------------------------------------------- |
| `DISCOGS_RATE_LIMIT_PER_USER`       | `45`    | Positive integer, no greater than the global limit            |
| `DISCOGS_RATE_LIMIT_GLOBAL`         | `55`    | Positive integer at most `57`, reserving three callback calls |
| `DISCOGS_RATE_LIMIT_WINDOW_SECONDS` | `60`    | Integer from `60` through `120` seconds                       |

## Environment readers

| Variable                            | Reader / purpose                                               |
| ----------------------------------- | -------------------------------------------------------------- |
| `DISCOGS_CONSUMER_KEY`              | `getDiscogsConfig()`; OAuth consumer identifier                |
| `DISCOGS_CONSUMER_SECRET`           | `getDiscogsConfig()`; server-only OAuth signing secret         |
| `DISCOGS_USER_AGENT`                | `getDiscogsConfig()`; Discogs API and identity/avatar requests |
| `DISCOGS_RATE_LIMIT_PER_USER`       | `getDiscogsRateLimitConfig()`; optional per-user quota         |
| `DISCOGS_RATE_LIMIT_GLOBAL`         | `getDiscogsRateLimitConfig()`; optional shared quota           |
| `DISCOGS_RATE_LIMIT_WINDOW_SECONDS` | `getDiscogsRateLimitConfig()`; optional quota window           |
| `SITE_URL`                          | One HTTP(S) origin for CORS and server-built OAuth callbacks   |

Shared Supabase helpers also require runtime-provided `SUPABASE_URL`, the
`default` entry in hosted `SUPABASE_PUBLISHABLE_KEYS`, and the `default` entry
in hosted `SUPABASE_SECRET_KEYS` for caller verification and server
repositories. Singular `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`
variables are accepted for runtimes that provide them. The legacy
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names remain only as a local
CLI fallback. Keep real values in environment/secret configuration, not
documentation or source control.

## Errors and diagnostics

The authenticated dispatcher returns structured, bounded errors with stable
`code`, `retryable`, and `request_id` fields; rate-limited responses may also
include bounded retry metadata. Client code decodes those fields into
`DiscogsApiError` and never depends on provider bodies or private exception
messages.

OAuth handlers return curated public messages. Their stable rate-limit response
uses the same `discogs_rate_limited` code. A stored access credential awaiting
identity uses `discogs_identity_pending` and a credential-free retry; other
OAuth failures are classified through `PublicOAuthError` and generic fallbacks.
Logs contain operational
classification (request ID, endpoint, attempt, status, and stable code where
applicable), not OAuth response bodies, credentials, authorization headers, or
raw private errors. The browser additionally rejects unusually long or
credential-shaped OAuth messages.

## Record-cover cleanup responsibilities

Discogs imports may initially retain an external cover URL. When a cover is
uploaded into the private `record-covers` bucket, its managed path is shaped as
`<user UUID>/<record UUID>/<file UUID>.webp`. A row-level database invariant
requires the exact owning user and record prefix plus the application UUID WebP
filename. Its forward migration stops with a remediation hint if pre-existing
rows contain a legacy mismatch. The authenticated Storage insert policy
requires exactly those two folder components; it rejects both shallower and
deeper new uploads, while service cleanup remains able to remove older objects
at any legacy depth.

- A database trigger atomically enqueues an obsolete managed path when a record
  cover is replaced or the record is deleted. Jobs have no user/record foreign
  key, so they survive the domain deletion and cannot be read by browser roles.
  While a job exists, its exact path is a database tombstone: records cannot
  attach that obsolete path again until service cleanup removes the job.
- The browser invokes `cleanup-record-covers` without sending a path. The
  authenticated service worker loads at most 100 jobs for the verified user,
  validates their path shape again, checks current record references, and sends
  only unreferenced paths to Storage.
- Storage removal is acknowledged at the request level: `error === null` is
  success even when an object was already missing. Any ambiguous Storage or
  database failure retains the job and returns a controlled deferred result. A
  service-only set-based RPC marks as many as 100 observed jobs in one database
  call, using each job's observed attempt count as compare-and-set protection so
  a stale failure cannot increment a concurrently advanced row twice.
- The records store validates the response counts and drains successful full
  pages until a short page proves the queue was reached, with finite per-page
  retries and a separate total-page bound. Each successful cover replacement,
  record deletion, or bulk deletion requests fresh cleanup ownership and waits
  for an invocation that began after that database mutation committed. Initial
  load cleanup remains detached, and unsuccessful work is eligible for a later
  refresh retry.
- Each browser invocation has a 20-second timeout and an abort signal. Account
  reset or sign-out aborts the active request, invalidates its generation, and
  settles old waiters without issuing a warning for the stale account.
- The browser directly deletes only a newly uploaded object whose record update
  failed, because no committed trigger job exists for that object.

Account deletion has an additional service-owned recovery path:

- `delete-account` idempotently persists one immediately claimable
  `record_cover_account_cleanup_jobs` outbox row before calling `deleteUser`.
  If scheduling fails, deletion stops while the identity still exists. The
  request performs no Storage enumeration, so Auth deletion does not depend on
  account-sized or never-settling traversal. A successful response explicitly
  reports that cover and queue cleanup remain queued for the durable worker.
- The outbox has no auth-user foreign key and no browser policies or grants.
  Service-role-only RPCs claim one available job under a two-minute lease and
  order fairly by the last claim/release attempt, then stable creation and user
  ties. Claiming immediately records `last_attempted_at`, so an expired crash
  lease rotates behind untouched available work. Completion or release must
  present the current claim token; release retains the row, records a bounded
  attempt count, and applies a short retry delay.
- `cleanup-orphaned-record-covers` is a POST-only, no-body service endpoint. It
  accepts only an exact `apikey: <default SUPABASE_SECRET_KEYS value>`
  credential, compared timing-safely with the server environment value. It has
  no browser CORS contract, rejects ordinary authenticated and anonymous
  tokens, accepts no user/path selector, and returns only generic `processed`
  and `complete` booleans.
- One service invocation claims at most one outbox job. A fixed service-only
  database enumeration returns at most 101 exact object names for the claimed
  UUID from `storage.objects`, regardless of folder depth. The worker validates
  every returned prefix and segment, removes only the first 100 names, and uses
  row 101 as bounded proof that more work remains. Otherwise one confirming
  database enumeration after removal must be empty before ordinary-job deletion
  and exact outbox completion. A live auth user or ambiguous Storage/database
  state releases the lease for retry.
- Final outbox completion also removes the deleted account's exact Discogs
  user-quota bucket. Each worker invocation performs an independent bounded
  prune of at most 100 expired canonical user buckets. Active windows,
  unrelated keys, and the `discogs:global` bucket are never pruning targets;
  quota-maintenance failure does not delay cover traversal, while exact
  deleted-user retirement remains retryable outbox work.
- After its own work succeeds, ordinary `cleanup-record-covers` schedules at
  most one service-selected outbox batch through the Edge background lifetime.
  It does not await Auth, Storage, or outbox work from that opportunistic task.
  Scheduling failure and background rejection are opaque and cannot change the
  ordinary caller's already-computed counts or status or expose cross-account
  information.
- The repository contains no source-controlled hosted schedule for the service
  endpoint. Its presence supports an operator or future scheduler, but this
  guide makes no claim that the function is deployed, configured, or scheduled
  in any hosted project.
- Account-deletion responses distinguish `cover_cleanup_complete` from
  `cleanup_queue_complete`; either false means the account deletion succeeded
  with incomplete cleanup and triggers the same generic client warning.

## Verification commands

These focused commands exercise different layers; they are not substitutes for
one another.

Direct Discogs Edge handler/helper tests:

```bash
cd supabase
deno test functions/_shared/discogs/*.test.ts \
  functions/authenticated-discogs-request/handler.test.ts \
  functions/get-discogs-request-token/handler.test.ts \
  functions/get-discogs-access-token/handler.test.ts \
  functions/get-discogs-access-token/validateCredentials.test.ts
cd ..
```

Direct Discogs database contracts (requires the local Supabase stack):

```bash
npx supabase test db \
  supabase/tests/discogs_credentials.sql \
  supabase/tests/discogs_request_rate_limits.sql
```

Focused application contracts:

```bash
npx vitest run --project stores \
  app/composables/__tests__/useDiscogsApi.test.ts \
  app/stores/__tests__/discogsAuthStore.test.ts \
  app/stores/__tests__/discogsStore.test.ts
npx vitest run --project unit app/utils/discogs-*.test.ts
```

Documentation and umbrella gates:

```bash
npm run check:discogs-docs # Current README/integration contract only
npm run test:edge          # Every Deno Edge test
npm run test:db            # Every pgTAP file; requires local Supabase
npm run test:run           # Unit, stores, server, and Nuxt runtime projects
npm run verify             # App/E2E/browser, Edge, docs, and maintenance gates
npm run verify:full        # verify + production build + all local DB tests
```

`npm run verify` is source verification, not evidence that migrations,
functions, gateway settings, or secrets are active in a hosted environment.

## Maintenance rules

- Keep browser code on public identity fields and structured Edge calls.
- Never add a browser credential getter or accept a caller-supplied user ID in a
  service-role credential operation.
- Extend the client/handler dispatcher union together; do not accept raw URLs or
  unrestricted methods.
- Keep OAuth parameters in Discogs authorization headers for server-to-server
  exchanges and signed API requests.
- Acquire quota from the verified-user repository before a Discogs operation
  and preserve the stable `429` contract.
- Update focused commands and the Edge inventory when functions/tests change;
  do not infer hosted deployment from repository configuration.
