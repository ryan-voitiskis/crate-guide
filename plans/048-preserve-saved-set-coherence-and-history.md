# Plan 048: Preserve saved-set coherence and history

> **Executor instructions**: Preserve Plan 043's serialized write and fetch
> ownership. First define the historical-set product contract in tests, then
> make autosaves and library deletion obey it. Keep legacy JSON rows readable
> and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 012 and 043
- **Category**: correctness / persistence / data evolution
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

Successful autosaves select only `id,user_id`, update `activeSetId`, and never
insert or update the corresponding `savedSets` row. The manager can therefore
omit the active autosaved set until another authoritative fetch. Separately,
saved-set entries retain only a `track_id`; deleting a record cascades its
tracks, and historical sets degrade to “Unknown track.”

A played set is history, not a live foreign-key view. This plan preserves a
small immutable display snapshot in each played-track JSON entry while keeping
the live track ID for navigation and compatibility.

## Scope

Modify:

- `shared/types/supabase.ts`
- `app/stores/sessionStore.ts`
- `app/components/session/DialogSetManager.vue`
- the session playback path that creates `PlayedTrackEntry`
- `app/utils/supabaseRows.ts`
- `test/nuxt/set-manager.nuxt.test.ts` or an equivalently focused manager test
- focused decoder, store, and E2E tests
- database column comments/documentation through a forward migration only if
  the JSON contract needs to be recorded at the schema boundary

Do not normalize saved-set entries into a new table, remove legacy sets, or
make record deletion rewrite historical rows.

## Drift check

```bash
git status --short
rg -n "PlayedTrackEntry|played_tracks|executeAutoSave|activeSetId|Unknown track" shared app
rg -n "autosave|legacy|Unknown track|played_tracks" app/**/*.test.ts test
```

STOP if product requirements explicitly say library deletion should erase set
history, or if adding optional snapshot fields cannot remain backward-compatible
with existing JSON.

## Required implementation

1. Define a backward-compatible historical entry.
   - Add immutable display fields sufficient for the manager: track title and
     artist display text, plus record title or position only if the existing UI
     genuinely needs it.
   - Keep new fields optional while decoding legacy entries. Reject malformed
     new values without discarding an otherwise valid legacy entry.
   - Capture the snapshot when a track enters session history; later library
     metadata edits do not rewrite prior sets.

2. Reconcile autosaves exactly like manual saves.
   - Insert/update with `.select()` and decode the complete owned row.
   - Publish the row into `savedSets`, advance save provenance, clear any delete
     tombstone, and preserve the established ordering.
   - A late or stale autosave cannot publish into a replacement account or
     overwrite a newer manual save.

3. Render history from immutable data first.
   - Prefer the saved snapshot. Use the live track only as a legacy enrichment
     fallback, never as the sole source for new entries.
   - A deleted track remains readable but is not navigable as a live library
     item. Mark that distinction accessibly if the manager exposes navigation.

4. Cover evolution and concurrency.
   - An initial autosave appears immediately in the manager without refetch.
   - Autosave update changes the existing row once and keeps provenance.
   - Deleting the underlying record leaves title/artist visible.
   - Legacy ID-only entries use live metadata when available and degrade
     explicitly when unavailable.
   - Malformed/mixed-version JSON reports decode issues without leaking private
     values or discarding unrelated valid entries.

## Test plan

```bash
npm run format
npx vitest run --project unit app/utils/supabaseRows.test.ts
npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts
npx vitest run --project nuxt \
  test/nuxt/session-suggestions.nuxt.test.ts \
  test/nuxt/set-manager.nuxt.test.ts
npx vitest run test/e2e/login-redirect.e2e.test.ts
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [ ] Successful autosaves immediately reconcile a complete owned saved-set row.
- [ ] Saved-set fetch/write provenance remains correct under overlap and account reset.
- [ ] New historical entries remain meaningful after record/track deletion.
- [ ] Legacy JSON remains readable with an explicit unavailable fallback.
- [ ] Decoder, store, UI, E2E, and full gates pass.

## STOP conditions

Stop if immutable snapshots would capture data the privacy model does not
already persist, if legacy decoding becomes destructive, or if autosave
reconciliation bypasses the serialized write queue.

## Git workflow

- Branch: `codex/048-preserve-saved-set-coherence-and-history`
- Commit: `fix(sessions): preserve autosaved set history`
