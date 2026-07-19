# Plan 010: Load complete libraries beyond the Supabase 1,000-row cap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/config.toml app/stores/recordsStore.ts app/stores/tracksStore.ts app/stores/cratesStore.ts app/stores/sessionStore.ts app/stores/__tests__ app/utils/discogs-database.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `f475c90` (integrated as `f91424d`), 2026-07-19

## Why this matters

Supabase is configured to return at most 1,000 rows, but the records, tracks,
crates, and saved-set stores each issue a single unbounded select. Larger
libraries silently appear complete while data beyond row 1,000 is missing,
which then corrupts filtering, enrichment, session history, and duplicate
detection decisions. The fix must page deterministically and also chunk large
Discogs-ID `IN` filters so URL/query limits do not replace one truncation bug
with another.

## Current state

- `supabase/config.toml:14-16` sets `max_rows = 1000` intentionally.
- `recordsStore.ts:102-124` performs one `records.select('*')`, ordered only by
  `created_at DESC`, then replaces the store.
- `tracksStore.ts:129-154` performs one joined track select and replaces the
  store.
- `cratesStore.ts:24-44` and `sessionStore.ts:424-441` do the same for crates and
  saved sets.
- None of those queries calls `.range(from, to)` or provides an `id` tie-breaker.
- `app/utils/discogs-database.ts:1-20` sends every release ID through one
  `.in('discogs_id', discogsIds)` call.
- Existing store tests mock Supabase query chains in their colocated files;
  preserve their patterns and add `range` support locally rather than replacing
  the shared test framework.
- Keep `max_rows = 1000`; raising it only moves the silent boundary and increases
  payload risk.

## Commands you will need

| Purpose               | Command                                                                                                                                                                                                 | Expected on success |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Pagination unit tests | `npx vitest run --project unit app/utils/supabasePagination.test.ts app/utils/discogs-database.test.ts`                                                                                                 | all pass            |
| Store tests           | `npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts app/stores/__tests__/sessionStore.test.ts` | all pass            |
| Full gate             | `npm run verify`                                                                                                                                                                                        | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/utils/supabasePagination.ts` (create)
- `app/utils/supabasePagination.test.ts` (create)
- `app/utils/discogs-database.ts`
- `app/utils/discogs-database.test.ts` (create)
- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/cratesStore.ts`
- `app/stores/sessionStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `plans/README.md` status row

**Out of scope**:

- `supabase/config.toml`, migrations, RLS, indexes, or generated types
- Cursor/infinite-scroll UX; stores still load the complete owned library
- Changing decode/default behavior or query ownership filters
- Caching, virtualization, or signed-cover optimization; Plan 021 owns rendering
- Account-switch cancellation; Plan 011 owns stale-fetch invalidation

## Git workflow

- Branch: `codex/010-library-pagination`
- Use focused Conventional Commits, for example
  `fix(library): load all Supabase pages`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a pure inclusive-range pagination helper

Create `app/utils/supabasePagination.ts` with a default page size of 1,000 and
an exported helper shaped like:

```ts
export async function fetchAllSupabasePages<T>(
	fetchPage: (
		from: number,
		to: number
	) => Promise<{
		data: T[] | null
		error: unknown | null
	}>,
	pageSize = 1000
): Promise<T[]>
```

Request inclusive ranges `0..999`, `1000..1999`, etc. Append each page in
order. Stop only when a page contains fewer than `pageSize` rows. Throw the
returned error unchanged; reject page sizes that are not positive integers. To
avoid an infinite loop from a broken mock/backend, also reject any page longer
than `pageSize`.

**Verify**: unit tests cover 0, 999, 1000, 1001, and 2000 rows, exact ranges,
error propagation, and invalid page sizes.

### Step 2: Page each full-library store with deterministic order

Replace the single fetch in all four stores with the helper. Each page callback
must rebuild the existing owned query and then add:

```ts
.order('created_at', { ascending: false })
.order('id', { ascending: false })
.range(from, to)
```

Preserve the tracks inner join/owner filter and every row decoder. Commit to
store state only after all pages succeed so a mid-stream error cannot replace a
complete library with a partial one. Preserve existing fetch de-duplication and
loading/error toasts; Plan 011 will add account generations later.

**Verify**: focused store tests simulate 1,001 rows, assert two exact ranges and
both order calls, and assert the final store contains all rows in server order.
A second test per store makes page two fail and confirms prior store state is
unchanged.

### Step 3: Chunk Discogs duplicate-ID queries

In `getExistingDiscogsIds`, deduplicate release IDs first, split them into
chunks of 100, query each chunk, throw if any chunk errors, and union all
non-null returned IDs. Run chunks sequentially to avoid bursty database traffic
and keep deterministic tests. Keep the empty-input fast path.

**Verify**: new `discogs-database.test.ts` cases cover empty input, deduplication,
exact 100/101 boundaries, unioning results, null IDs, and abort-on-first-error.

### Step 4: Run focused and full verification

Update test query builders only as needed to support `.range` and repeated page
responses. Do not weaken assertions that protect ownership filters or decoders.

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project unit app/utils/supabasePagination.test.ts app/utils/discogs-database.test.ts && npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts app/stores/__tests__/sessionStore.test.ts && npm run verify`
-> exit 0.

## Test plan

- Helper tests prove inclusive range math at every boundary.
- Each store gets a >1,000 regression and partial-page failure regression.
- Track tests additionally assert `records!inner(user_id)` and
  `records.user_id` filtering remain intact.
- Discogs duplicate tests prove no `.in()` call receives more than 100 values.
- Existing decode warnings and fetch-promise de-duplication tests remain green.

## Done criteria

- [ ] Records, tracks, crates, and saved sets load every page until a short page.
- [ ] Every paged query uses `created_at DESC, id DESC` and exact inclusive ranges.
- [ ] A later-page error leaves prior store state untouched.
- [ ] Discogs ID lookups are unique, sequential, and at most 100 IDs per query.
- [ ] `max_rows = 1000` remains unchanged.
- [ ] Focused and full tests pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Any table lacks a stable `id` or `created_at` column in generated types.
- PostgREST does not honor the two-order tie-breaker for one of the joined
  queries.
- A store is intentionally server-windowed rather than complete-library state.
- Correct pagination requires a migration or changing `max_rows`.
- Test mocks cannot represent repeated page queries without a shared test-system
  rewrite.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Keep page size at or below the configured PostgREST cap.
- Any new complete-library query should use the shared helper and a unique stable
  sort.
- Plan 011 must preserve these page loops while adding account-generation guards;
  Plans 020-021 rely on complete data.
