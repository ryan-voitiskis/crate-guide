# Static Analysis Report

**Date:** 2026-01-11
**Branch:** claude-static-analysis-w-ralph

## Summary

Performed static analysis on the Nuxt 4 / Vue 3 / TypeScript codebase. All issues have been resolved.

| Check               | Status            |
| ------------------- | ----------------- |
| `npm run typecheck` | Pass (0 errors)   |
| `npm run lint`      | Pass (0 warnings) |
| `npm run format`    | Pass              |

## Issues Found and Fixed

### TypeScript Errors (17 initial, 0 remaining)

#### 1. Dead Code Removed

- **File:** `app/components/records/AlertUnsavedTrackChanges.vue`
- **Issue:** Component referenced non-existent store methods (`unsavedTrackChanges`, `clearUnsavedChanges`)
- **Fix:** Deleted the file

#### 2. Missing Property in Object Creation

- **File:** `app/components/records/DialogTrackEdit.vue`
- **Issue:** `newTrack` object missing required `beatport_data` property
- **Fix:** Added `beatport_data: null`

#### 3. Null vs Undefined Type Mismatches

- **Files:** `DeckColumn.vue`, `DeckLoadedTrack.vue`, `HistoryTrackCard.vue`, `SuggestionCard.vue`
- **Issue:** `Track | null` not assignable to `Track | undefined`; style object `color: string | null`
- **Fix:** Used nullish coalescing (`?? undefined`) to convert null to undefined

#### 4. Callback Type Mismatches (reka-ui components)

- **Files:** `SessionHeaderControls.vue`, `SelectorTheme.vue`
- **Issue:** ToggleGroup and RadioGroup pass `unknown` to callbacks, not specific types
- **Fix:** Changed callback parameter types to accept `unknown` with proper type guards

#### 5. Watch Syntax Error

- **File:** `app/pages/auth/finalising.vue`
- **Issue:** Watch on potentially null ref without proper getter function
- **Fix:** Changed to watch with getter function: `watch(() => user.supaUser, ...)`

#### 6. Missing Type Definitions

- **File:** `app/stores/beatportStore.ts`
- **Issue:** Referenced `BeatportTrackData` and `BeatportNotFoundMarker` types that weren't defined
- **Fix:** Added local interface definitions for these types

### ESLint Errors (158 initial, 0 remaining)

#### 1. ESLint Configuration Issues

- **File:** `eslint.config.mjs`
- **Issues:**
  - Used `exclude` key instead of `ignores` (flat config)
  - Rule `vue/component-tags-order` renamed to `vue/block-order` in vue-eslint-plugin v10
  - `OLD/` directory not excluded
- **Fix:** Updated config with correct key names and added ignore pattern

#### 2. Unused Error Bindings

- **Files:** Multiple store files (`userStore.ts`, `recordsStore.ts`, `tracksStore.ts`, etc.)
- **Issue:** `catch (error) { }` blocks with unused `error` variable
- **Fix:** Changed to `catch { }` for blocks not using the error, kept `catch (e)` for blocks using `isError(e)`

#### 3. Prop Mutation

- **File:** `app/components/import/CardDiscogsRelease.vue`
- **Issue:** Direct mutation of `selected` prop
- **Fix:** Implemented emit pattern with `@update:selected` event

#### 4. Type Annotations

- **Files:** Various utility files
- **Issue:** Use of `any` type without explicit acknowledgment
- **Fix:** Added `eslint-disable-next-line` comments where `any` is intentionally required (e.g., `sortNum` function for generic object sorting)

## Code Quality Observations

### Positive Patterns

- Consistent use of TypeScript strict mode
- Proper error handling with `isError` type guard
- Vue 3 Composition API used throughout
- Pinia stores follow consistent patterns
- Type-first component naming convention followed

### Pre-existing TODOs (Not Changed)

The following TODOs exist in the codebase and are noted for future work:

- `DialogTrackFilters.vue` - UI refactoring planned
- `DialogRecordDetails.vue` - Alert button color styling
- `keyFunctions.ts` - Organization/refactoring considerations

### No Critical Issues Found

- No security vulnerabilities detected
- No significant code duplication
- No overly complex functions identified
- Error handling is consistent throughout
