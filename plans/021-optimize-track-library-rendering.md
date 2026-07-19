# Plan 021: Optimize track library rendering

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Run the "Drift check" section first. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md` unless a reviewer
> told you they maintain the index.
>
> **Execution base**: approved Plan 011 commit `cb6f108`. Its complete-library
> pagination and account-generation guards are required behavior, not drift to
> remove.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/010-page-full-library-queries.md`,
  `plans/011-invalidate-stale-account-fetches.md`
- **Category**: performance
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `b9f0cf1` (integrated as `d605d28`), 2026-07-19

## Why this matters

The track library performs repeated linear record lookups while sorting and rendering, mounts both desktop and mobile row trees at the same time, and independently signs the same private cover path for each mounted cover component. The combined cost scales poorly with larger libraries and creates avoidable Supabase Storage requests.

This plan makes local lookups constant-time, renders only the active responsive branch, and shares short-lived signed cover URLs without changing the visible table, inspector behavior, or access controls.

## Current state

`app/pages/tracks.vue` derives sorted tracks and repeatedly calls `getRecordForTrack` from its comparator and template. Both responsive trees are mounted and hidden only with CSS:

```vue
<div class="hidden md:block">
  <!-- desktop rows -->
</div>
<div class="md:hidden">
  <!-- mobile rows -->
</div>
```

`app/stores/recordsStore.ts` and `app/stores/tracksStore.ts` implement ID lookups with `.find()` and multi-ID lookups with `.filter()`/`.includes()`. `app/composables/useRecordCover.ts` calls `createSignedUrl(path, 300)` for each request, while each `ImageRecordCover.vue` instance invokes it independently.

## Proposed design

- Add reactive `Map` indexes in the records and tracks stores and keep them as the single implementation behind ID-based getters.
- Build row view models once in `tracks.vue`, pairing each track with its record before sorting and template rendering.
- Use a dedicated `max-width: 767px` media query and `v-if`/`v-else` so only one responsive row tree is mounted. Keep the existing `max-width: 1279px` inspector behavior separate.
- Add a module-level, identity-aware signed-URL cache with in-flight request coalescing, a 240-second reuse window for 300-second URLs, expired-entry pruning, and a 500-entry bound.
- Cache only successful signed URLs. Never cache failures or external fallback URLs.
- Include the authenticated user identity in the cache key. A URL created for one user must never be returned from another user's key.

## Commands you will need

| Purpose              | Command                                                                                                              | Expected on success                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Store tests          | `npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts` | exit 0; indexed getters remain reactive and ordered as documented |
| Nuxt rendering tests | `npx vitest run --project nuxt test/nuxt/record-cover.nuxt.test.ts test/nuxt/tracks-page-performance.nuxt.test.ts`   | exit 0; responsive mounting and signed-URL cache cases pass       |
| Formatting           | `npm run format`                                                                                                     | exit 0; only in-scope files receive formatting changes            |
| Conventions          | `npm run check:conventions`                                                                                          | exit 0                                                            |
| Full gate            | `npm run verify`                                                                                                     | exit 0                                                            |

## Scope

Modify:

- `app/stores/recordsStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/tracksStore.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/pages/tracks.vue`
- `app/composables/useRecordCover.ts`
- `test/nuxt/record-cover.nuxt.test.ts`

Create:

- `test/nuxt/tracks-page-performance.nuxt.test.ts`

Modify `app/components/images/ImageRecordCover.vue` only if the shared resolver needs an explicit identity or lifecycle input; prefer keeping its public props unchanged.

Do not change:

- table columns, sorting choices, search/filter semantics, or selection behavior
- the 1279px mobile-inspector breakpoint
- cover bucket privacy or URL lifetime on the server
- external cover fallback behavior
- library pagination behavior established by Plan 010
- account-generation fetch invalidation established by Plan 011

## Drift check

Before editing:

```bash
git rev-parse --short HEAD
git status --short
rg -n "getRecordForTrack|sortedTracks|hidden md:block|md:hidden|useMediaQuery" app/pages/tracks.vue
rg -n "getRecordById|getRecordsByIds|getTrackById|getTracksByRecordId|\.find\(|\.filter\(" app/stores/recordsStore.ts app/stores/tracksStore.ts
rg -n "createSignedUrl|getCoverUrl" app/composables/useRecordCover.ts app/components/images/ImageRecordCover.vue
```

Expected:

- The SHA is `cb6f108`, or later drift is reviewed and recorded.
- The page mounts both responsive branches via CSS hiding.
- Store getters scan arrays.
- Cover signing has no shared cache or in-flight coalescing.

STOP if responsive rendering, store indexes, or signed-URL caching has already been materially redesigned. Rebase this plan on the current architecture instead of layering a second cache or index.

## Steps

