# Plan 014: Make private record-cover cleanup durable and retryable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/migrations supabase/tests supabase/functions app/stores/recordsStore.ts app/stores/__tests__/recordsStore.test.ts app/composables/useLibraryMutations.ts app/composables/__tests__/useLibraryMutations.test.ts app/composables/useUserData.ts app/composables/__tests__/useUserData.test.ts shared/types/database.ts supabase/functions/_shared/types/database.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/001-add-database-test-gate.md`, `plans/002-enforce-database-type-parity.md`
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `9c85f73`; independently reviewed integration commit
  `8a02d74`

## Why this matters

Record deletion and cover replacement commit the database mutation first, then
best-effort delete the old private object from the browser. If the tab closes,
network fails, or storage removal is denied after the row disappears, no durable
reference remains and the object is orphaned indefinitely. The database must
atomically enqueue old managed paths, and a user-authenticated service-role Edge
Function must safely drain/retry those jobs without accepting arbitrary paths.

## Current state

- `20260718130000_record_cover_storage.sql:1-62` adds
  `cover_storage_path`, creates a private 2 MiB WebP bucket, and grants owner-only
  select/insert/delete policies.
- `recordsStore.ts:328-389` uploads a new object, commits the record update, then
  calls `removeCoverObjects` for the old path. The warning does not retain a
  retry job.
- `recordsStore.ts:399-446` deletes/removes a row, then tries to remove its old
  cover path.
- `useLibraryMutations.ts:17-30` snapshots cover paths before
  `deleteAllUserData`, then best-effort removes them afterward.
- `recordsStore.test.ts:818-835` currently expects immediate browser storage
  removal after record deletion; those tests need to assert queued drain
  invocation instead.
- `delete-account/handler.ts` separately enumerates and removes the entire user
  cover tree before deleting the auth user. Preserve that final-account cleanup
  and remove now-undrainable queue rows only after its final storage pass.
- Storage object paths are immutable and shaped
  `<user UUID>/<record UUID>/<file>.webp`; the new queue must enforce that shape.

## Commands you will need

| Purpose                | Command                                                                                                                                                                         | Expected on success   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Database tests         | `npm run test:db`                                                                                                                                                               | all pgTAP suites pass |
| Edge gates             | `npm run check:edge && npm run lint:edge && npm run test:edge`                                                                                                                  | exit 0                |
| Store/composable tests | `npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/composables/__tests__/useLibraryMutations.test.ts app/composables/__tests__/useUserData.test.ts` | all pass              |
| Type generation        | `npm run genTypes && npm run check:database-types`                                                                                                                              | exit 0                |
| Full gate              | `npm run verify:full`                                                                                                                                                           | exit 0                |

## Scope

**In scope** (the only files you should modify):

- `supabase/migrations/20260719122000_add_record_cover_cleanup_queue.sql` (create)
- `supabase/tests/record_cover_cleanup_queue.sql` (create)
- `supabase/functions/cleanup-record-covers/index.ts` (create)
- `supabase/functions/cleanup-record-covers/handler.ts` (create)
- `supabase/functions/cleanup-record-covers/handler.test.ts` (create)
- `supabase/functions/cleanup-record-covers/deno.json` (create if required by the existing function pattern)
- `app/stores/recordsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/composables/useLibraryMutations.ts`
- `app/composables/__tests__/useLibraryMutations.test.ts`
- `app/composables/useUserData.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/stores/userStore.ts`
- `app/stores/__tests__/userStore.test.ts`
- `supabase/functions/delete-account/handler.ts`
- `supabase/functions/delete-account/handler.test.ts`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)
- `plans/README.md` status row

**Out of scope**:

- Making the bucket public or broadening authenticated storage policies
- Deleting arbitrary client-supplied paths
- Scheduled/cron infrastructure or hosted deployment
- Rewriting account deletion's full-folder cleanup strategy (the existing
  passes remain; this plan only reconciles their cleanup-queue lifecycle)
- Migrating external Discogs cover URLs into storage
- Final docs; Plan 022 updates the Edge-function inventory

## Git workflow

