# Plan 036: Make library cursor ownership and keys immutable and indexed

> **Executor instructions**: Execute in an isolated worktree before Plan 034.
> This is a database ownership and query contract: preserve track timestamps
> during backfill, make parent ownership declarative, prove browser isolation,
> switch the current fetch to the new direct owner key, inspect representative
> plans without planner overrides, regenerate types, and commit conventionally.
> The reviewer owns the tracker.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001 and 002
- **Category**: database correctness / security / performance
- **Planned at**: commit `c2da28c`, 2026-07-19
- **Redesigned at**: commit `aed26ae`, 2026-07-19, after the original tracks
  index failed its mandatory representative-plan gate
- **Completed by**: commit `a6493a3` (integrated as `639d297`), 2026-07-19

## Why this matters

Plan 034 needs an immutable cursor plus an owner-local ordered access path.
Records, crates, and sets already carry `user_id`; tracks are owned indirectly
through `record_id`. The original proposed `tracks (record_id, id DESC)` index
cannot provide global `track.id DESC` order across many records.

At 12,000 records and 48,000 tracks, the stopped PostgreSQL plan sequentially
scanned all 48,000 tracks before sorting; the authenticated/RLS plan read and
sorted all 4,800 owner tracks through 1,200 parent loops before applying
`LIMIT 1000`. That is a physical ownership-key mismatch, not a planner hint
problem.

Add a parent-enforced immutable `tracks.user_id`, use direct owner RLS, and
traverse the `(user_id, id DESC)` index. Keep ownership metadata inside the
database transport boundary rather than expanding the product `Track` model.

## Scope

Create:

- `supabase/migrations/20260719125000_make_library_cursor_keys_immutable.sql`
- `supabase/tests/library_cursor_keys.sql`

Modify:

- `app/stores/tracksStore.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/utils/supabaseRows.ts`
- `app/utils/supabaseRows.test.ts`
- `shared/types/supabase.ts`
- `shared/types/database.ts` (generated only)
- `supabase/functions/_shared/types/database.ts` (generated only)

Do not modify pagination helpers/other stores (Plan 034), historical migrations,
`max_rows`, import-RPC behavior, record ownership policy, or unrelated domain
models. Keep `idx_tracks_record_id` for record-local lookup and cascade work.

## Required implementation

### 1. Add and backfill direct track ownership without changing history

In one migration transaction:

1. Add nullable `tracks.user_id UUID` with no default.
2. Disable only `tracks_update_updated_at_trigger`, backfill each track from its
   parent `records.user_id`, then re-enable the trigger. The transaction must
   fail if any row remains unmatched; existing `updated_at` values must remain
   byte-for-byte unchanged.
3. Set the column `NOT NULL` with `DEFAULT auth.uid()`. Authenticated direct
   inserts and the existing identity-bound `import_record_with_tracks` RPC may
   omit the column; both must be tested. Non-request service/migration callers
   must provide it explicitly.
4. Add a stable unique constraint on `records (user_id, id)`. It is both the
   composite foreign-key target and the records owner/cursor index (scanned
   backward for descending IDs).
5. Add and validate a composite
   `tracks (user_id, record_id) -> records (user_id, id) ON UPDATE RESTRICT ON
DELETE CASCADE`
   foreign key. Drop the old single-column `tracks_record_id_fkey` in the same
   transaction and give the composite relationship one stable final name.
   Retaining both would make PostgREST embedding ambiguous.

No owner column may be inferred from caller input after insertion. Track
ownership cannot diverge from parent ownership, and changing a record's owner
must fail while children exist rather than silently rewriting immutable track
ownership. Do not add a parent-derivation trigger or redefine the import RPC:
`auth.uid()` reads the authenticated request JWT claim even inside the existing
`SECURITY DEFINER` import. New postgres-role fixtures have no request claim and
must supply `user_id` explicitly.

### 2. Enforce immutable cursor and owner keys

- Add one argument-free trigger function with pinned `search_path` and generic
  SQLSTATE `23514` errors.
- Attach exact `BEFORE UPDATE OF id` row triggers to records, crates, and sets.
- Attach the tracks trigger to `BEFORE UPDATE OF id, user_id`; it rejects either
  field changing while allowing `record_id` to move between records belonging
  to the same owner.
- Revoke direct function execution from PUBLIC, anon, authenticated, and
  service_role. Trigger execution remains available through PostgreSQL.
- Do not rely on generated `Update` types as enforcement.

### 3. Replace indirect tracks RLS and add cursor indexes

- Replace `users_crud_own_record_tracks_policy` with one direct policy whose
  `USING` and `WITH CHECK` are both `(SELECT auth.uid()) = user_id`.
- Preserve existing narrow authenticated CRUD and anonymous denial; grant no
  new table/function privileges.
- Add stable indexes:
  - `tracks (user_id, id DESC)`
  - `crates (user_id, id DESC)`
  - `sets (user_id, id DESC)`
