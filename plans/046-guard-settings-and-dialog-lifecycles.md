# Plan 046: Guard settings and dialog lifecycles

> **Executor instructions**: Reproduce cold profile hydration and late dialog
> completion with deferred promises before editing. Keep persistence in the user
> store and global dialog ownership in the existing stores; add lifecycle
> guards at their component boundaries and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: frontend correctness / async lifecycle
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

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
- `app/components/records/DialogRecordDetails.vue`
- `app/stores/trackEditStore.ts` and `app/stores/recordDetailsStore.ts` only if
  a shared dialog generation belongs there
- `test/nuxt/settings-controls.nuxt.test.ts` or an equivalently focused real-control test
- focused editor/store tests

Do not change profile defaults, settings database columns, form payloads,
optimistic store behavior, or generated UI components.

## Drift check

```bash
git status --short
rg -n "turntablePitchRange|turntableTheme|updateSettings|isSubmitting|closeTrackDialog|toggleEditMode|selectedRecord" app/components app/stores
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

4. Add lifecycle tests.
   - Mount settings with a null profile, hydrate `16` and `black`, and assert no
     persistence call occurred.
   - Change each value after hydration and assert one exact update.
   - Submit A, dismiss it, open B, then settle A success and failure. B remains
     open, initialized, and in its original mode.

## Test plan

```bash
npm run format
npx vitest run --project nuxt \
  test/nuxt/settings-controls.nuxt.test.ts \
  test/nuxt/settings-page.nuxt.test.ts \
  test/nuxt/track-editors.nuxt.test.ts \
  test/nuxt/record-details-cover-editor.nuxt.test.ts
npx vitest run --project stores \
  app/stores/__tests__/trackEditStore.test.ts \
  app/stores/__tests__/recordDetailsStore.test.ts
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [ ] Cold hydration displays persisted settings without writing defaults.
- [ ] User changes persist exactly once in authenticated mode and remain local in demo mode.
- [ ] Component naming says “finish” consistently.
- [ ] A late submission cannot close, reset, or toggle a newer dialog.
- [ ] Focused Nuxt/store tests and the full gate pass.

## STOP conditions

Stop if hydration cannot be distinguished from user input, if guarding dialog
completion requires weakening unsaved-change protection, or if global dialog
state has another unreviewed writer that makes generation ownership ambiguous.

## Git workflow

- Branch: `codex/046-guard-settings-and-dialog-lifecycles`
- Commit: `fix(ui): guard hydrated settings and dialog completion`
