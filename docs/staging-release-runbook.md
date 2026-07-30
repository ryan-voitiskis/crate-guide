# Staging release runbook

This runbook covers the first hosted rehearsal of the quality-plan portfolio.
It is deliberately staging-only. It does not authorize a production database
change, Edge Function deployment, Pages deployment, secret update, scheduler
change, or provider communication.

## Current evidence

Read-only checks on 2026-07-30 found no authoritative staging environment:

- `deployment/staging-project.json` does not exist, so
  `npm run secrets:staging` fails closed.
- The primary checkout at `/Users/vz/projects/crate-guide` has an ignored
  `supabase/.temp/project-ref` containing `czlfiwivlgqhqezmywfx`. Its cached
  metadata labels it `crate-guide-prod`, and the live `https://crate.guide`
  application embeds the same Supabase ref. The candidate worktree is unlinked;
  that absence is not evidence of a staging target.
- `supabase projects list` returned only that active project, and
  `supabase branches list` returned no preview branches.
- The production project has the six candidate migrations below pending:
  - `20260722140000_document_saved_set_history_snapshots.sql`
  - `20260722200000_bound_account_cleanup_lifecycle.sql`
  - `20260722210000_enforce_crate_membership_delete_integrity.sql`
  - `20260722220000_persist_track_enrichment_batches.sql`
  - `20260723100000_add_coherent_library_snapshot.sql`
  - `20260730140000_enable_track_evidence_v2_writes.sql`
- `https://crate-guide.pages.dev` and `https://crate.guide` serve the same
  production response. No `staging.crate.guide` DNS record or working candidate
  branch alias was found.
- The production response still includes `x-powered-by: Nuxt` and does not
  include the candidate browser-security policy. That is evidence the candidate
  application is not deployed, not permission to deploy it.

### Production STOP

Do not run a linked remote command from the production-linked primary checkout.
In particular, do not run any of the following until an isolated deployment
checkout is proven to be linked to an authoritative, non-production staging ref:

```bash
npx supabase db push --linked
npx supabase config push
npx supabase functions deploy
npm run secrets:staging
```

The project name is not an adequate target check. The exact project ref is the
authority. A staging result is not production evidence, and production remains
a separate reviewed and authorized change.

## Integration and review boundary

The candidate preserves the existing linear portfolio history. Do not rewrite,
reorder, squash, or land the ranges below independently: later ranges rely on
the earlier application, database, and verification contracts. Reviewers can
use the ranges as bounded checkpoints, but the release unit is one umbrella
integration pull request from `codex/release-evidence-online` to `main`.

The pre-Evidence portfolio is also preserved at
`codex/implement-plan-portfolio` (`8bb6548`). Deferred accountless work remains
separate at `codex/accountless-mode-foundation` (`3253e15`).

| Review checkpoint                           | Commit range           |
| ------------------------------------------- | ---------------------- |
| Roadmap baseline                            | `0a0cda6..7889c0d`     |
| Edge, OAuth, library, and account work      | `7889c0d..e477e5f`     |
| Correctness, tooling, audio, and cleanup    | `e477e5f..ddadda4`     |
| Verification and crate integrity            | `ddadda4..c492e2e`     |
| Record and Discogs extractions              | `c492e2e..99e457a`     |
| Headers and audio                           | `99e457a..87b7671`     |
| Frontend decomposition                      | `87b7671..31ec0c9`     |
| Docs, bundle, and batching                  | `31ec0c9..eaf6d44`     |
| Repository, cloud, and worker contracts     | `eaf6d44..db41f06`     |
| Saved sets, drafts, snapshots, and identity | `db41f06..b774c15`     |
| Browser foundations                         | `b774c15..ca894e0`     |
| Policies, Evidence reads, and browser repo  | `ca894e0..18d0434`     |
| Integration and resumable review            | `18d0434..b40d847`     |
| Closeout and Safari                         | `b40d847..8bb6548`     |
| Cloud Evidence write activation             | `8bb6548..<candidate>` |

The umbrella pull request remains draft until its exact head passes the local
gate and CI. Passing review or CI does not authorize merge or deployment:
hosted staging evidence is a separate hard gate.

## Required staging identity

Before any hosted mutation, record all of the following:

1. A dedicated Supabase staging project ref that is not
   `czlfiwivlgqhqezmywfx`, plus its organization, region, and intended owner.
2. A stable HTTPS Pages origin, preferably `https://staging.crate.guide`. OAuth
   callbacks and Edge CORS use one exact `SITE_URL`; an ephemeral deployment URL
   is not an acceptable substitute.