- Branch: `codex/014-durable-cover-cleanup`
- Use focused Conventional Commits, for example
  `feat(database): queue obsolete record covers` and
  `fix(records): drain cover cleanup jobs safely`.
- Do not deploy, push, or open a PR unless instructed.

## Steps

### Step 1: Add an inaccessible durable cleanup-job table

Create `public.record_cover_cleanup_jobs` with:

- `id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`;
- `user_id UUID NOT NULL` and `record_id UUID NOT NULL`, intentionally without
  foreign keys so jobs survive row/user-data deletion;
- `object_path TEXT NOT NULL UNIQUE`;
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
- `attempt_count INTEGER NOT NULL DEFAULT 0`;
- `last_attempted_at TIMESTAMPTZ`;
- a check that `object_path` starts exactly with
  `user_id::text || '/' || record_id::text || '/'` and ends `.webp`.

Enable RLS with no policies. Revoke all access from PUBLIC, anon, and
authenticated; grant service_role only. Add indexes on `(user_id,id)` and retry
age if needed. Never cascade-delete jobs.

**Verify**: pgTAP proves the table is invisible/inaccessible to browser roles and
service_role can read it.

### Step 2: Queue obsolete paths in the same database transaction

Add a pinned-search-path trigger function on `public.records`:

- on UPDATE, when non-null `OLD.cover_storage_path` is distinct from NEW, insert
  the old path/user/record with `ON CONFLICT (object_path) DO NOTHING`;
- on DELETE, enqueue the non-null old path;
- do nothing for external `cover` URLs, null paths, or unchanged paths;
- return NEW for update and OLD for delete.

Use an `AFTER UPDATE OF cover_storage_path OR DELETE` row trigger so a rolled
back record mutation also rolls back its job. The function must derive all
values from OLD/NEW rows and accept no client arguments.

**Verify**: SQL tests cover replacement, delete, null/unchanged paths,
deduplication, transaction rollback, and job survival after record deletion.

### Step 3: Add a user-authenticated cleanup Edge Function

Follow existing function index/CORS/auth patterns. The handler accepts POST with
no path payload, authenticates the caller, creates a service client, and loads
at most 100 jobs for that verified `user.id`, ordered by `id`.

For every job, validate the exact user/record prefix and `.webp` suffix again.
Discard a structurally invalid/cross-user queue row without passing its path to
Storage, and continue valid jobs later in the same bounded page so a poisoned
head row cannot starve the queue. A failed discard remains retryable.
Query `records.cover_storage_path` to ensure no current row references the path:

- if referenced, delete only the stale job and keep the object;
- if unreferenced, batch-remove paths from `record-covers` (max 100), then delete
  the handled job rows only when the request-level Storage result has no error;
- on a storage/database failure, increment `attempt_count`, set
  `last_attempted_at`, retain jobs, and return controlled 503;
- return counts `{ processed, removed, deferred }`, never paths.

Do not log paths, user IDs, storage errors, or response bodies. Reject non-POST
methods and ignore/reject any request body fields.

Supabase Storage reports one error for the whole `remove` request; an empty
success data array is valid, including for already-missing objects. Treat only
`error === null` as the batch acknowledgement and retain every ambiguous job.

**Verify**: Deno tests cover missing auth, wrong method, no jobs, referenced
path, successful batch, malformed/cross-user job, storage failure retry, partial
database failure, 100-job bound, and path-free responses/logs.

### Step 4: Replace post-commit browser deletion with queue draining

In `recordsStore.ts`, add a single-flight `drainCoverCleanup()` that invokes
`cleanup-record-covers` with no body and returns a boolean. After successful
cover replacement, record deletion, and collection removal, invoke it
best-effort; the domain mutation remains successful if draining fails because
the durable job remains. Show at most the existing generic cleanup warning—no
path/error details.

Keep one immediate direct removal case: if a newly uploaded object exists but
the record update fails, remove that new object because no committed row/trigger
can queue it. Remove the old post-success `removeCoverObjects` calls and stop
exporting generic path deletion if no other safe caller needs it.

