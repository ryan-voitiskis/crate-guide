# Plan 015: Make component and Tailwind conventions enforceable

> **Executor instructions**: Migrate current first-party violations, add a
> read-only convention checker, and verify rendered parity. Do not edit
> generated UI or invent exceptions silently. Run every gate and stop on scope
> expansion. Update the tracker when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   package.json \
>   package-lock.json \
>   scripts/check-conventions.mjs \
>   scripts/check-conventions.test.mjs \
>   app/components/import/CardDiscogsRelease.vue \
>   app/components/utils/LogoCrateGuide.vue \
>   app/components/utils/AnimationTick.vue \
>   app/assets/css/main.css \
>   app/components/crates \
>   app/components/session \
>   app/components/turntable/RpmSelect.vue \
>   app/components/turntable/SelectRpm.vue \
>   test/nuxt/DialogCrateForm.nuxt.test.ts \
>   app/pages/index.vue
> ```
>
> Run `git status --short`. Plans 005, 006, 007, 011, 012, and 014 must be DONE
> so formatting, rendered tests, deleted components, editor callers, wrappers,
> and the benchmark script are stable first.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 005, 006, 007, 011, 012, and 014
- **Category**: dx
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The project explicitly requires type-first PascalCase components and Tailwind
utility classes without `<style>` or `@apply`, yet current gates accept three
component SCSS blocks, two `@apply` sites, and several clear type-suffix names.
Sass remains installed only for those violations. This plan migrates the known
surface and adds objective checks so the documented rules stop being
aspirational.

## Current state

- `AGENTS.md:1-4` and identical `CLAUDE.md` declare type-first PascalCase,
  Tailwind-only/no-style/no-apply, auto prefixes, and formatting.
- `eslint.config.mjs:8-18` merely orders style blocks; it does not reject them.
- SCSS blocks exist in:
  - `app/components/import/CardDiscogsRelease.vue:51-120`;
  - `app/components/utils/LogoCrateGuide.vue:24-35`;
  - `app/components/utils/AnimationTick.vue:13-61`.
- `app/assets/css/main.css:143-155` uses `@apply` for base border/outline and
  body colors.
- `sass` is a dev dependency and no standalone `.scss` file exists.
- Clear type-suffix names/callers include `ColorPicker`, `SuggestionCard`,
  `SuggestionList`, `HistoryPanel`, `HistoryTrackCard`, `HistoryRating`,
  `SessionHeaderControls`, and `RpmSelect`. Plan 007 removes the two
  `ImportTrackCard...` files.
- `app/components/ui/**` is generated/managed and must be excluded from custom
  convention checks; Plan 012 has already moved app-specific contracts out.

The checker may enforce mechanically decidable naming, not subjective domain
taxonomy. A small list of common component-kind suffixes is acceptable only to
reject obvious suffix-first inversions; do not maintain a giant list of all
possible first words.

## Commands you will need

| Purpose                    | Command                     | Expected on success                        |
| -------------------------- | --------------------------- | ------------------------------------------ |
| Checker tests              | `npm run test:conventions`  | exit 0                                     |
| Repository convention gate | `npm run check:conventions` | exit 0                                     |
| Format check               | `npm run format:check`      | exit 0                                     |
| Nuxt tests                 | `npm run test:nuxt`         | exit 0                                     |
| Full verification          | `npm run verify`            | exit 0 and includes convention tests/check |
| Build                      | `npm run build`             | exit 0 without Sass                        |

## Scope

**Create**:

- `scripts/check-conventions.mjs`
- `scripts/check-conventions.test.mjs`

**Modify style violations**:

- `app/components/import/CardDiscogsRelease.vue`
- `app/components/utils/LogoCrateGuide.vue`
- `app/components/utils/AnimationTick.vue`
- `app/assets/css/main.css`

**Rename clear component inversions and update callers**:

- `app/components/crates/ColorPicker.vue` → `PickerColor.vue`
- `app/components/session/SuggestionCard.vue` → `CardTrackSuggestion.vue`
- `app/components/session/SuggestionList.vue` → `ListTrackSuggestions.vue`
- `app/components/session/HistoryPanel.vue` → `PanelSessionHistory.vue`
- `app/components/session/HistoryTrackCard.vue` →
  `CardSessionHistoryTrack.vue`
- `app/components/session/HistoryRating.vue` → `RatingSessionHistory.vue`
- `app/components/session/SessionHeaderControls.vue` →
  `HeaderSessionControls.vue`
- `app/components/turntable/RpmSelect.vue` → `SelectRpm.vue`
- all Vue callers of those auto-registered tags

**Tooling**:

- `package.json`
- `package-lock.json`
- `test/nuxt/DialogCrateForm.nuxt.test.ts` only if its component stubs name the
  renamed color picker; otherwise leave it unchanged
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- `app/components/ui/**` generated files.
- Renaming ambiguous domain primitives merely to satisfy taste.
- Visual redesign or animation library/dependency.
- Tailwind/config/version upgrade.
- Changing theme tokens, success semantics, Discogs data, or component public
  props/events.
- Editing agent-guide documentation; Plan 016 records final commands.

## Git workflow

- Branch: `codex/015-enforce-project-conventions`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `refactor(ui): enforce component conventions`.
- Do not push or open a PR unless instructed.

## Objective checker contract

The production checker discovers tracked plus untracked, non-ignored app files
with:

```bash
git ls-files -co --exclude-standard -z -- app
```

Parse the NUL-delimited result, deduplicate it, and discard paths that no longer
exist or are not regular files so unstaged renames include the new path but not
the deleted old path. Export the path evaluator separately so fixture tests do
not depend on the real worktree. Exit non-zero with concise relative paths for:

- any `<style` block in `app/**/*.vue` outside `app/components/ui/**`;
- any `@apply` in `app/**/*.vue` or `app/**/*.css` outside
  `app/components/ui/**`;
- any `app/**/*.scss` file outside `app/components/ui/**`;
- any non-PascalCase filename in `app/components/**/*.vue`, excluding only
  `app/components/ui/**`; route/layout filenames are not naming inputs;
- an obvious suffix-first component kind such as `SuggestionCard` or
  `ColorPicker` when the basename ends with a known kind (`Card`, `List`,
  `Panel`, `Rating`, `Picker`, `Select`, `Header`, etc.) but does not begin with
  a component kind.

Keep the suffix list short and tested. Do not use it to classify domain nouns
such as `Platter`, `Tonearm`, or `Simulator`.

## Steps

### Step 1: Write checker fixture tests

Using Node's built-in test runner and temporary directories, prove the checker:

- accepts compliant PascalCase/Tailwind-only fixtures;
- rejects a style block, `@apply`, `.scss`, lowercase/kebab component filename,
  and clear suffix-first name;
- accepts a type-first equivalent;
- ignores only `app/components/ui/**`, not arbitrary generated-looking paths;
- discovers an untracked non-ignored violation, excludes an ignored file, and
  omits a deleted tracked path in a temporary Git fixture;
- reports relative paths and never rewrites files.

**Verify**: `node --test scripts/check-conventions.test.mjs` → all cases pass.

### Step 2: Migrate component SCSS to utilities

- Convert `CardDiscogsRelease` grid areas, typography, truncation, cover, and
  checkbox alignment to Tailwind utilities. Preserve computed cover image via
  an inline style if needed; no style block.
- Move `LogoCrateGuide` text typography directly onto SVG text elements using
  utilities/arbitrary properties while preserving font, size, anchor, colors,
  and selection behavior.
- Replace the custom drawn/keyframed `AnimationTick` with an equivalent
  Tailwind/tw-animate-css success icon transition, preserving accessible
  success meaning, approximate 56px size, and theme success color. Do not add a
  style exception solely for stroke drawing.
- Replace `@apply` base declarations with equivalent direct CSS declarations
  using existing CSS variables. Global base CSS is allowed; `@apply` is not.

**Verify**:

```bash
rg -n "<style|@apply" app --glob '*.vue' --glob '*.css'
```

Expected: no matches outside generated UI; ideally no matches at all.

### Step 3: Normalize clear type-suffix component names

Perform the exact renames listed in Scope and update every auto-registered tag.
Do not leave compatibility aliases; typecheck/build provide complete caller
discovery. Preserve component props/emits/templates exactly.

**Verify**:

```bash
rg -n "ColorPicker|SuggestionCard|SuggestionList|HistoryPanel|HistoryTrackCard|HistoryRating|SessionHeaderControls|RpmSelect" app test
```

Expected: no matches.

### Step 4: Remove Sass and wire the checker

After confirming no SCSS/style block remains:

- remove `sass` with npm so the lockfile stays consistent;
- add `test:conventions` and `check:conventions` scripts;
- append both to Plan 005's aggregate `verify` command without duplicating
  other gates.

**Verify**:

```bash
rg -n "sass|\.scss" package.json app --glob '!package-lock.json'
npm run test:conventions
npm run check:conventions
```

Expected: first search has no matches; both scripts pass.

### Step 5: Browser-check visual parity

Verify at narrow and wide viewports, light and dark themes where available:

- Discogs release card grid/cover/text/checkbox;
- Crate color picker after rename;
- auth Crate Guide logo typography;
- success tick/animation on the flow that renders it;
- session suggestion/history panels and turntable RPM selector after renames.

Check browser console for unresolved-component warnings. Do not use real
credentials or modify production data. If authenticated/data-dependent surfaces
are unavailable, report them as pending rather than fabricating state, and
retain rendered/typecheck/build evidence for their contracts.

### Step 6: Run all gates

Run `npm run format`, `npm run format:check`, `npm run check:conventions`,
`npm run test:nuxt`, `npm run verify`, and `npm run build`.

**Verify**: all exit 0; only scoped styles/names/callers/scripts/package files
and tracker status changed.

## Test plan

- Checker tests use fixtures and assert diagnostics plus read-only behavior.
- Existing/new Nuxt tests catch unresolved tags and contract changes after
  renames.
- Browser QA is mandatory for reachable style migrations. Authenticated or
  data-dependent surfaces follow Step 5's explicit pending rule and retain
  rendered/typecheck/build coverage.
- Avoid class snapshots; test objective checker behavior and visible semantics.

## Completion and reconciliation

- Implemented from base `56ad8dac56464dfcb9bf8c990abb1e56527fea52`
  by amended commit `b993c38b89d2e7900392b164fc6db8c20bf56475`,
  integrated as `c66baaaf54f3a466a9e8244b883f87e63a123d34`.
- Git recognizes an exact 20-file implementation scope with 8 type-first
  component renames. All callers migrated mechanically and old-name searches
  are empty outside deliberate negative checker fixtures.
- No first-party `<style>` block, `@apply`, or tracked SCSS file remains, and
  the direct Sass dependency is removed. Vite's optional transitive Sass
  package may remain in `package-lock.json`; application code and the production
  build do not consume it.
- Five read-only convention fixtures cover compliant input, grouped style/
  `@apply`/SCSS/naming failures, old/new `Controls` naming regression,
  generated-UI-only exclusion, and Git discovery of tracked plus untracked
  files while ignoring ignored/deleted paths. The checker never rewrites input.
- `test:conventions` and `check:conventions` are wired into `verify`. Focused
  Nuxt coverage passed 37 tests. Full verification passed 39 files / 1012
  application tests, 2 E2E tests, 4 Edge tests, 6 type-generation tests, 7
  audio-configuration tests, and 5 convention tests; the production build was
  green.
- Independent cold review initially caught the missing `Controls` kind and
  regression fixture, then approved the amended commit after both were added.
- `AnimationTick` uses `fill-emerald-600 dark:fill-emerald-500` because the base
  theme defines no `--success` variable and the application already uses the
  emerald success palette. Its explicit `block` utility preserves the former
  scoped `display: block` layout parity.
- In-app browser QA verified `/login` at 1280×900 and 390×844 in explicit light
  and dark modes: the Crate Guide logo used Egyptian505 at 96px with correct
  fills, centering, and no overflow. `/demo` rendered cleanly, and no checked
  page emitted console warnings or errors.
- `/` redirected the unauthenticated browser to `/login`. The Discogs card,
  color picker, success tick, session/history/suggestion/RPM, and other
  data/authenticated surfaces remain explicitly pending rather than fabricated;
  Nuxt tests, typecheck, build, and generated-CSS resolution cover their static
  contracts.

## Done criteria

- [x] No first-party `<style>`, `@apply`, or tracked SCSS remains.
- [x] Direct Sass dependency is removed; Vite's optional transitive lock entry
      remains, and the production build succeeds without application Sass.
- [x] Listed clear type-suffix component names are normalized with no aliases.
- [x] Read-only convention/test scripts pass and are included in `verify`.
- [x] Generated UI is the only explicit checker exclusion.
- [x] Available light/dark responsive browser QA finds no visual or component
      resolution regression; unavailable data/authenticated surfaces are
      explicitly pending and covered by Nuxt/typecheck/build evidence.
- [x] No unrelated rename, design, dependency, or out-of-scope change exists.

## STOP conditions

Stop and report if:

- Animation parity requires retaining a component style block or adding a
  styling dependency; report the visual trade-off for a human decision.
- Removing Sass affects any file beyond the three known component blocks.
- A planned rename has an external/string-based consumer that build/search
  cannot update safely.
- The checker requires a growing domain-prefix allowlist or rewrites files.
- `npm run format` modifies unlisted source files.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Keep semantic type-first review human-readable; automate only the clear
  objective subset to avoid false positives.
- Keep `Controls` in the small component-kind set and retain paired old/new
  regression fixtures when that set changes.
- New animation needs should use existing Tailwind/tw-animate-css utilities or
  an explicitly documented global design-system decision.