3. A Pages staging branch and environment whose `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` point only to that staging project.
4. A source-controlled `deployment/staging-project.json` containing only the
   authoritative project ref.
5. An untracked staging-specific Edge env file. Do not upload
   `supabase/functions/.env` without checking it: the current developer file is
   local and its `SITE_URL` is not a staging origin.
6. Dedicated synthetic staging accounts and Discogs test data. Do not copy
   production user data, OAuth credentials, private cover URLs, or logs into
   fixtures or evidence.

The reviewed staging project record has this exact shape:

```json
{
	"supabaseProjectRef": "abcdefghijklmnopqrst"
}
```

Use an isolated, clean deployment worktree at the exact candidate SHA. The
production-linked checkout must not be repurposed:

```bash
export CRATE_GUIDE_RELEASE_SHA="<exact candidate sha>"
export CRATE_GUIDE_DEPLOY_WORKTREE="<absolute isolated worktree path>"
export CRATE_GUIDE_STAGING_REF="<authoritative staging ref>"
export CRATE_GUIDE_STAGING_URL="https://staging.crate.guide"

git worktree add --detach \
	"$CRATE_GUIDE_DEPLOY_WORKTREE" \
	"$CRATE_GUIDE_RELEASE_SHA"
cd "$CRATE_GUIDE_DEPLOY_WORKTREE"

test "$(git rev-parse HEAD)" = "$CRATE_GUIDE_RELEASE_SHA"
test -z "$(git status --porcelain)"
test ! -e supabase/.temp/project-ref
test "$CRATE_GUIDE_STAGING_REF" != "czlfiwivlgqhqezmywfx"

jq -e \
	--arg ref "$CRATE_GUIDE_STAGING_REF" \
	'.supabaseProjectRef == $ref' \
	deployment/staging-project.json

npx --no-install supabase projects list -o json |
	jq -e \
		--arg ref "$CRATE_GUIDE_STAGING_REF" \
		'any(.[]; .id == $ref and .status == "ACTIVE_HEALTHY")'

npx --no-install supabase link \
	--project-ref "$CRATE_GUIDE_STAGING_REF"

test "$(tr -d '\n' < supabase/.temp/project-ref)" = \
	"$CRATE_GUIDE_STAGING_REF"
```

Stop on any mismatch. Do not override the staging-secret wrapper or substitute
an environment variable for the reviewed deployment record.

## Release gates

The exact candidate head must pass CI and the local integrated gate:

```bash
npm ci
npm run verify:full
git diff --check
```

Record the candidate SHA, CI run URLs, command exit codes, and the generated
bundle/security summaries. Local success is not hosted evidence.

If staging is new, first bring it to the `origin/main` migration baseline from a
separate clean baseline worktree, then add synthetic fixtures. The candidate
rehearsal should begin with remote migrations applied through
`20260720132000_harden_function_privileges.sql` and the six candidate
migrations pending. A fresh all-migrations install is useful, but it does not
replace an upgrade rehearsal from the current production baseline.

## Rollout order

The preferred release shape is expand, application, then contract. The current
candidate is not a pure expand bundle:

- `20260722140000`, `20260722200000`, `20260722220000`, and
  `20260723100000` document or add schema/RPC capabilities.
- `20260722210000` also tightens authenticated table privileges.
- `20260730140000` expands the Evidence write capability, but becomes a contract
  migration as soon as a v2 value exists: direct v2 mutation and v2-to-v1
  replacement are then rejected.
- Timestamp ordering places that contract migration inside the same database
  push as later expansions.

For staging, apply the exact six-migration bundle and immediately run the
current-main compatibility checkpoint before deploying the candidate
application. Before production, either retain evidence that the currently
deployed application passes that checkpoint or move the privilege tightening
to a separately reviewed later forward migration. Never edit a migration that
has already run in a hosted project.

The staging sequence is:

1. Capture rollback evidence and take or verify a staging database backup.
2. Preflight and apply the exact six database migrations.
3. Exercise the still-deployed current-main application against the expanded
   database.
4. Set staging Edge secrets and deploy all six Edge Functions.
5. Configure and verify the bounded account-cleanup scheduler.
6. Deploy the exact candidate application to the stable staging origin.
7. Run the full hosted smoke matrix.
8. Observe staging, record evidence, and only then prepare a separate production
   decision.

### 1. Capture the before state

Record, without secret values:

- staging project ref, name, region, and health;
- remote migration list;
- Edge Function names, versions, status, and `verify_jwt`;
- Edge secret names and update timestamps;
- Auth Site URL and redirect allowlist;
- active scheduler job name, cadence, and owner;
- current Pages deployment ID, SHA, URL, and environment bindings.

