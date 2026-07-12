# Plan 010: Restore store state ownership and one-way domain dependencies

> **Executor instructions**: Keep persistence behavior and database RPCs
> unchanged. Move orchestration to the application boundary and make each store
> mutate only its own state. Run every gate and stop on scope expansion. Update
> the tracker row when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   shared/types/options.ts \
>   shared/types/session.ts \
>   shared/types/supabase.ts \
>   app/utils/setTheme.ts \
>   app/utils/trackSuggestions.ts \
>   app/stores/recordsStore.ts \
>   app/stores/tracksStore.ts \
>   app/stores/cratesStore.ts \
>   app/stores/sessionStore.ts \
>   app/stores/userStore.ts \
>   app/composables/useLibraryMutations.ts \
>   app/composables/__tests__/useLibraryMutations.test.ts \
>   app/components/records/AlertConfirmRemoveRecord.vue \
>   app/components/settings/DialogClearAllData.vue \
>   app/stores/__tests__/recordsStore.test.ts \
>   app/stores/__tests__/tracksStore.test.ts \
>   app/stores/__tests__/cratesStore.test.ts \
>   app/stores/__tests__/sessionStore.test.ts \
>   app/stores/__tests__/userStore.test.ts \
>   test/nuxt/library-mutation-dialogs.nuxt.test.ts
> ```
>
> Run `git status --short`. Plans 008 and 009 must be DONE because this plan
> builds on their store contracts and validated persisted session types.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 008 and Plan 009
- **Category**: tech-debt
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Records and user stores currently assign arrays owned by tracks, crates, and
sessions. Those writes bypass store-specific invariants and force future
maintainers to locate every external mutation. Separately, shared domain types
depend upward on a browser utility, while a pure suggestion utility imports a
result type from the store that imports it. This plan restores explicit
ownership and a one-way shared-types → utilities → stores/components direction.

## Current state

- `recordsStore.removeRecordFromCollection` directly assigns
  `tracksStore.tracks` and `cratesStore.crates` at
  `app/stores/recordsStore.ts:308-328` after the atomic RPC succeeds.
- `userStore.deleteAllUserData` instantiates four stores and directly replaces
  crate/set arrays at `app/stores/userStore.ts:286-309`.
- The database cleanup guarantees are already atomic in
  `supabase/migrations/20260309234500_add_cleanup_rpcs.sql`: record removal
  clears crate references before deletion; delete-all clears crate/set
  references and deletes records. Do not edit those RPCs.
- `shared/types/options.ts` currently defines only `TurntableThemeOptions`.
  `ThemeOptions` instead lives in browser utility `app/utils/setTheme.ts:1`,
  and `shared/types/supabase.ts:1` imports upward from that utility.
- `app/utils/trackSuggestions.ts:1` imports `ScoredTrack` from
  `sessionStore.ts`, while `sessionStore.ts:1-3` imports that utility and defines
  `ScoredTrack` at lines 30-36.
- Plan 009 has moved `PlayedTrackEntry` and `SavedSet` into shared persistence
  types; leave them there.

Use a side-effect-free `useLibraryMutations` composable as the application
coordinator. It must not register watchers or run work on construction.

## Commands you will need

| Purpose                 | Command                                                                                                                                                                                                                                                                                              | Expected on success |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Coordinator/store tests | `npx vitest run --project stores app/composables/__tests__/useLibraryMutations.test.ts app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts app/stores/__tests__/sessionStore.test.ts app/stores/__tests__/userStore.test.ts` | exit 0              |
| Suggestion tests        | `npx vitest run --project unit app/utils/trackSuggestions.test.ts`                                                                                                                                                                                                                                   | exit 0              |
| Dialog tests            | `npm run test:nuxt -- library-mutation-dialogs`                                                                                                                                                                                                                                                      | exit 0              |
| Full verification       | `npm run verify`                                                                                                                                                                                                                                                                                     | exit 0              |
| Build                   | `npm run build`                                                                                                                                                                                                                                                                                      | exit 0              |
| Format                  | `npm run format`                                                                                                                                                                                                                                                                                     | exit 0              |

## Scope

**In scope**:

- `shared/types/options.ts`
- `shared/types/session.ts` (create)
- `shared/types/supabase.ts`
- `app/utils/setTheme.ts`
- `app/utils/trackSuggestions.ts`
- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/cratesStore.ts`
- `app/stores/sessionStore.ts`
- `app/stores/userStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `app/stores/__tests__/userStore.test.ts`
- `app/composables/useLibraryMutations.ts` (create)
- `app/composables/__tests__/useLibraryMutations.test.ts` (create)
- `app/components/records/AlertConfirmRemoveRecord.vue`
- `app/components/settings/DialogClearAllData.vue`
- `test/nuxt/library-mutation-dialogs.nuxt.test.ts` (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Supabase cleanup RPCs, migrations, schema, grants, or generated types.
- Read-only store composition such as record-details/filter/suggestion reads.
- Moving every session interface merely because it is in a large store.
- Changing delete confirmation UX, copy, or toast messages.
- Changing what delete-all preserves: crates and sets remain but are emptied.
- A generic event bus, plugin, repository layer, or dependency.

## Git workflow

- Branch: `codex/010-restore-store-ownership`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `refactor(stores): restore state ownership`.
- Do not push or open a PR unless instructed.

## Target application coordinator

Create `useLibraryMutations` with two explicit operations:

1. `removeRecordFromCollection(recordId)` calls the records-store persistence
   action. Only after true does it call track/crate cleanup actions.
2. `deleteAllUserData()` calls the user-store RPC action. Only after true does
   it call store-owned record/track/crate/saved-set/session cleanup actions.

The coordinator returns the underlying boolean and contains no watch, mount,
or bootstrap side effect.

## Steps

### Step 1: Fix type dependency direction

- Add `export type ThemeOptions = 'light' | 'dark' | 'auto'` to
  `shared/types/options.ts`. Remove the original export from
  `app/utils/setTheme.ts` and import the shared type there.
- Change `shared/types/supabase.ts` to import both theme option types from its
  sibling shared module.
- Create `shared/types/session.ts` with `ScoredTrack` and import it from both
  `trackSuggestions.ts` and `sessionStore.ts`; remove the store-local
  definition.
- Do not move Plan 009's persisted set types again.

**Verify**:

```bash
rg -n "from '~/utils/setTheme'|from '~/stores/sessionStore'" shared app/utils
npx vitest run --project unit app/utils/trackSuggestions.test.ts
```

Expected: `rg` has no matches and tests pass.

### Step 2: Add store-owned cleanup actions

Add and test:

- `tracksStore.removeTracksByRecordId(recordId)`;
- `cratesStore.removeRecordFromAllCrates(recordId)`;
- `cratesStore.clearAllCrateRecords()`;
- `sessionStore.clearSavedSetTracks()`.

Each action mutates only its own store, uses immutable array replacement
consistent with current code, and preserves unrelated entries/metadata.
`clearSavedSetTracks` empties each set's `played_tracks` but retains set rows.

**Verify**: focused store tests prove target cleanup and preservation of
unrelated tracks, crate fields/records, and saved-set metadata.

### Step 3: Remove direct foreign-store assignments

In `recordsStore.removeRecordFromCollection`, keep RPC execution and cleanup of
its own `records`/`searchResults`, but remove direct track/crate assignments.
In `userStore.deleteAllUserData`, keep auth, RPC, toast, and boolean result, but
remove all cross-store construction/mutation.

**Verify**:

```bash
rg -n "(tracksStore\.tracks|cratesStore\.crates|crates\.crates|session\.savedSets)\s*=" app/stores
```

Expected: no matches.

### Step 4: Add the application coordinator and switch callers

Implement `useLibraryMutations`, then update:

- `AlertConfirmRemoveRecord.vue` to call coordinator record removal;
- `DialogClearAllData.vue` to call coordinator delete-all.

Tests must prove no dependent cleanup occurs when the RPC action returns false,
and every relevant store action is invoked once after success.

Add rendered tests for both callers and preserve their current asymmetric close
contracts:

- `AlertConfirmRemoveRecord` invokes its coordinator method once and clears
  `recordDetails.recordToRemove` after either a true or false resolved result,
  matching its current `finally` behavior;
- `DialogClearAllData` invokes its coordinator method once, closes after true,
  and stays open after false.

Preserve existing confirmation requirements and visible copy.

**Verify**: coordinator tests and
`npm run test:nuxt -- library-mutation-dialogs` pass.

### Step 5: Run all gates

Run focused tests, `npm run format`, `npm run verify`, and `npm run build`.

**Verify**: all exit 0; direct-assignment/import searches remain empty; only
declared files changed.

## Test plan

- Unit-test each new store action against mixed relevant/unrelated fixtures.
- Coordinator tests use mocked store actions and assert exact call order/no-op
  on false.
- Existing records/user tests should assert their actions no longer construct
  or mutate unrelated stores.
- Rendered dialog tests cover the exact caller-specific close behavior above;
  they do not duplicate database behavior.

## Done criteria

- [ ] No store directly assigns another store's mutable array.
- [ ] Cross-domain deletion cleanup is coordinated by
      `useLibraryMutations` and only occurs after RPC success.
- [ ] Each store exposes tested actions for its own cleanup invariants.
- [ ] Shared types no longer import browser utilities; pure utilities no longer
      import store types.
- [ ] Delete-all still preserves emptied crates/sets and all current UI/toasts.
- [ ] Migrations/RPC behavior remains untouched.
- [ ] Full verification/build pass with no out-of-scope changes.

## STOP conditions

Stop and report if:

- A caller bypasses the coordinator and relies on implicit multi-store cleanup.
- Cleanup RPC behavior no longer matches the cited migration guarantees.
- A new store action would need to mutate another store or persistence layer.
- Type movement expands into unrelated read-only store composition.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Persistence actions should mutate their own store only; application
  coordinators compose cross-domain effects.
- Reviewers should compare local cleanup exactly against the atomic RPC result.
- Keep shared domain types free of Nuxt/browser/store imports.
