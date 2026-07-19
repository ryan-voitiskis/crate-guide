# Plan 023: Extract shared track editor fields

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Run the "Drift check" section first. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md` unless a reviewer
> told you they maintain the index.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `0a2c57c` (integrated as `331c7e2`), 2026-07-19

## Why this matters

The add/edit dialog and record-details edit mode duplicate the same track field bindings and controls. Validation and payload construction are already centralized, but the repeated field UI can still drift in labels, error visibility, key options, artist handling, and accessibility attributes.

The extraction should centralize only the common edit fields. Dialog lifecycle, submit behavior, modal chrome, record-specific context, read-only details, and add-only inputs belong to their existing parents.

## Current state

Both `app/components/records/DialogTrackEdit.vue` and
`app/components/tracks/DialogTrackDetails.vue` bind the shared editor fields
from `trackEditorSchema`, including title, remix, artist strings, label, catalog
number, year, genre, style, key, and BPM. They also maintain structured artist
and extra-artist values.

`app/utils/trackEditor.ts` already centralizes validation and payload construction. `test/nuxt/track-editors.nuxt.test.ts` verifies unsaved state, normalized payload parity, add-only behavior, and the read-only details shell. Those boundaries should remain intact.

## Proposed component contract

Create `app/components/tracks/FormTrackEditorFields.vue` as a presentational form-context child:

- It obtains `TrackEditorFormValues` through VeeValidate form context and owns the ten common `defineField` bindings, field errors, and their controls.
- It accepts only display/configuration inputs needed by the shared controls, including the record's `KeyFormat` and whether validation errors should be visible.
- It exposes structured artists and extra artists as typed named models so parents retain ownership of their arrays.
- It does not create a form, submit, reset, watch dialog state, construct a payload, call a store, or render action buttons.

The parent dialogs continue to own `useForm`, initialization/reset, dirty/valid state, mode switching, submit/cancel, and all dialog-specific content.

## Commands you will need

| Purpose           | Command                                                                                                           | Expected on success                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Nuxt editor tests | `npx vitest run --project nuxt test/nuxt/FormTrackEditorFields.nuxt.test.ts test/nuxt/track-editors.nuxt.test.ts` | exit 0; field component and both dialog contracts pass                               |
| Formatting        | `npm run format`                                                                                                  | exit 0; only in-scope files receive formatting changes                               |
| Conventions       | `npm run check:conventions`                                                                                       | exit 0                                                                               |
| Full gate         | `npm run verify`                                                                                                  | exit 0                                                                               |
| Duplication check | `rg -n "defineField" app/components/records/DialogTrackEdit.vue app/components/tracks/DialogTrackDetails.vue`     | no common child-owned field bindings remain; any dialog-specific match is documented |

## Scope

Create:

- `app/components/tracks/FormTrackEditorFields.vue`
- `test/nuxt/FormTrackEditorFields.nuxt.test.ts`

Modify:

- `app/components/records/DialogTrackEdit.vue`
- `app/components/tracks/DialogTrackDetails.vue`
- `test/nuxt/track-editors.nuxt.test.ts`

Modify `app/utils/trackEditor.ts` only if a shared exported type is strictly required; do not move dialog behavior into the utility.

Do not change:

- validation schema or messages
- payload normalization
- field names or submitted values
- add-only record selection/legacy import inputs
- read-only track details or Beatport metadata
- modal titles, buttons, close protection, or unsaved-state semantics
- generated components under `app/components/ui`

## Drift check

Before editing:

```bash
git rev-parse --short HEAD
git status --short
rg -n "defineField|artists|extraartists|trackEditorSchema|buildTrackEditorPayload|showValidationErrors" app/components/records/DialogTrackEdit.vue app/components/tracks/DialogTrackDetails.vue app/utils/trackEditor.ts
rg -n "unsaved|normalized|add-only|read-only|payload" test/nuxt/track-editors.nuxt.test.ts
```

Expected:

- The SHA is `99a570f`, or drift is reviewed and recorded.
- Both dialogs still define the same common field controls independently.
- Shared schema/payload behavior and cross-dialog tests remain present.

STOP if the dialogs no longer share the same field set, if VeeValidate form context cannot support descendant field registration in the installed version, or if another extraction has already established a different component boundary.

## Steps

1. Lock down the existing contract.
   - Extend `track-editors.nuxt.test.ts` to assert the exact common field names, normalized payloads from both dialogs, error visibility behavior, key-format options, structured artist ordering, dirty state, and cancel/reset behavior.
   - Keep explicit coverage for add-only controls and read-only details so the extraction cannot absorb them accidentally.

2. Implement `FormTrackEditorFields.vue`.
   - Use `useFormContext<TrackEditorFormValues>()` and define the common fields once.
   - Accept a typed `keyFormat` prop and derive the same key options currently used by both dialogs.
   - Accept a typed `showValidationErrors` prop and preserve when messages become visible.
   - Use named typed models for `artists` and `extraartists` and preserve item order and object shape.
   - Reuse the existing Tailwind-only markup and project UI wrappers; add no `<style>` block or `@apply`.
   - Keep labels, input names, autocomplete behavior, numeric constraints, and accessibility associations unchanged.

3. Replace the common fields in `DialogTrackEdit.vue`.
   - Keep `useForm`, schema, initial values, dirty/valid state, reset, payload construction, store calls, selected record state, and footer actions in the parent.
   - Pass key format, validation visibility, artists, and extra artists to the shared component.
   - Remove duplicate field bindings and error variables that are now owned by the child.

4. Replace only edit-mode fields in `DialogTrackDetails.vue`.
   - Render the shared component inside the existing edit-mode branch.
   - Keep read-only details, enrichment/provider context, mode transitions, submit/cancel, and modal shell in the parent.
   - Remove only bindings and markup made redundant by the shared component.

5. Test the component boundary directly.
   - Mount the shared component in a small VeeValidate form harness.
   - Assert every common control registers once and updates the parent form values.
   - Assert key options follow both supported key formats.
   - Assert validation messages obey the visibility prop.
   - Assert both structured artist models update without mutation/order regressions.
   - Assert the component exposes no submit action and performs no store calls.

6. Re-run cross-dialog behavior tests.
   - Prove the same input yields the same normalized payload from both dialogs.
   - Prove add, edit, dirty, reset, and read-only flows are unchanged.
   - Inspect the final templates to ensure common controls exist only in `FormTrackEditorFields.vue`.

## Test plan

Run:

```bash
npx vitest run --project nuxt test/nuxt/FormTrackEditorFields.nuxt.test.ts test/nuxt/track-editors.nuxt.test.ts
npm run format
npm run check:conventions
npm run verify
rg -n "defineField" app/components/records/DialogTrackEdit.vue app/components/tracks/DialogTrackDetails.vue
```

Expected:

- Component and cross-dialog tests pass.
- Both dialogs submit the same payloads as before.
- Add-only, read-only, dirty, reset, and close-protection behavior remains green.
- The final `rg` finds no common child-owned field bindings in either dialog; any remaining match is documented as dialog-specific.
- Formatting, conventions, and full verification pass.

## Git workflow

Use branch:

```text
codex/023-extract-shared-track-editor-fields
```

Commit with:

```text
refactor(tracks): share editor fields
```

Stage only the files listed in this plan. Do not push or open a pull request unless explicitly requested.

## Done criteria

- Common track editor controls and field bindings have one implementation.
- Parent dialogs retain lifecycle, submission, shell, add-only, and read-only responsibilities.
- Validation, payload, key-format, artist-order, dirty, and reset behavior is unchanged.
- The new component obeys repository naming and Tailwind-only conventions.
- All targeted and repository verification commands pass.

## STOP conditions

- Descendant field registration changes dirty/valid/reset behavior.
- Payload or artist ordering differs between dialogs.
- The extraction requires dialog/store knowledge in the shared component.
- Read-only or add-only behavior becomes coupled to the shared fields.
- Accessibility associations cannot be preserved.

If a STOP condition occurs, keep the new characterization tests, revert the extraction, and report the exact form-context limitation before choosing a composable-based alternative.

## Maintenance notes

- New fields shared by both flows should be added to the schema, payload builder, shared component, and parity tests together.
- Keep dialog-specific controls in their parent even if doing so leaves a small amount of layout repetition.
- Do not move application behavior into generated `app/components/ui` components.