Do not capture database connection strings, API keys, OAuth values, scheduler
headers, private URLs, user emails, or provider response bodies.

### 2. Preflight and apply migrations

Before the dry run, query staging for managed cover paths that would stop
`20260722200000`:

```sql
select count(*) as invalid_cover_count
from public.records
where cover_storage_path is not null
  and cover_storage_path !~ (
    '^'
    || user_id::text
    || '/'
    || id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
  );
```

The count must be zero. Reconcile only the exact synthetic staging rows if it is
not; do not weaken or bypass the migration.

Also confirm the new objects do not already exist outside migration history:

```sql
select
  to_regclass('public.track_enrichment_batch_receipts') is null
    as receipt_table_absent,
  to_regprocedure('public.persist_track_enrichment_batch(uuid,text,jsonb)')
    is null as batch_rpc_absent,
  to_regprocedure('public.read_library_snapshot()') is null
    as snapshot_rpc_absent;
```

Then verify the dry run names exactly the six expected migrations:

```bash
npx --no-install supabase migration list --linked
npx --no-install supabase db push --dry-run --linked
```

Stop if the remote history has a remote-only entry, a missing baseline entry, or
any migration other than the six expected candidates. During the authorized
staging change window:

```bash
npx --no-install supabase db push --linked
npx --no-install supabase migration list --linked
```

Post-migration checks must confirm:

- all six versions are present remotely;
- the cover ownership constraint is valid;
- `authenticated` cannot directly delete records or write crate membership;
- `authenticated` can execute the crate, enrichment-batch, and coherent
  snapshot RPCs;
- `service_role` alone can execute account-cover cleanup service RPCs;
- the receipt table has RLS enabled and no browser table grants;
- `track_evidence_rpc_write_guards` has RLS enabled, has no `anon` or
  `authenticated` table grants, and is empty after successful and rejected
  Evidence RPC attempts;
- the renamed internal Evidence implementation has no API-role execute grant;
- the stable Evidence RPC has only the intended execute grants; and
- the Evidence validation and RPC-write guard triggers are enabled.

Do not use a down migration as rollback. A migration failure or incompatible
contract requires a forward fix or staging restore.

### 3. Current-main compatibility checkpoint

Before deploying candidate frontend assets, use the still-deployed current-main
staging application and a synthetic account to:

- sign in and load records, tracks, crates, sets, and settings;
- create and edit a crate;
- add and remove a record through the membership RPC;
- remove a record from the collection and verify crate references disappear;
- save and reload a set.

Stop if current main fails after the database push. Do not deploy the candidate
application merely to hide a mixed-version incompatibility; split or forward-fix
the contract change first. This checkpoint is valid only before any v2 Evidence
has been written: current main neither reads nor writes v2 and cannot replace it
with v1.

### 4. Configure and deploy Edge Functions

Prepare an untracked file such as `supabase/functions/.env.staging` containing:

```dotenv
DISCOGS_CONSUMER_KEY=
DISCOGS_CONSUMER_SECRET=
DISCOGS_USER_AGENT=CrateGuide/2.0
DISCOGS_RATE_LIMIT_PER_USER=45
DISCOGS_RATE_LIMIT_GLOBAL=55
DISCOGS_RATE_LIMIT_WINDOW_SECONDS=60
SITE_URL=https://staging.crate.guide
```

The hosted runtime supplies `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and
`SUPABASE_SECRET_KEYS`; do not copy their values into source control or release
evidence.

Review the exact argument array before uploading secrets:

```bash
npm run secrets:staging -- \
	--project-ref="$CRATE_GUIDE_STAGING_REF" \
	--env-file=supabase/functions/.env.staging \
	--dry-run
```

Before separately authorizing the staging secret mutation, prove that every
value being replaced can be recovered from an approved external secret manager.
The Supabase CLI's name/timestamp listing is not value history and is not
rollback material. If recoverable prior values do not exist, stop and establish
them under the approved secret-handling procedure or use a new staging project.
Then repeat without `--dry-run`. List names and update timestamps only.

Deploy every changed function to the explicit staging ref. Do not use `--prune`
and do not rely on the checkout's implicit link:

```bash
npx --no-install supabase functions deploy \
	authenticated-discogs-request \
	get-discogs-request-token \
	get-discogs-access-token \
	cleanup-record-covers \
	cleanup-orphaned-record-covers \
	delete-account \
	--project-ref "$CRATE_GUIDE_STAGING_REF" \
	--no-verify-jwt

