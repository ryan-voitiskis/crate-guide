# Plan 031: Prevent queued cover paths from becoming current again

> **Executor instructions**: Execute in an isolated worktree. This is a
> database invariant, not a browser-only check. Touch only scoped files, run the
> real pgTAP/type gates, and commit conventionally. The reviewer owns the plan
> index.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: Plans 001, 002, and 014
- **Category**: correctness / concurrency
- **Planned at**: commit `98f0bda`, 2026-07-19
- **Completed by**: commit `41281e4` (integrated as `f399b43`), 2026-07-19

## Why this matters

Cleanup checks that a queued path is not currently referenced, then calls
Storage in a separate transaction. An authenticated owner can set
`cover_storage_path` back to the queued path between those operations. Cleanup
then deletes an object the record now references. The application's UUID upload
behavior treats managed paths as immutable, but the database currently does not
enforce that rule.

Make every queued obsolete path a database tombstone: while its job exists, no
record may attach that path. This closes the dangerous interleaving without
holding a database transaction open across an external Storage request.

## Scope

Create:

- `supabase/migrations/20260719123000_prevent_obsolete_cover_reuse.sql`
- `supabase/tests/record_cover_reuse_guard.sql`

Modify:

- `supabase/tests/record_cover_cleanup_queue.sql` (narrowly reconcile its
  queued-path deduplication fixture with the new no-reuse invariant)

Modify generated type copies only if `genTypes` proves the new trigger function
appears in the public API:

- `shared/types/database.ts`
- `supabase/functions/_shared/types/database.ts`

Do not change Storage policies, make the bucket public, expose the cleanup
queue, or add client-side path checks as the security boundary.

## Required implementation

1. Add a pinned-search-path `SECURITY DEFINER` trigger function that runs before
   INSERT or UPDATE of `records.cover_storage_path`.
   - Null paths and unchanged update paths return normally.
   - If the proposed non-null path exactly matches any cleanup job's
     `object_path`, raise a generic check-violation-style error without including
     the path, user ID, or job metadata.
   - Derive the path only from `NEW`; accept no callable arguments.
   - Revoke direct execution from PUBLIC, anon, authenticated, and service_role.

2. Attach a row trigger to `public.records`.
   - Existing authenticated record policies remain unchanged.
   - The definer function may read the inaccessible queue, but browser roles
     gain no queue/table/function privileges.
   - The existing AFTER trigger still atomically enqueues OLD paths.

3. Prove the concurrency invariant in pgTAP.
   - Create an owned record at path A, change it to B so A is queued, then prove
     an authenticated attempt to set A current again fails, the record remains
     on B, the queue job remains, and its object path is not disclosed by the
     error assertion.
   - Null, unchanged B, and a fresh managed path C remain valid.
   - Metadata-only updates and record/auth cascades are not bricked.
   - Browser roles still cannot read/write the queue or invoke either trigger
     function directly; search paths/security-definer flags are pinned/proven.
   - Once service-role cleanup deletes A's job, setting A is no longer blocked;
     this is safe because cleanup has already completed, though the object may
     be missing. The guard prevents deletion of a newly current existing object,
     not references to known-missing paths after cleanup.

## Verification

```bash
npm run format
npm run test:db
npm run genTypes
npm run check:database-types
npm run check:edge
npm run test:edge
npm run check:conventions
npm run verify:full
git diff --check
```

All commands exit 0. Generated type changes must be absent or limited to the
new database contract and byte-identical across both copies.

## Done criteria

- [ ] A queued path cannot become current during cleanup.
- [ ] Queue privacy and normal authenticated record CRUD remain intact.
- [ ] The existing obsolete-path enqueue trigger still works atomically.
- [ ] Errors contain no path/user/job detail.
- [ ] pgTAP and full gates pass.

## STOP conditions

Stop if a trigger cannot inspect the queue without granting browser access, if
normal record updates or auth cascade deletion are bricked, if enforcing the
rule requires a transaction spanning Storage, if generated types show unrelated
drift, or if a verification gate fails twice.

## Maintenance notes

Any future mechanism that restores/reuses object paths must explicitly clear a
cleanup tombstone only after proving Storage state. Random immutable upload
paths should remain the normal application behavior.
