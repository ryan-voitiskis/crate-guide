# Plan 054: Extract record and cover workflows

> **Executor instructions**: Execute only after Plans 044 and 046 have fixed the
> state ownership this refactor will expose. Characterize behavior first,
> extract cohesive application-owned modules outside generated UI, remove only
> comments made redundant by the new boundaries, and commit conventionally.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 044 and 046
- **Category**: maintainability / file boundaries / comments
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: TODO

## Why this matters

`recordsStore.ts` is 1,121 lines and contains record CRUD/reconciliation plus a
separate cover upload, abort, cleanup, retry, and epoch state machine.
`DialogRecordDetails.vue` is 746 lines and combines dialog/form lifecycle,
record metadata, cover inspection/cropping, and track presentation. Their size
is not itself a defect, but the mixed ownership made the stale-index and dialog
lifecycle defects harder to see.

## Scope

Create application-owned modules/components such as:

- a cover mutation/coordinator module used by `recordsStore.ts`
- `app/components/records/FormRecordCoverEditor.vue` or another type-first,
  behavior-specific wrapper
- focused unit/Nuxt tests for each extracted boundary

Modify:

- `app/stores/recordsStore.ts`
- `app/components/records/DialogRecordDetails.vue`
- `app/utils/recordCover.ts` only if pure image/path behavior belongs there
- related record-cover tests

Do not modify generated `app/components/ui`, database cleanup semantics, signed
URL behavior, crop mathematics, store public behavior, or dialog UX.

## Drift check

```bash
git status --short
wc -l app/stores/recordsStore.ts app/components/records/DialogRecordDetails.vue
rg -n "cover|cleanup|abort|epoch|crop|inspection|updateRecordWithCover" app/stores/recordsStore.ts app/components/records/DialogRecordDetails.vue
```

STOP if Plans 044/046 are not integrated, if characterization exposes another
correctness defect, or if the extraction would require a second source of
record/store state.

## Required implementation

1. Characterize the existing public contract.
   - Cover keep/upload/remove success and failure, abort, replacement-account
     invalidation, cleanup drain, signed preview, crop reset, and dialog close
     behavior must be explicit tests before moves.

2. Extract cover orchestration from record collection ownership.
   - Keep records array, CRUD, account context, and mutation provenance in the
     store.
   - Move cover preprocessing/upload/removal/drain coordination behind a typed
     interface that receives immutable record/account context and returns an
     explicit outcome.
   - Preserve activity/toast ownership at one documented layer; do not duplicate
     feedback in coordinator and store.

3. Extract the record-cover editor wrapper.
   - Own file inspection, crop position, pending removal/upload, preview cleanup,
     and cover-specific controls.
   - The parent continues to own VeeValidate form submission, selected record,
     dialog lifecycle, metadata fields, and track sections.

4. Reduce narration, not rationale.
   - Remove comments that merely label optimistic updates, obvious template
     sections, or adjacent branches after names/boundaries make them clear.
   - Retain comments explaining account ownership, cleanup durability, URL
     revocation, and race prevention.

5. Split the record store tests by public domain while sharing typed fixtures:
   fetch/reconciliation, CRUD, cover workflow, and account lifecycle.

## Test plan

```bash
npm run format
npx vitest run --project unit app/utils/recordCover.test.ts
npx vitest run --project stores app/stores/__tests__/recordsStore*.test.ts
npx vitest run --project nuxt \
  test/nuxt/record-cover.nuxt.test.ts \
  test/nuxt/record-details-cover-editor.nuxt.test.ts
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [ ] Record collection/reconciliation and cover orchestration have distinct owners.
- [ ] The cover editor is an application wrapper with a narrow typed contract.
- [ ] Public behavior, account ownership, cleanup durability, and UX are unchanged.
- [ ] Comments emphasize invariants rather than template/control-flow narration.
- [ ] Tests are split by behavior and all focused/full gates pass.

## STOP conditions

Stop if extraction duplicates mutable state, crosses generated UI boundaries,
changes cover cleanup ordering, or requires widening component props into an
unstructured mirror of the parent.

## Git workflow

- Branch: `codex/054-extract-record-cover-workflows`
- Commit: `refactor(records): extract cover workflows`
