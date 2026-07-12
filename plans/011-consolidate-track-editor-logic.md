# Plan 011: Consolidate track-editor domain logic and fix duration equality

> **Executor instructions**: Extract shared domain behavior without redesigning
> the two intentionally different dialogs. Run every gate and stop if field
> semantics diverge. Update the tracker row when complete unless the reviewer
> owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   app/utils/trackEditor.ts \
>   app/utils/trackEditor.test.ts \
>   app/components/records/DialogTrackEdit.vue \
>   app/components/tracks/DialogTrackDetails.vue \
>   test/nuxt/track-editors.nuxt.test.ts
> ```
>
> Run `git status --short`. Plans 006 and 007 must be DONE so rendered tests
> exist and the legacy ingestion cleanup has stabilized these files.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 006 and Plan 007
- **Category**: bug
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Two 500-line dialogs duplicate the same schema, defaults, hydration,
normalization, dirty comparison, and update-payload construction. Both dirty
checks parse `mm:ss` into seconds and compare it with a database duration stored
in milliseconds, so an unchanged non-zero duration appears edited. This plan
centralizes the load-bearing domain logic and fixes the false unsaved-change
warning while retaining the dialogs' different add/edit versus read/edit UX.

## Current state

- `DialogTrackEdit.vue:13-54` and `DialogTrackDetails.vue:40-81` duplicate the
  same Zod schema, initial values, and field definitions.
- Both hydrate with `msToMMSS(track.duration)` at
  `DialogTrackEdit.vue:91-107` and `DialogTrackDetails.vue:90-105`.
- Both dirty checks calculate seconds and compare against stored milliseconds:

  <!-- prettier-ignore -->
  ```ts
  formDurationSeconds =
    minutes * 60 +
      seconds(
        // ...
        current.duration || null
      ) !==
    formDurationSeconds
  ```

  See `DialogTrackEdit.vue:137-151` and
  `DialogTrackDetails.vue:123-136`.

- `app/utils/formatting.ts:1-22` proves the canonical storage unit:
  `mmssToMs` multiplies seconds by 1000.
- Save mapping is duplicated at `DialogTrackEdit.vue:175-243` and
  `DialogTrackDetails.vue:168-193`, with small differences in filtering and
  defaulting that should become one explicit contract.
- The templates are not equivalent: one supports add/edit inside record
  details, while the other is a read view that enters edit mode. Do not merge
  their templates in this plan.

Project conventions: pure utilities live under `app/utils` with colocated
`.test.ts`; component names remain type-first; no style changes; run format.

## Commands you will need

| Purpose           | Command                                                       | Expected on success |
| ----------------- | ------------------------------------------------------------- | ------------------- |
| Utility tests     | `npx vitest run --project unit app/utils/trackEditor.test.ts` | exit 0              |
| Rendered tests    | `npm run test:nuxt -- track-editors`                          | exit 0              |
| Full verification | `npm run verify`                                              | exit 0              |
| Build             | `npm run build`                                               | exit 0              |
| Format            | `npm run format`                                              | exit 0              |

## Scope

**In scope**:

- `app/utils/trackEditor.ts` (create)
- `app/utils/trackEditor.test.ts` (create)
- script logic only in `app/components/records/DialogTrackEdit.vue`
- script logic only in `app/components/tracks/DialogTrackDetails.vue`
- `test/nuxt/track-editors.nuxt.test.ts` (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Consolidating or redesigning dialog templates/layout/copy.
- Track stores, database types/schema, VeeValidate/Zod dependencies, artist
  table component, key/BPM validation ranges, or error messages.
- Changing add-vs-edit orchestration stores.
- Cleaning up duplicate success toasts between dialog/store; preserve current
  notification behavior and review it separately if desired.
- Changing array-order equality to set equality; current order remains part of
  the edit state.

## Git workflow

- Branch: `codex/011-consolidate-track-editor-logic`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `fix(tracks): centralize editor normalization`.
- Do not push or open a PR unless instructed.

## Target utility API

`app/utils/trackEditor.ts` should own:

- `trackEditorSchema`;
- `TrackEditorFormValues` inferred from the schema;
- `createTrackEditorInitialValues()` returning a fresh object/array set;
- `trackToEditorValues(track)`;
- `buildTrackEditorPayload(values, artists, extraartists)` returning the common
  persisted fields for create/update;
- `hasTrackEditorChanges(track, values, artists, extraartists)`.

The utility may depend on existing pure formatting/key/validation/type-guard
utilities and shared types. It must not import Pinia, Vue refs, VeeValidate,
toasts, or components.

## Steps

### Step 1: Specify normalization with failing regression tests

Before changing components, add utility tests covering:

- track duration `180000` and form `3:00` are unchanged;
- `key: 0` and `mode: 0` remain valid and unchanged;
- blank optional strings normalize to null;
- BPM, duration, and composite key conversion use existing helpers;
- title/position trimming matches current save behavior;
- invalid artist entries are filtered consistently for both dialogs;
- each scalar, artists, extraartists, and genres can independently make a form
  dirty; equal arrays remain unchanged;
- initial values return fresh arrays on each call;
- schema messages and accepted formats match current behavior.

**Verify**: tests fail only because the new utility is not implemented yet;
after Step 2 they pass.

### Step 2: Implement the pure editor contract

Move the shared schema/default/hydrate/payload/equality behavior into the
utility. Use `mmssToMs(values.duration)` in both payload construction and dirty
comparison so the compared unit is milliseconds. Use explicit nullish checks
for valid zero values.

Do not silently choose one dialog's existing inconsistent fallback. Tests are
the decided contract: optional values use the stricter/common persisted shape,
and valid artists are filtered the same way.

**Verify**: `npx vitest run --project unit app/utils/trackEditor.test.ts` → all
cases pass.

### Step 3: Switch both dialog scripts to the shared utility

Replace duplicate schema/default/hydration/payload/dirty code with utility
calls. Retain component-local refs for artists/extraartists, VeeValidate field
bindings, open/close/edit mode, store calls, toasts, and all template behavior.

After switching, no local `trackSchema`, manual duration parsing, or duplicated
payload object should remain in either component.

**Verify**:

```bash
rg -n "formDurationSeconds|const trackSchema|minutes \* 60 \+ seconds" \
  app/components/records/DialogTrackEdit.vue \
  app/components/tracks/DialogTrackDetails.vue