- Use the records `(user_id, id)` unique constraint for record cursor traversal.
  Do not add the rejected `(record_id, id DESC)` cursor index or remove existing
  supporting indexes.

### 4. Adopt the ownership key at the application boundary now

- Change the current full track fetch from `records!inner(user_id)` embedding
  to `.select('*').eq('user_id', resolvedUserId)`, retaining its current offset
  pagination and presentation ordering until Plan 034.
- Before decoding or committing, require every returned row's `user_id` to
  equal the single resolved account ID. A mismatch fails the fetch closed with
  no partial state and no cross-account detail in user-facing errors.
- Add `user_id` to the generated database contract, but omit it from the shared
  product `Track` type. `decodeTrackRow` must explicitly strip the transport
  field rather than leave a hidden runtime property.
- Leave `TrackCreateInput` and import payloads unchanged. `DEFAULT auth.uid()`
  supplies authenticated inserts; decoded create/update/fetch results must not
  expose the owner field in domain rows.

## Tests

### Database and upgrade behavior

Prove with pgTAP and a disposable upgrade smoke:

- pre-existing track owners backfill from their parents and their `updated_at`
  values do not change;
- `tracks.user_id` is non-null with the exact default, all existing rows match
  their parents, and the unique/composite constraints have exact columns and
  cascade semantics;
- exactly one final tracks-to-records foreign key exists;
- the direct policy has equivalent exact `USING`/`WITH CHECK` owner predicates
  and no correlated records subquery;
- an authenticated owner can insert while omitting `user_id`; the existing
  import RPC populates it; postgres-role fixtures explicitly provide it; forged
  owner IDs and cross-owner record IDs fail;
- ID changes on all four tables and track owner changes get only generic
  `23514`; same-owner track movement, ordinary metadata updates, deletes,
  record cascades, and auth-user cascades still work; a parent owner change with
  children is rejected and leaves both parent and tracks unchanged;
- trigger functions are pinned/revoked, triggers are enabled, indexes have exact
  definitions, anonymous users gain nothing, and authenticated CRUD grants stay
  narrow.

### Application boundary

Add focused tests proving:

- every current fetch page uses the same resolved `tracks.user_id` filter and
  no records embedding;
- a mismatched returned owner fails before array replacement;
- fetch/create/update decoding strips `user_id` from domain rows;
- account reset/stale-fetch protection remains intact;
- generated type copies remain byte-identical.

### Representative query plans

Seed disposable data at the stopped scale: 12,000 records, 48,000 tracks, and
4,800 tracks for the target owner. `ANALYZE` all affected tables. Inspect
service-role queries with explicit `user_id` and real authenticated/RLS queries
for first, middle, and tail pages with `LIMIT 1000`.

Accept only plans that, without `enable_seqscan` or other planner overrides:

- use `tracks_user_id_id_desc_idx` with owner and later-page ID conditions;
- have no tracks sequential scan, explicit/incremental sort, records join, or
  correlated parent subplan;
- return at most 1,000 rows with row/buffer work proportional to the page rather
  than all 48,000/global or 4,800/owner tracks;
- allow records to use a backward scan of the `(user_id, id)` unique index;
- use owner/ID access paths for crates and sets.

Record exact `EXPLAIN (ANALYZE, BUFFERS)` evidence and remove all disposable
rows before handoff.

## Verification

```bash
npm run format
npm run test:db
npx vitest run --project unit app/utils/supabaseRows.test.ts
npx vitest run --project stores app/stores/__tests__/tracksStore.test.ts
npm run genTypes
npm run check:database-types
npm run check:edge
npm run check:conventions
npm run verify:full
git diff --check
```

All commands exit 0. Generated type copies are byte-identical after the final
generation pass and contain only this migration plus already integrated schema.

## Done criteria

- [ ] Track ownership is non-null, parent-enforced, immutable, and RLS-scoped.
- [ ] Library UUID IDs cannot move through application-role updates.
- [ ] Existing track timestamps/import/create/update/delete/cascade behavior is
      preserved.
- [ ] Current browser fetch uses direct owner filtering and strips ownership
      metadata from domain rows.
- [ ] First/middle/tail pages use owner-local ID indexes without global scans,
      owner-wide sorts, or parent loops.
- [ ] pgTAP, focused application, type parity, Edge, full verification, and
      diff checks pass.

## STOP conditions

Stop if backfill changes a track timestamp, the two ownership columns can
diverge, PostgREST sees ambiguous record relationships, an application role can
rewrite ID/owner keys or bypass direct RLS, `DEFAULT auth.uid()` breaks an
existing authenticated insert/import path, a representative authenticated plan
does not use the owner/ID index without sorting/parent loops, generated types
show unrelated drift, or a required gate fails twice after one scoped fix.

## Maintenance notes

`tracks.user_id` is deliberate denormalization: the composite foreign key, RLS,
and immutable-owner trigger make it an enforced access key rather than a second
source of truth. Keep it aligned with the parent relationship and Plan 034's
direct owner-filtered cursor whenever track persistence changes.