1. Add reactive store indexes.
   - In `recordsStore`, derive `recordsById: Map<number, RecordDb>` from the records array and use it for `getRecordById`.
   - Implement `getRecordsByIds` by mapping requested IDs through the index, omitting missing IDs and preserving requested order.
   - In `tracksStore`, derive `tracksById` and `tracksByRecordId` maps and use them for the corresponding getters.
   - Do not maintain mutable duplicate indexes manually; computed indexes must rebuild from the source arrays so all existing replacement/reset paths remain correct.

2. Prove index reactivity and ordering.
   - Test initial lookups, missing IDs, array replacement, additions/removals, reset/logout behavior, and multiple tracks per record.
   - Add an explicit `getRecordsByIds` order test because the current filtering implementation follows store order rather than caller order.
   - Check consumers of `getRecordsByIds`; if any intentionally depend on store order, update that consumer explicitly or STOP and preserve the old contract.

3. Create sorted row view models in `tracks.vue`.
   - Pair each filtered track with its record once per computed evaluation.
   - Sort the row objects using the cached record reference.
   - Render from `row.track` and `row.record`; do not call store lookup getters from the comparator or row template.
   - Keep deterministic fallback ordering for missing records.

4. Mount only the active responsive branch.
   - Add `isCompactTable = useMediaQuery('(max-width: 767px)')` or the project-equivalent name.
   - Change the desktop/mobile row wrappers to `v-if="!isCompactTable"` and `v-else`.
   - Remove CSS-only visibility utilities that are no longer needed for those two mutually exclusive trees.
   - Do not reuse the existing 1279px `isMobile` state; it controls a different inspector interaction.

5. Add signed-cover URL reuse to `useRecordCover`.
   - Store successful entries as `{ url, expiresAt, lastUsedAt }` keyed by authenticated user ID plus storage path.
   - Store in-flight promises by the same key so concurrent components await one `createSignedUrl` call.
   - Reuse entries only until 240 seconds after creation, leaving a 60-second safety margin.
   - Remove failed in-flight entries and return the existing external-cover fallback without caching the failure.
   - Prune expired entries on access and evict least-recently-used entries when the cache exceeds 500.
   - Make cache reset/test control available only as a narrowly named exported helper if required by tests.

6. Add rendering and cover-request tests.
   - Mount the page at compact and non-compact media-query states with representative tracks.
   - Assert only the matching row tree and one cover component per row are mounted.
   - Assert sorting produces the same order as before for record and track fields.
   - Request the same storage path concurrently from two cover instances and assert one signing call.
   - Advance fake time beyond 240 seconds and assert a second signing call.
   - Assert different user identities never share a cached URL, failed signing is retried, and the external fallback remains unchanged.

7. Inspect the resulting render path.
   - Ensure templates do not call `getRecordForTrack`.
   - Ensure only one `createSignedUrl` request is possible per identity/path during the reuse window.
   - Keep the cache local to cover resolution rather than adding signed URLs to persisted Pinia state.

## Test plan

Run:

```bash
npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts
npx vitest run --project nuxt test/nuxt/record-cover.nuxt.test.ts test/nuxt/tracks-page-performance.nuxt.test.ts
npm run format
npm run check:conventions
npm run verify
```

Expected:

- Store lookup and reactivity tests pass.
- Both viewport states render exactly one row tree.
- Sorting and interaction behavior remain stable.
- Concurrent duplicate cover requests produce one signing call.
- Expiry, identity isolation, failure retry, and fallback tests pass.
- Formatting, conventions, and full verification pass.

## Git workflow

Use branch:

```text
codex/021-optimize-track-library-rendering
```

Commit with:

```text
perf(tracks): reduce library render work
```

Stage only the files listed in this plan. Do not push or open a pull request unless explicitly requested.

## Done criteria

- ID-based store lookups no longer scan full arrays.
- Each track row resolves its record once per computed evaluation.
- Only one responsive row tree is mounted.
- Successful signed URLs are identity-isolated, coalesced, bounded, and reused for 240 seconds.
- Existing track ordering, filters, inspector behavior, and cover fallbacks are unchanged.
- All targeted and repository verification commands pass.

## STOP conditions

- A consumer requires `getRecordsByIds` to preserve store order and cannot safely migrate.
- Media-query branching changes the inspector breakpoint or creates hydration instability.
- User identity cannot be obtained reliably before signing.
- Cache tests show cross-identity reuse, stale URL reuse, or suppressed retry after failure.
- Sorting/filtering output changes.

If a STOP condition occurs, land independently safe store-index work only if it has its own complete verification and report the blocked rendering/cache portion separately.

## Maintenance notes

- Keep signed URLs out of persisted stores and browser storage.
- If the server URL lifetime changes, keep the client reuse window shorter by a documented safety margin.
- Revisit virtualization only after profiling this indexed, single-tree implementation with a genuinely large library.