npx --no-install supabase functions list \
	--project-ref "$CRATE_GUIDE_STAGING_REF" \
	-o json
```

All six must be `ACTIVE` with `verify_jwt: false`. This is intentional: each
handler verifies its caller internally and supports asymmetric project signing
keys.

Configure hosted Auth directly for staging; do not push the local-only
`supabase/config.toml`. Set the exact staging Site URL and these narrow redirect
patterns:

- `${CRATE_GUIDE_STAGING_URL}/update-password?redirect=**`
- `${CRATE_GUIDE_STAGING_URL}/auth/finalising?redirect=**`

Confirm anonymous sign-in remains disabled. Exercise both password recovery and
the finalising callback before accepting the Auth configuration.

### 5. Configure the account-cleanup scheduler

The repository contains no hosted scheduler definition. The Edge Function alone
does not prove deleted-account cover cleanup will progress.

Record an owner and an approved staging cadence. The scheduler must:

- POST an empty body to
  `${SUPABASE_URL}/functions/v1/cleanup-orphaned-record-covers`;
- source the exact staging secret key from provider-managed Vault or equivalent,
  never plaintext in `cron.job`, logs, or evidence;
- send that key only in the `apikey` header;
- accept no caller-selected user ID or Storage path;
- retain failed/outstanding jobs for retry.

A one-minute staging cadence is suitable for the multi-page smoke. Record only
`jobid`, `jobname`, `schedule`, and `active`; do not select or export the command
text because it may contain credential material. No production cadence is
approved by this runbook.

### 6. Deploy the candidate application

Configure the stable Pages staging environment with:

- Node `24.12.0` and npm `>=11.6.2`;
- build command `npm ci && npm run build`;
- output directory `dist`;
- staging-only `SUPABASE_URL` and `SUPABASE_ANON_KEY`;
- the exact release branch and candidate SHA.

Before deployment, build locally with the same public staging configuration and
run:

```bash
npm run build
npm run check:security-headers
npm run check:client-bundle-budget
```

After deployment, verify the Pages deployment metadata names the exact
candidate SHA and that the stable staging origin resolves to that deployment.
Do not test OAuth against a one-off deployment URL when `SITE_URL` names the
stable staging origin.

## Hosted smoke matrix

Use only synthetic staging accounts. Capture bounded, redacted results.

### Application and database

- Sign up, confirm email, sign in, sign out, and reset a password.
- Load an empty library, then create records, tracks, crates, and sets.
- Exercise record update, cover update/removal, crate membership, record
  removal, bulk cleanup, and reload.
- Apply a reviewed enrichment batch spanning more than 100 tracks so client
  chunking crosses the RPC's 100-item bound. Verify retry idempotency and a
  deliberately stale revision without overwriting newer values.
- Reload through `read_library_snapshot` and confirm records, tracks, crates,
  sets, preferences, and managed-cover resolution are coherent.

### Edge gateway and CORS

For every browser-facing function, verify `OPTIONS` returns the exact
`Access-Control-Allow-Origin` staging origin and expected allow headers. Verify
an unauthenticated normal request is rejected. For
`cleanup-orphaned-record-covers`, also verify:

- a non-POST request returns `405`;
- a POST with a non-empty body returns `400` when authenticated as the service;
- a missing or incorrect `apikey` returns `401`;
- an authorized empty POST returns only bounded `processed` and `complete`
  booleans.

Never place a real key in a shell history, screenshot, or evidence file.

### Discogs acquisition

The existing signed-in Discogs flow does not require a portability or
accountless-mode decision. With a dedicated staging account:

1. Start OAuth and confirm the callback returns to the stable staging origin.
2. Confirm public Discogs identity is published while browser roles cannot read
   `discogs_credentials`.
3. Load folders and import at least two releases.
4. Repeat one import and verify release idempotency rather than a duplicate.
5. Cancel and retry an import run, then reload and inspect the persisted
   credential-free transfer summary.
6. Confirm rate-limit rows advance for the exact user and global buckets without
   recording OAuth or provider bodies.
7. Disconnect and confirm both private credentials and public identity clear.

If `discogs_identity_pending` occurs naturally, exercise the credential-free
`{ "resume": true }` path and confirm the verifier exchange is not repeated. Do
not manufacture a provider outage or exhaust the provider quota merely to force
that branch; record it as not exercised and retain the automated evidence.

### Record-cover and account cleanup

`npm run smoke:account-cleanup` is intentionally loopback-only and must not be
pointed at staging. Use a separately reviewed staging fixture procedure.

First replace and remove ordinary managed covers and confirm
`cleanup-record-covers` drains only the initiating user's durable jobs.

Then use one disposable account with 201 managed WebP objects and one unrelated
control account/object:

1. Reauthenticate within five minutes and submit the exact account email.
2. Confirm Auth deletion succeeds only after the outbox intent exists.
3. Confirm the response reports cleanup queued rather than falsely complete.
4. Observe scheduler-owned batches until the target's `100`, `100`, and `1`
   objects, ordinary queue rows, outbox row, records, and exact per-user Discogs
   quota bucket are absent.
5. Confirm the global quota bucket and unrelated control object remain.

Scope every inspection to the disposable UUID. Do not truncate tables, delete a
Storage prefix broadly, or reuse a real account. Remove any surviving synthetic
fixture through the same scoped operator procedure.

### Browser security and Pages routing

Check both the root and a client-route fallback:

```bash
curl --fail --silent --show-error --head --proto '=https' \
	"$CRATE_GUIDE_STAGING_URL/"
