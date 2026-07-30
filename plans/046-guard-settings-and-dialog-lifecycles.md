# Plan 046: Guard settings and dialog lifecycles

> **Executor instructions**: Reproduce cold profile hydration and late dialog
> completion with deferred promises before editing. Keep persistence in the user
> store and global dialog ownership in the existing stores; add lifecycle
> guards at their component boundaries and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 044
- **Category**: frontend correctness / async lifecycle
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

The pitch-range and turntable-finish controls snapshot `user.profile` before
asynchronous hydration and never resynchronize. A cold settings load can show
defaults and later overwrite the persisted values. Track and record dialogs
also mutate global open/edit state after awaited saves without proving that the
same entity or dialog generation is still active. A late response from dialog A
can therefore close or toggle a newly opened dialog B.

## Scope

Modify or rename:

- `app/components/settings/SelectPitchRange.vue`
- `app/components/settings/SelectorTurntableColor.vue` to
  `app/components/settings/SelectorTurntableFinish.vue`
- `app/pages/settings.vue`
- `app/components/records/DialogTrackEdit.vue`
- `app/components/tracks/DialogTrackDetails.vue`
- `app/components/records/DialogRecordDetails.vue`
- `app/components/records/DialogRecordCreateManual.vue`
- `app/stores/trackEditStore.ts` and `app/stores/recordDetailsStore.ts` only if
  a shared dialog generation belongs there
- `test/nuxt/settings-page.nuxt.test.ts` for the real settings controls
- focused editor/store tests

Do not change profile defaults, settings database columns, form payloads,
optimistic store behavior, or generated UI components.

## Drift check

```bash
git status --short
rg -n "turntablePitchRange|turntableTheme|updateSettings|isSubmitting|closeTrackDialog|toggleEditMode|selectedRecord|showCreateManualDialog|exitEditMode" app/components app/stores
rg -n "SelectPitchRange|SelectorTurntableColor|late|defer|hydration" test app/stores/__tests__
```

STOP if these controls have already adopted a hydration-aware writable value,
or if dialogs cannot distinguish instances without changing unrelated global
navigation state.

## Required implementation

1. Synchronize persisted settings without hydration writes.
   - Derive displayed values from the current hydrated profile while retaining
     a local-only demo value where `localOnly` is true.
   - A profile arriving after mount updates the control but does not call
     `updateSettings` merely because it hydrated.
   - A user change persists exactly once. A later profile refresh reflects the
     authoritative result without creating a write loop.

2. Align names with the product vocabulary.
   - Rename the component from `Color` to `Finish`; keep `turntable_theme` only
     where it is the established storage/domain field.
   - Update auto-registration consumers and tests.

3. Give dialog submissions explicit ownership.
   - Capture the entity ID and a dialog/store generation before submitting.
   - On success, close or toggle edit state only when that same generation and
     entity remain active.
   - A stale success may update the library through its store-owned operation,
     but cannot close another dialog, reset another form, or change its
     submission flag.
   - Either prevent dismissal while submitting or support dismissal safely;
     do not rely on optimistic values making `hasFormChanges()` false.
   - Apply the same rule to `DialogTrackDetails.vue`: a late details save may
     update its submitted track through the store but may exit edit mode only
     for the same still-active track/details generation.
   - Apply it to `DialogRecordCreateManual.vue`: a late successful creation may
     report its result but may close/reset only the same open-generation. If
     the dialog was dismissed and reopened, its new form and open state win.

4. Add lifecycle tests.
   - Mount settings with a null profile, hydrate `16` and `black`, and assert no
     persistence call occurred.
   - Change each value after hydration and assert one exact update.
   - Submit A, dismiss it, open B, then settle A success and failure. B remains
     open, initialized, and in its original mode.
   - Repeat that deferred completion case for the track-details editor and for
     dismiss/reopen of manual record creation. Assert stale completions do not
     clear the new form or submission state.

## Test plan

```bash
npm run format
npx vitest run --project nuxt \
  test/nuxt/settings-page.nuxt.test.ts \
  test/nuxt/track-editors.nuxt.test.ts \
  test/nuxt/record-details-cover-editor.nuxt.test.ts \
  test/nuxt/library-mutation-dialogs.nuxt.test.ts
npx vitest run --project stores \
  app/stores/__tests__/trackEditStore.test.ts \
  app/stores/__tests__/recordDetailsStore.test.ts
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [x] Cold hydration displays persisted settings without writing defaults.
- [x] User changes persist exactly once in authenticated mode and remain local in demo mode.
- [x] Component naming says “finish” consistently.
- [x] A late submission or creation cannot close, reset, or toggle a newer dialog across all four editor/create paths.
- [x] Focused Nuxt/store tests and the full gate pass.

## STOP conditions

Stop if hydration cannot be distinguished from user input, if guarding dialog
completion requires weakening unsaved-change protection, or if global dialog
state has another unreviewed writer that makes generation ownership ambiguous.

## Git workflow

- Branch: `codex/046-guard-settings-and-dialog-lifecycles`
- Commit: `fix(ui): guard hydrated settings and dialog completion`