**Verify**: record-store tests assert successful mutations invoke the Function
without a path, failure retains mutation success, repeated calls share one
promise, and failed update still removes only its newly uploaded object.

### Step 5: Drain after bulk deletion and account data load

Update `useLibraryMutations.deleteAllUserData` to call
`records.drainCoverCleanup()` after the database delete succeeds and before
clearing local state; remove its captured path list. Update `useUserData` to
start one best-effort drain after the current account's initial library fetches
succeed. Do not block page readiness on cleanup and do not run in demo/signed-out
stores.

**Verify**: composable tests assert no paths are passed, drain ordering is after
delete/after current-account load, failures are non-destructive, and demo/signout
does not invoke it.

### Step 6: Generate types and run all gates

Before type generation, reconcile account deletion with the no-FK queue:

- pgTAP must prove the auth-user cascade can delete records and enqueue jobs
  without browser privileges or a foreign key;
- keep the existing pre-delete and final full-tree Storage passes;
- after auth deletion and a successful final Storage pass, use the service role
  to delete all cleanup jobs for that deleted user;
- if final Storage cleanup fails, retain jobs and report both storage and queue
  cleanup incomplete; if queue deletion alone fails, report account deletion as
  successful but queue cleanup incomplete;
- update `userStore` to interpret either incomplete flag as the existing generic
  cleanup warning, without exposing paths or changing account-deletion success.

Handler and store tests must prove call ordering, both partial outcomes, redacted
responses/logs, and the fully successful state.

Generate both copies from the migrated local database. Inspect generated changes
for only the job table/trigger-visible schema (triggers themselves are not in
types). Do not hand-edit.

**Verify**: `npm run format && npm run genTypes && npm run check:database-types && npm run test:db && npm run check:edge && npm run lint:edge && npm run test:edge && npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/composables/__tests__/useLibraryMutations.test.ts app/composables/__tests__/useUserData.test.ts && npm run verify:full`
-> exit 0.

## Test plan

- pgTAP: queue privileges, trigger cases, rollback, dedupe, and survival.
- Deno: authentication, no client paths, reference recheck, retry retention,
  poisoned-row progress, request-level Storage acknowledgement, bounds, and
  redaction.
- Account deletion: auth cascade, final-tree-cleanup-before-queue-delete,
  partial queue/storage results, and client interpretation.
- Store: post-success drain, upload rollback cleanup, single-flight behavior,
  and no mutation rollback on deferred cleanup.
- Composables: delete-all/load lifecycle and account/demo boundaries.
- Manual local smoke with a disposable user: upload cover, replace it, verify a
  job appears then drains, delete record, and confirm private object becomes
  inaccessible. Never use production data.

## Done criteria

- [ ] Every committed old managed path is atomically queued on replace/delete.
- [ ] Jobs survive deletion and are inaccessible to anon/authenticated roles.
- [ ] Cleanup accepts no client path and rechecks current references.
- [ ] Failed cleanup retains a retryable job with bounded metadata.
- [ ] Browser mutations no longer depend on one post-commit object deletion.
- [ ] Failed record update still cleans its unreferenced new upload.
- [ ] Account deletion's full-tree cleanup remains unchanged.
- [ ] Successful account deletion removes its now-undrainable queue rows only
      after the final full-tree Storage pass; partial states remain truthful.
- [ ] Generated types and database/Edge/store/full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Managed paths do not reliably encode the owning user and record UUIDs.
- A trigger would enqueue external cover URLs or cannot run atomically with row
  changes.
- Cleanup requires granting browser roles access to the job table.
- Supabase Storage cannot report batch success safely enough to avoid deleting a
  failed job; retain all ambiguous jobs and report.
- A current record can legitimately reference another user's object path.
- Generated types include unrelated schema drift.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- A scheduler can drain dormant jobs later, but authenticated load/mutation
  retries are sufficient for this plan and require no hosted infrastructure.
- Reviewers should scrutinize trigger timing, no-FK survival, privilege grants,
  reference recheck, and partial-failure job deletion.
- Plan 022 should document the new cleanup function only after this plan lands.