curl --fail --silent --show-error --head --proto '=https' \
	"$CRATE_GUIDE_STAGING_URL/route-that-uses-the-spa-fallback"
```

Both HTML responses must contain:

- enforced
  `content-security-policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`;
- a `content-security-policy-report-only` whose `connect-src` names only the
  staging Supabase HTTP and WebSocket origins;
- `x-frame-options: DENY`;
- `x-content-type-options: nosniff`;
- `referrer-policy: strict-origin-when-cross-origin`;
- the repository permissions policy;
- `strict-transport-security: max-age=86400` without `includeSubDomains` or
  `preload`;
- no `x-powered-by`.

In Chromium, Firefox, and WebKit, exercise authentication, OAuth finalising,
Discogs covers, record-cover previews, local audio Worker/WASM, enrichment, and
legal pages. Record unexpected console, network, CSP report-only, routing, or
asset errors. Do not promote the report-only resource CSP to enforced during
this rollout.

## Observation and release decision

Observe at least:

- Edge error counts and bounded public codes;
- scheduler successes, retries, and remaining outbox depth;
- Discogs `429` and upstream error rates without private bodies;
- database RPC errors, lock waits, and receipt growth;
- Pages Worker errors and CSP reports;
- user-visible failures across the smoke accounts.

The evidence packet must include:

- date, operator, candidate SHA, branch, CI URLs, and Pages deployment ID;
- staging Supabase ref and region;
- migration before/dry-run/after lists;
- Function before/after versions and `verify_jwt` state;
- secret names and update timestamps only;
- Auth URL/redirect configuration;
- scheduler safe metadata and scoped cleanup outcome;
- smoke cases, browsers, expected/actual result, and fixture cleanup;
- header output with request IDs and credential material removed;
- every failure, remediation, rollback action, and remaining limitation;
- the explicit statement `staging evidence only; production unchanged`.

Store a concise, sanitized summary under
`docs/release-evidence/<date>-<short-sha>-staging.md`. Keep raw logs,
screenshots, credentials, emails, private URLs, and provider bodies outside git.

## Rollback

Before mutation, prove that a staging database backup or restore point exists
and record the prior Pages deployment and Function versions. Before the first v2
Evidence write, also prove one of these rollback paths in staging:

- a reviewed application artifact that retains strict v2 reads and does not
  perform unsafe Evidence writes; or
- a rehearsed database restore to the pre-v2 restore point, followed by the
  recorded prior application and Function deployments.

The recorded current-main Pages deployment is not a valid application-only
rollback after a v2 value exists: it treats v2 Evidence as absent, emits v1, and
the forward trigger rejects that downgrade.

If the candidate application fails before any v2 write:

1. Roll Pages back to the recorded staging deployment.
2. Redeploy prior Edge bundles only if they are compatible with the forward
   database schema.
3. Leave successfully applied migrations in place. Do not rewrite history or
   invent a down migration; use a reviewed forward fix or restore staging.
4. Disable a malfunctioning scheduler without deleting its durable outbox rows.
5. Restore prior secret values only from the approved external secret manager;
   do not copy values into evidence.
6. Re-run the current-main compatibility and cleanup-integrity checks.

If any v2 Evidence was written, do not roll Pages back by itself. Put staging in
maintenance and either deploy the proven v2-compatible rollback artifact or
restore the pre-v2 database backup before restoring the prior application and
compatible Edge bundles. Re-run the Evidence read/write guard checks as well as
the compatibility and cleanup-integrity checks.

If the tightened database privileges break the prior application, put staging
in maintenance, preserve evidence, and create a forward compatibility change.
Do not use a production rollout to diagnose a staging failure.
