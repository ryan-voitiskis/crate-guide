# Code quality and performance audit — 18 November 2026

Source baseline: `8ab5f3d` on `main`. This audit follows the [September audit](./codebase-audit-2026-09-07.md), whose correctness findings are resolved. It looked for quality and performance improvements, including larger refactors. Six read-only reviews covered enrichment and Evidence, repositories, client stores, UI and bundle, Supabase and Edge, and tooling and CI. The key claims below were checked against source with greps, a production build, and focused reproductions.

The architecture remains sound; nothing here justifies a framework or state-library change. The cost is concentrated in three places: about 7.5k production lines and 7k test lines that serve deferred Local-library features, deeply reactive library arrays, and unclaimed bundle, database and CI savings.

## Baseline measurements

| Measure                   | Value                                                          |
| ------------------------- | -------------------------------------------------------------- |
| Initial client JavaScript | 977,993 raw / 308,389 gzip bytes (32 chunks)                   |
| Largest ordinary chunk    | `PageTrackEnrichment` 129,903 raw (budget 131,301)             |
| CI `application` job      | about 6:55, of which `npm run verify` is 5:03                  |
| Slowest unit files        | draft codec scale test 40 s; local-audio cache scale test 28 s |

## Defects found

| Finding                                                                 | Evidence                                                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Evidence lens stays stale after single-track edits and enrichment apply | `app/pages/tracks.vue` watches `() => tracks.tracks`; `tracksStore.upsertTrack` assigns by index. Pages are kept alive. |
| Fractional BPM sorts incorrectly                                        | Numeric collation of `String(value)` orders `120.25` after `120.5` (`tracks.vue`, `records.vue`).                       |
| CI dependency audit fails                                               | Seven new node-forge advisories and an unpatched picomatch advisory were not covered by policy.                         |
| Turntable animation runs while the session page is inactive             | `turntable/Platter.vue` stops only on unmount; the page is kept alive.                                                  |
| Crate delete reports success when no row matched                        | `cloudCratesRepository.ts` delete neither scopes by owner nor checks affected rows.                                     |

## Findings by area

### Deferred Local-library code

No route, layout, plugin or component reaches `browserLibraryRepository.ts`, `browserWorkspaceCatalog.ts`, their state/operations/snapshot modules, or the six local-library policy utilities (`localToCloudCopyPolicy`, `workspaceTransitionPolicy`, `workspaceStartupSelection`, `localBackupReminderPolicy`, `localStorageHealthLabels`, `cloudCopyDestination`). Together these are about 5.9k production lines; their tests are about 6k lines. The reachable device-draft path additionally carries about 1.5k unused lines of library codecs, types and storage probes. The IndexedDB name, schema version 2, store and index definitions, migrations, and draft/lease codecs must be preserved.

### Client stores

Tracks and records are deep `ref` arrays. A benchmark using the repository's Vue reactivity at 30k tracks measured about 165 ms to re-derive lookups, filters and sorts after one edit or keystroke, versus about 17 ms with `shallowRef` and replacement writes. Batch updates use repeated linear `findIndex`, inserts re-sort the whole list with a regex-parsing comparator, and the tracks page filters and re-sorts on every keystroke without debounce. Creating one manual record re-downloads every record and track. Eight activity flags and `recordsStore.isSearching` have no application consumer. Fetch, reconcile and keyed-queue scaffolding is duplicated across tracks, records and crates.

### Enrichment and Evidence

Each autosave re-fingerprints all observations and performs about six full validate/serialise passes. Matching yields with `setTimeout(0)` every 20 rows, which browsers clamp to at least 4 ms (two seconds per 10k rows). Review rows and staged sets are deep refs feeding nine filter computeds. The review table renders mobile and desktop layouts together. `useTrackEnrichmentDraftSession.ts` (about 1.5k lines) repeats its persisted-state reset five times and pushes read-only state 15 times; `PageTrackEnrichment.vue` is about 1.2k lines. Canonical JSON is implemented five times and SHA-256 hex three times. The folder-reconnect classifier documented for resumed reviews is implemented but not connected.

### UI and bundle

`DialogsWorkbench` eagerly renders the import and manual-record dialogs on every route; deferring them reduces initial JavaScript to about 734 KB raw (−25%). Track and crate edit dialogs load eagerly with their pages (`/tracks` −12% when deferred). The enforced bundle budget is about 16% above the current measurement. Crate contents are not virtualised. The two track-edit dialogs duplicate their review and submission-ownership logic. `AnimationTick`, `MetricWorkbench` and `PanelWorkbench` are unused.

### Supabase and Edge

The Evidence v2 trigger validates unchanged `audio_features` on every track update. Five indexes are redundant prefixes or unused GIN indexes. RLS on profiles, records, crates and sets evaluates `auth.uid()` per row instead of once per statement. Enrichment receipts retain full request/response payloads and expired rows are pruned only by the same owner's next call. The generated database types are duplicated for Edge although Edge already imports from `shared/`. Six Edge handlers each define their own response helpers.

### Tooling, tests and documentation

Each E2E file performs its own Nuxt build. Two scale tests account for about 70 s of the unit run. `check:tailwind-canonical` recomputes identical candidates. `verify` is a single serial chain and CI repeats some steps. Twenty-eight completed plans remain despite the plan index's pruning rule, and several documents link to another machine's absolute paths.

## Agreed programme

Owner-approved defaults on 18 November 2026: delete the deferred Local-library code behind an archive tag; connect the reconnect classifier; adopt Node 26 LTS; trial TypeScript 7 only within a time box.

| Wave | Scope                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0a   | Patch/minor dependency refresh; remove unused `jsdom`, `@tanstack/vue-table`; resolve audit advisories                               |
| 0b   | Node 26 LTS across `.nvmrc`, engines, workflows and documentation                                                                    |
| 0c   | Major upgrades (Vitest 5, VueUse 15, music-metadata 12, Supabase CLI 3); TypeScript 7 trial                                          |
| 1    | Defects above, deferred dialogs and re-baselined budget, time-budgeted matching yields, dead components and flags                    |
| 2    | Delete the deferred Local-library code, then trim unused declarations in the device-draft path                                       |
| 3    | Immutable entity collections for tracks/records, sort-then-filter, targeted reads instead of full refetches, shared store primitives |
| 4    | Enrichment autosave caching, shallow review state, draft-session and page decomposition, reconnect wiring                            |
| 5    | Database hot-path migration and Edge HTTP/type consolidation                                                                         |
| 6    | Single E2E build, opt-in scale tier, faster checks, parallel CI jobs, documentation pruning                                          |

Each wave is delivered through its own reviewed PR, CI, staging deployment and browser acceptance before production.