```

Expected: no matches.

### Step 4: Add rendered regression coverage

Mount each dialog with synthetic track/store state. Cover:

- entering edit mode then closing without changes does not show an unsaved
  warning for a non-zero duration;
- changing only duration does show the warning;
- save payloads from both dialogs normalize the same common fields;
- add mode still supplies record ID and legacy `beatport_data: null` outside the
  shared common payload;
- read-only details mode and add/edit dialog titles/controls remain distinct.

**Verify**: `npm run test:nuxt -- track-editors` → all cases pass.

### Step 5: Run all gates

Run `npm run format`, focused tests, `npm run verify`, and `npm run build`.

**Verify**: all exit 0; only scoped files and tracker status changed.

## Test plan

- Pure tests carry most normalization/equality coverage and should be table
  driven.
- Rendered tests cover the actual close/save integration and intentionally
  different shell behavior.
- Use existing synthetic track fixtures; no Supabase/network access.
- Test key/mode zero and millisecond duration explicitly.

## Done criteria

- [ ] One utility owns schema, defaults, hydration, payload conversion, and
      dirty equality for both editors.
- [ ] An unchanged non-zero duration no longer appears dirty.
- [ ] Key/mode zero and all optional-field semantics are preserved.
- [ ] Both dialogs retain their distinct UI/orchestration and current toasts.
- [ ] Duplicate manual schema/duration/payload logic is absent from dialogs.
- [ ] Pure/rendered/full tests and build pass.
- [ ] No store, schema, template redesign, or out-of-scope file changed.

## STOP conditions

Stop and report if:

- The two editors legitimately require different normalization for the same
  persisted field.
- Extraction requires a store, toast, component, or Vue ref in the utility.
- Fixing equality requires changing the database duration unit.
- Existing validation messages/ranges or visible dialog behavior must change.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- New editable track fields must be added once to the utility contract and
  covered by hydrate/payload/equality tests before either dialog uses them.
- Keep dialog-shell differences explicit instead of forcing a large shared
  template component.
