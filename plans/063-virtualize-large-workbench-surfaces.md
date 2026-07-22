# Plan 063: Virtualize large workbench surfaces

> **Executor instructions**: Profile the current DOM, scripting, and cover
> requests before choosing a virtualizer. Preserve one responsive semantic tree,
> keyboard behavior, selection, and exact ordering. Application behavior belongs
> in wrappers outside generated `app/components/ui`.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/pages/records.vue app/pages/tracks.vue app/components/crates/DialogAddRecords.vue app/components/import/DialogReleaseImportFilter.vue app/components/records/ImageRecordCover.vue app/composables/useRecordCover.ts package.json`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 044, 052, 053, and 054
- **Category**: performance / UX
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

Records, tracks, crate pickers, and Discogs manifests mount every result. The
records view also keeps mobile and desktop trees mounted through CSS. Every
mounted cover begins URL resolution, multiplying DOM/reactivity and private
cover signing for large collections.

## Current state

- `app/pages/records.vue:304+` loops over every `sortedRecords` item in a
  CSS-hidden desktop tree; a separate mobile tree also exists.
- `app/pages/tracks.vue:367+` loops over every `sortedTrackRows` item.
- `DialogAddRecords.vue:116+` and `DialogReleaseImportFilter.vue:72+` mount every
  candidate card.
- `ImageRecordCover.vue:24-38` immediately calls `getCoverUrl`; the signed URL
  cache in `useRecordCover.ts` holds only 500 entries.
- Global `keepalive` retains visited page trees.

## Commands you will need

| Purpose         | Command                                               | Expected on success                      |
| --------------- | ----------------------------------------------------- | ---------------------------------------- |
| Nuxt tests      | `npm run test:nuxt`                                   | all pass                                 |
| Browser budgets | `npm run test:browser`                                | 1k/10k scenarios meet checked-in budgets |
| Bundle budget   | `npm run build && npm run check:client-bundle-budget` | Plan 053 budget passes                   |
| Full gate       | `npm run verify`                                      | exit 0                                   |

## Scope

**In scope**:

- the four surfaces and cover modules listed in Current state
- application-owned `ListWorkbenchVirtual.vue` / focused composables and tests
- responsive-row wrappers needed to render one tree
- performance fixtures and browser tests
- exact-pinned virtualizer dependency in `package.json`/lock only if profiling
  justifies it and Plan 053's budget accepts it

**Out of scope**: server pagination, removing full store materialization,
disabling global KeepAlive, generated UI primitives, or changing sort/filter
semantics.

## Git workflow

- Branch: `codex/063-virtualize-large-workbench-surfaces`
- Commit: `perf(workbench): virtualize large collections`

## Steps

### Step 1: Add scale characterization and budgets

Create deterministic 1k-record and 10k-track/candidate corpora. In a real
browser record initial render, filter/sort, scroll, breakpoint switch, mounted
row count, long tasks, retained DOM, and signed-cover request count. Before
observing the baseline, check in a maintainer-approved browser/hardware/throttle
protocol, repetitions, p95/time budget, and deterministic maximum-mounted-row
and cover-request caps. Hardware timing may be informational on unsupported CI,
but structural row/request caps remain enforced everywhere.

**Verify**: the current implementation reproduces at least one pre-approved
timing or structural excess. If every pre-approved budget and deterministic cap
already passes, STOP and report before adding a dependency; do not redefine a
budget after seeing the result.

### Step 2: Build one application-owned virtual list contract

Use fixed/measured row heights for compact/comfortable density, overscan, stable
keys, scroll-to-selected, focus restoration, and an accessible total/result
count. The wrapper must expose visible/overscan identity so covers resolve only
for mounted rows. Choose and exact-pin a maintained virtualizer only after
licence, SSR/client, bundle, keyboard, and variable-width behavior are proven.

**Verify**: component tests cover empty, resize, density, reorder, selected row,
keyboard focus, and scroll-anchor cases.

### Step 3: Render one responsive records/tracks tree

Use a reactive breakpoint to mount either compact/mobile or desktop row markup,
not both. Preserve selected entity, scroll anchor, inspector state, double-click,
context actions, headers, and semantic row/button behavior across a switch.
Virtualize the active sorted/filtered list without altering its source array.

**Verify**: records/tracks Nuxt and browser workflows pass at both sides of the
breakpoint, including a live switch.

### Step 4: Virtualize candidate dialogs and covers

Adopt the same primitive for crate-add and Discogs review cards. Preserve
checkbox/select-all semantics over the complete data set, not only visible
rows. Prevent offscreen covers from signing/fetching; cancellation/unmount must
not publish late URLs into recycled rows.

**Verify**: selection counts, search, retry, imported/disabled state, and cover
request budgets pass with 10k candidates.

### Step 5: Re-run performance and bundle gates

Compare checked-in before/after metrics and document the supported budgets.

**Verify**: format, conventions, Nuxt, browser, build budget, and full gate pass.

## Test plan

Include 0, 1, exactly-one-viewport, and 10k rows; fast scroll; sort while
scrolled; deletion; selected-row removal; density/breakpoint changes; keyboard
navigation; screen-reader counts; cover load/error; and KeepAlive reactivation.

## Done criteria

- [ ] Mounted rows/covers remain bounded by viewport plus declared overscan.
- [ ] Only one responsive tree is mounted per surface.
- [ ] Full-list selection, ordering, filtering, and accessibility behavior remain exact.
- [ ] 1k/10k browser and bundle budgets pass with recorded evidence.

## STOP conditions

Stop if profiling is already within the approved budget, if a virtualizer
requires editing generated UI or weakens keyboard semantics, or if list
virtualization changes item identity/ordering.

## Maintenance notes

Plan 075's Evidence lens must reuse this primitive. Server pagination remains a
later architecture decision because sessions/enrichment currently consume the
full local collection.
