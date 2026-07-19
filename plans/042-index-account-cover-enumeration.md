# Plan 042: Make account-cover enumeration work-bounded by its UUID prefix

> **Executor instructions**: Execute after Plan 040 in an isolated worktree.
> This is a planner-sensitive service fix: preserve the exact service-only RPC
> and 101-row response contract, use parameterized C-collated range bounds that
> remain indexable under a forced generic plan, restore the displaced wide-tree
> cleanup regression, run database/Edge/full gates, and commit conventionally.
> The reviewer owns the tracker.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: Plans 036 and 040
- **Category**: performance / availability / regression coverage
- **Planned at**: commit `c1d3c7e`, 2026-07-19
- **Completed by**: commit `14808f6` (integrated as `f4cb89c`), 2026-07-19

## Why this matters

Plan 040 bounds each service response to 101 object names, but its
`left(name, length(uuid) + 1) = uuid || '/'` predicate is not indexable. An
independent rollback-contained review with 50,000 cross-account objects and 201
target objects reproduced `Seq Scan -> Sort -> Limit`: 50,000 rows removed by
the filter, 1,569 shared-buffer hits, and 9.044 ms for one 100-object retry.
Repeating that work for every batch makes the service response-bounded but not
work-bounded as the shared private bucket grows.

The installed Storage index is
`idx_objects_bucket_id_name (bucket_id, name COLLATE "C")`. Exact C-collated
bounds `[<uuid>/, <uuid>0)` use that index because `/` and `0` are adjacent in C
ordering. The representative plan became an index-only scan with no sort, nine
buffer hits, and 0.051 ms. A dynamic `LIKE ($1 || '/%')` is not sufficient: it
regressed to a sequential scan under `plan_cache_mode = force_generic_plan`.

The same review found no further Plan 040 correctness or security defect, but
noticed that its deep-path test displaced the earlier 206-object synchronous
full-account chunking regression. Preserve both depth and width coverage.

## Scope

Create:

- `supabase/migrations/20260719131000_index_account_cover_enumeration.sql`

Modify:

- `supabase/tests/account_cover_cleanup_outbox.sql`
- `supabase/functions/_shared/accountCoverCleanup.test.ts`
- `docs/discogs-integration.md` only if needed to keep the implemented
  enumeration description exact

Do not change the RPC signature, grants, HTTP contract, 101-row database bound,
100-object removal batch, confirmation state machine, claim ordering, upload
policy, generated database types, or hosted scheduling boundary.

## Required implementation

1. Replace only the enumeration query in a new forward migration.
   - `CREATE OR REPLACE` the pinned-search-path `SECURITY DEFINER` function with
     the existing UUID argument and one-column return type.
   - Keep `bucket_id = 'record-covers'` and select only `objects.name`.
   - Require `objects.name COLLATE "C" >= target_user_id::TEXT || '/'` and
     `objects.name COLLATE "C" < target_user_id::TEXT || '0'`.
   - Order only by `objects.name COLLATE "C"`; object names are already unique
     within a bucket, so the old `objects.id` sort tie is unnecessary and would
     prevent the covering index order from satisfying the query.
   - Retain `LIMIT 101`, exact service-role execute access, and browser/public
     revocation. Do not create a redundant application-owned Storage index.

2. Make exactness and planner behavior durable.
   - Prove functional neighbors: all target/deep names are inside the half-open
     range, while another UUID, a lookalike prefix, and another bucket are not.
   - Assert the stored function definition contains both C-collated parameter
     bounds, orders by C-collated name only, and retains the fixed limit.
   - Add a rollback-contained representative plan check using a prepared UUID
     parameter with `plan_cache_mode = force_generic_plan`. Seed enough
     cross-account rows for a meaningful plan, analyze the table, and require
     `idx_objects_bucket_id_name` with no sequential scan or explicit sort.
     Keep the fixture deterministic and remove it by transaction rollback.

3. Restore synchronous full-delete width coverage.
   - Keep Plan 040's object-below-eight-folders regression.
   - Add a separate full-account deletion case with at least 206 objects across
     root/nested paths and assert Storage removals are chunked to at most 100
     exact paths while all objects are reached.

## Tests

- target UUID root and deep object names are returned in exact C order;
- adjacent/lookalike UUID prefixes and other buckets return zero rows;
- 201 target rows remain capped at 101 with deterministic continuation;
- forced-generic representative planning uses
  `idx_objects_bucket_id_name`, with no `Seq Scan` or `Sort` node;
- the service Edge state machine retains 100/101/201 progress and malformed-row
  fail-closed behavior;
- synchronous full account deletion removes 206 root/nested objects in batches
  no larger than 100, while the existing depth > 8 case remains green.

## Verification

```bash
npm run format
npm run test:db
npm run check:edge
npm run lint:edge
npm run test:edge
npm run check:database-types
npm run check:discogs-docs
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify:full'
git diff --check
```

Repeat the representative `EXPLAIN (ANALYZE, BUFFERS)` outside pgTAP with
50,000 cross-account and 201 target rows. Record the node, index, removed-row,
buffer, and timing evidence before rolling the fixture back.

## Done criteria

- [ ] Enumeration work follows the target UUID's covering index range.
- [ ] Forced generic planning cannot fall back to bucket-wide scan and sort.
- [ ] The half-open range returns no neighboring prefix or bucket.
- [ ] Service grants, response bounds, and cleanup state machine are unchanged.
- [ ] Both deep and 206-object-wide synchronous deletion regressions pass.
- [ ] SQL, Edge, docs, conventions, full verification, and diff gates pass.

## STOP conditions

Stop if exact UUID-prefix isolation requires caller-supplied text, if the generic
parameter plan still scans/sorts the bucket, if a new Storage index appears
necessary without proving the installed covering index unusable, if role grants
or response shape drift, if another prefix enters the range, or if a required
gate fails twice after one scoped correction.

## Maintenance notes

A returned-row limit is not a work limit. Keep the service query aligned with
the installed `(bucket_id, name COLLATE "C")` index, and test the generic
parameter plan because a superficially equivalent dynamic `LIKE` predicate is
not planner-equivalent.
