# Plan 012: Move application UI contracts out of generated primitives

> **Executor instructions**: Preserve observable loading, hit-area, and labelled
> divider behavior while returning shadcn-managed primitives to upstream-like
> contracts. Use the rendered harness from Plan 006. Run every gate and stop on
> scope expansion. Update the tracker row when complete unless the reviewer
> owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   app/components/ui/button/Button.vue \
>   app/components/ui/checkbox/Checkbox.vue \
>   app/components/ui/alert-dialog/AlertDialogAction.vue \
>   app/components/shared/ButtonLoading.vue \
>   app/components/shared/AlertDialogActionLoading.vue \
>   app/components/shared/CheckboxLargeHitArea.vue \
>   app/components/shared/SeparatorLabelled.vue \
>   app/pages \
>   app/components \
>   test/nuxt/ui-primitive-extensions.nuxt.test.ts \
>   test/nuxt/ui-application-contracts.nuxt.test.ts
> ```
>
> Run `git status --short`. Plans 006, 007, and 011 must be DONE so the
> primitive-extension tests are green, deleted callers are gone, and both track
> editor files have reached their final script shape before mechanical wrapper
> changes.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 006, Plan 007, and Plan 011
- **Category**: bug
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Application-specific behavior is embedded directly in the shadcn-generated
Button and Checkbox files, where a future component refresh can silently remove
it. That has already happened to Separator: login/signup still pass `label` and
`span-class`, but the current primitive accepts neither and renders no “OR”
label. This plan creates explicit first-party wrappers, restores the broken
divider, and makes generated primitive refreshes safe.

## Current state

- `app/components/ui/separator/Separator.vue:7-28` accepts only reka
  `SeparatorProps` plus class and renders a single self-closing separator.
- `app/pages/login.vue:81` and `signup.vue:68` still render
  `<Separator label="OR" ... span-class="bg-card" />`; Vue ignores those
  undeclared application props and the label is absent.
- Several other pages/components pass `span-class` to an unlabelled Separator;
  that prop is also inert.
- `app/components/ui/button/Button.vue:8-36` adds `loading`, disables the root,
  overlays `SpinnerLoading`, and visually hides slot content.
- `app/components/ui/checkbox/Checkbox.vue:8-39` adds `largeHitArea` and a
  pseudo-element target. The enrichment review table is its only consumer.
- `app/components/ui/alert-dialog/AlertDialogAction.vue:7-33` also embeds the
  spinner/disabled/hidden-label loading contract. Its two consumers are the
  crate-delete and record-remove confirmation alerts.
- `components.json` and `nuxt.config.ts:32-35` identify `app/components/ui` as
  the shadcn component directory. Application ownership must be visible outside
  it.
- Plan 006 has rendered characterization for the Button/Checkbox extensions.

Use explicit first-party component names: `ButtonLoading`,
`AlertDialogActionLoading`, `CheckboxLargeHitArea`, and `SeparatorLabelled`.
Use Tailwind utilities only and no style blocks.

## Commands you will need

| Purpose           | Command                                         | Expected on success |
| ----------------- | ----------------------------------------------- | ------------------- |
| Wrapper tests     | `npm run test:nuxt -- ui-application-contracts` | exit 0              |
| Nuxt tests        | `npm run test:nuxt`                             | exit 0              |
| Full verification | `npm run verify`                                | exit 0              |
| Build             | `npm run build`                                 | exit 0              |
| Format            | `npm run format`                                | exit 0              |

## Scope

**Create**:

- `app/components/shared/ButtonLoading.vue`
- `app/components/shared/AlertDialogActionLoading.vue`
- `app/components/shared/CheckboxLargeHitArea.vue`
- `app/components/shared/SeparatorLabelled.vue`
- `test/nuxt/ui-application-contracts.nuxt.test.ts`

**Restore generated primitives**:

- `app/components/ui/button/Button.vue`
- `app/components/ui/checkbox/Checkbox.vue`
- `app/components/ui/alert-dialog/AlertDialogAction.vue`

**Update current loading-button consumers**:

- `app/pages/reset-password.vue`
- `app/pages/signup.vue`
- `app/pages/update-password.vue`
- `app/pages/login.vue`
- `app/pages/enrichment.vue`
- `app/pages/records.vue`
- `app/components/session/DialogSaveSession.vue`
- `app/components/tracks/DialogTrackDetails.vue`
- `app/components/enrichment/PanelTrackEnrichmentLocalAudio.vue`
- `app/components/shared/DialogAddToCrate.vue`
- `app/components/crates/DialogCrateDetails.vue`
- `app/components/import/DialogCollectionImport.vue`
- `app/components/enrichment/PanelTrackEnrichmentSource.vue`
- `app/components/shared/StateEmptyCollection.vue`
- `app/components/crates/DialogAddRecords.vue`
- `app/components/crates/DialogCrateForm.vue`
- `app/components/records/DialogRecordDetails.vue`
- `app/components/records/DialogRecordCreateManual.vue`
- `app/components/records/DialogTrackEdit.vue`
- `app/components/settings/DialogDiscogsDisconnect.vue`
- `app/components/settings/DetailsDiscogsAuth.vue`
- `app/components/settings/DialogClearAllData.vue`

**Update loading AlertDialogAction consumers**:

- `app/components/crates/AlertConfirmDeleteCrate.vue`
- `app/components/records/AlertConfirmRemoveRecord.vue`

**Update Checkbox/Separator consumers**:

- `app/components/enrichment/TableTrackEnrichmentReview.vue`
- `app/pages/reset-password.vue`
- `app/pages/signup.vue`
- `app/pages/update-password.vue`
- `app/pages/auth/check-inbox.vue`
- `app/pages/login.vue`
- `app/components/records/DialogRecordDetails.vue`
- `test/nuxt/ui-primitive-extensions.nuxt.test.ts` — migrate assertions to the
  wrappers, retaining a standard-primitive sanity check
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Running shadcn generators/upgrades or modifying any other UI primitive.
- Visual redesign, new copy, spinner behavior change, or auth flow change.
- General Button replacement; only current loading consumers switch wrappers.
- Changing checkbox model semantics or enrichment staging behavior.
- Styling/naming cleanup outside these contracts; Plan 015 owns conventions.

## Git workflow

- Branch: `codex/012-protect-ui-contracts`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `fix(ui): protect application component contracts`.
- Do not push or open a PR unless instructed.

## Wrapper contracts

### `ButtonLoading`

- Use a native-button-only contract accepting standard `variant`, `size`, class,
  and disabled behavior plus `loading?: boolean`, defaulting to `false`.
- Explicitly consume and reject unsupported `as`/`asChild` polymorphism so
  legacy attributes cannot leak to the DOM.
- Render the standard Button internally.
- Disable when either caller-disabled or loading; expose `aria-busy`.
- Preserve the current spinner overlay and opacity-hidden slot so width does not
  jump.
- Forward non-contract attributes/events without leaking `loading` to DOM.

### `CheckboxLargeHitArea`

- Render standard Checkbox and forward its model/emits/attributes.
- Apply the existing 40px target and 20px visual-box utility classes in the
  wrapper, not the primitive.
- Do not forward `largeHitArea` because the wrapper represents that contract;
  consume the legacy prop explicitly so it cannot leak.
- Forward a default slot only when the caller supplies one. Otherwise let the
  standard Checkbox render its default check icon.

### `AlertDialogActionLoading`

- Use a native-button-only action contract accepting class, disabled state,
  attributes, events, and `loading?: boolean`, defaulting to `false`.
- Explicitly consume and reject unsupported `as`/`asChild` polymorphism so it
  cannot leak to the DOM.
- Render the standard AlertDialogAction primitive internally, retain its
  `buttonVariants()` styling, and preserve the current relative container.
- Disable while loading, render the same centered spinner, and visually hide
  rather than remove slot content so width does not jump.
- Expose `aria-busy` and do not leak `loading` to the DOM.

### `SeparatorLabelled`

- Render a horizontal divider with visible label text and accessible label.
- Accept class and label-class only if real callers need them; default auth-card
  background should preserve current intended appearance.
- Use standard Separator children or Tailwind border elements without adding
  invalid duplicate separator roles.

## Steps

### Step 1: Write wrapper contract tests against current behavior

Migrate Plan 006 Button/Checkbox extension tests so they define the target
wrapper behavior. Characterize the current AlertDialogAction loading behavior,
then express it against `AlertDialogActionLoading`. Add labelled Separator tests
proving:

- visible “OR” text;
- accessible separator label;
- caller classes applied to container/label only;
- no `label`, `span-class`, `largeHitArea`, or `loading` attribute leaks to DOM.

The target tests may fail until wrappers exist, but no committed intermediate
state may leave the suite red.

### Step 2: Create wrappers before switching callers

Implement all four first-party wrappers with direct imports from their
standard primitive directories. Avoid recursive auto-resolution by importing
the underlying components explicitly.

**Verify**: focused wrapper tests pass while existing callers still use old
contracts.

### Step 3: Switch application callers mechanically

- Replace every `<Button ... :loading>`/loading Button with `ButtonLoading`,
  preserving all other props/events/slot content.
- Replace both loading `<AlertDialogAction>` callers with
  `AlertDialogActionLoading`, preserving confirmation close behavior and all
  other props/events/slot content.
- Replace the two `large-hit-area` Checkbox uses with
  `CheckboxLargeHitArea`.
- Replace labelled auth dividers with `SeparatorLabelled label="OR"`.
- Remove inert `span-class` from ordinary unlabelled Separators; leave them as
  standard Separator.

Use `rg` before and after so no caller is missed.

**Verify**:

```bash
rg -n -U --pcre2 '(?s)<(Button|AlertDialogAction)\b(?:(?!>).)*:loading=' app --glob '*.vue'
rg -n "large-hit-area|span-class|<Separator label=" app --glob '*.vue'
```

Expected: no matches. Wrapper files use their own internal `loading` API and
may be excluded from the search if needed.

### Step 4: Restore Button, Checkbox, and AlertDialogAction primitives

Remove application props/markup/classes from the three generated primitives so
their contracts match the standard reka/shadcn shapes already used by
Separator. Preserve standard `buttonVariants()` styling on AlertDialogAction;
do not rewrite variants or unrelated upstream classes.

**Verify**:

```bash
rg -n "loading|largeHitArea" app/components/ui/button app/components/ui/checkbox app/components/ui/alert-dialog/AlertDialogAction.vue
```

Expected: no matches; standard primitive tests and wrapper tests pass.

### Step 5: Browser-check the repaired contract

Using the local app/browser:

- login and signup visibly show “OR” between OAuth and email sections;
- loading auth/action buttons retain size, show spinner, disable interaction,
  and hide label without layout shift;
- enrichment row/bulk checkbox targets remain easy to click at narrow and wide
  viewports;
- browser console has no extraneous-prop warnings.

Do not use real credentials; rendered state or existing local test fixtures are
sufficient. If an authenticated view is unavailable, report that browser QA as
pending rather than manufacturing user data.

### Step 6: Run all gates

Run `npm run format`, `npm run test:nuxt`, `npm run verify`, and
`npm run build`.

**Verify**: all exit 0; only declared wrappers/primitives/callers/tests and
tracker status changed.

## Test plan

- Wrapper tests assert semantic disabled/aria/slot/event behavior, alert action
  closure, and target sizing—not full class snapshots.
- Auth separator test must fail if the “OR” text disappears again.
- Existing enrichment staging tests remain green after checkbox replacement.
- Browser QA covers loading and divider contracts in actual rendered pages.

## Completion and reconciliation

- Implemented by amended commit
  `6b5633b101cbf1fc84d2f19f25e833c21f6b8c12`, integrated as
  `5bb1fcb60c82dcaddc41e3fd6c8529b13ebbed4d`. The diff is exactly
  35 files: 4 first-party wrappers, 3 restored generated primitives, 26
  mechanically migrated callers, and 2 rendered test files.
- `ButtonLoading` and `AlertDialogActionLoading` are intentionally
  native-button-only. Both consume/reject `as` and `asChild`; no current loading
  caller requires polymorphism. `CheckboxLargeHitArea` conditionally forwards a
  caller slot and otherwise preserves the standard primitive's default check
  icon.
- Rendered contracts explicitly prove that `loading`, `largeHitArea`,
  `large-hit-area`, `label`, `label-class`, and legacy `span-class` attributes
  do not leak. Mechanical searches confirm no standard Button/Alert action with
  `:loading`, no `large-hit-area`, no `span-class`, and no labelled standard
  Separator caller remains.
- The executor's 8 rendered application-contract tests passed. Independent cold
  review approved the implementation, and a separate cold focused run reported
  all 10 application-plus-primitive contract tests passing.
- Main verification passed 38 files / 917 application tests, 2 E2E tests, 4
  Edge tests, 6 type-generation tests, and 7 audio-configuration tests; the
  production build was green.
- In-app browser QA against the local app verified `/login` and `/signup` at
  1280×900 and 390×844. Each page had exactly one visible accessible separator
  named “OR”, with the centered/card-background mask visually correct and no
  console warnings or errors.
- `/enrichment` redirected the unauthenticated browser to `/login`.
  Authenticated loading-button, checkbox, and dialog states are therefore
  explicitly pending under Step 5's authenticated-unavailable allowance rather
  than being fabricated; their contracts are covered by rendered tests.

## Done criteria

- [x] Login/signup “OR” labels render visibly and accessibly.
- [x] Loading and large-hit-area behavior lives in explicit first-party wrappers
      outside `components/ui`.
- [x] Generated Button/Checkbox/AlertDialogAction contain no
      application-specific props.
- [x] No inert `label`, `span-class`, or `large-hit-area` caller remains.
- [x] All loading callers use `ButtonLoading` or
      `AlertDialogActionLoading` without behavior/layout change.
- [x] Nuxt/full tests and build pass; available unauthenticated browser QA has
      no console warnings, while authenticated states are explicitly pending
      under Step 5's allowance and covered by rendered tests.
- [x] No unrelated primitive, UX, or out-of-scope file changed.

## STOP conditions

Stop and report if:

- A wrapper cannot preserve standard Button/Checkbox v-model/event semantics.
- A loading caller relies on undocumented primitive behavior not captured here.
- Labelled divider restoration requires changing auth flow/layout beyond the
  divider itself.
- Generated primitive restoration would require running an upgrade generator
  or altering unrelated variants.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Future shadcn refreshes may overwrite `components/ui` but must not touch
  first-party wrappers or their contract tests.
- Keep loading wrappers native-button-only unless a concrete caller requires a
  separately designed and tested polymorphic loading contract.
- Preserve conditional Checkbox slot forwarding so the primitive's default
  check icon remains available.
- New application-specific primitive behavior belongs in a named wrapper, not
  the generated file.
