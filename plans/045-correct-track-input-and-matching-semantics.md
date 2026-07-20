# Plan 045: Correct track input and matching semantics

> **Executor instructions**: Keep this plan focused on deterministic pure-data
> behavior. Add failing examples first, make one canonical parser or identifier
> own each concept, avoid schema changes, and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: correctness / validation / naming
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

The key filter offers 24 major/minor choices but stores only 12 pitch-class
values, so both modes share Select values and Vue keys and filtering ignores
mode. BPM validation and payload parsing use `parseFloat`, accepting values such
as `128abc` and silently storing `128`. The long-form key parser advertises
case-insensitive input while its note map is case-sensitive. Enrichment title
matching can replace the best accepted similarity with a later weaker match,
making scoring depend on input order.

The same utility area also contains vague `Alt` APIs and a Beatport-specific
parser name for a format used by Rekordbox and local analysis.

## Scope

Modify:

- `app/stores/trackFiltersStore.ts`
- `app/components/tracks/DialogTrackFilters.vue`
- `app/utils/track-validation.ts`
- `app/utils/formatting.ts`
- `app/utils/trackEditor.ts`
- `app/utils/keyFunctions.ts`
- `app/utils/rekordboxXml.ts`
- `app/utils/trackEnrichment.ts`
- their focused unit/store/Nuxt tests

Do not change stored `tracks.key`/`tracks.mode` columns, key numbering, matching
thresholds, enrichment source precedence, or form copy except where it must
describe the stricter accepted syntax.

## Drift check

```bash
git status --short
rg -n "parseFloat|selectedKey|keyOptions|parseBeatportKey|getKeyOptionsAlt|combinedOptionsMapFnAlt|bestSimilarity" app
rg -n "128abc|lowercase|order.*similar|major|minor" app/**/*.test.ts test/nuxt
```

STOP if the filter has already moved to a composite key/mode value, or if a
published import contract depends on accepting partial numeric strings.

## Required implementation

1. Use a composite filter value that uniquely represents `{ key, mode }`.
   - Reuse the existing composite-key parser/creator or replace it with a typed
     equivalent shared with editor options.
   - Give every Select option a unique value and render key.
   - Filter on both `track.key` and `track.mode`; retain a single clear state.

2. Centralize strict BPM parsing.
   - Trim surrounding whitespace, require the entire remaining string to be a
     valid finite decimal, and enforce the 30–300 range in validation.
   - Validation and payload construction must call the same parser. Empty input
     remains `null`; malformed input never truncates silently.

3. Make long-form tonality parsing honest and general.
   - Canonicalize note letter and accidental before lookup and normalize mode.
   - Rename `parseBeatportKey` to a source-neutral name such as
     `parseLongFormTonality`, updating every caller.
   - Return `{ key: null, mode: null }` for a failed note instead of retaining a
     parsed mode beside an invalid key.

4. Make fuzzy matching order-independent.
   - Retain the maximum accepted similarity across every pair.
   - Prove source/candidate title ordering cannot change acceptance or score.

5. Remove or rename weak utility APIs.
   - Delete `getKeyOptionsAlt`, `combinedOptionsMapFnAlt`, and other unused
     exports after proving no production/test consumer remains.
   - If an alternative format is still required, name it for its exact output
     rather than `Alt`.

## Test plan

```bash
npm run format
npx vitest run --project unit \
  app/utils/track-validation.test.ts \
  app/utils/formatting.test.ts \
  app/utils/keyFunctions.test.ts \
  app/utils/rekordboxXml.test.ts \
  app/utils/trackEnrichment.test.ts
npx vitest run --project stores app/stores/__tests__/trackFiltersStore.test.ts
npx vitest run --project nuxt test/nuxt/track-editors.nuxt.test.ts
npm run check:conventions
npm run verify
git diff --check
```

Required cases include `128abc`, `120..5`, whitespace, `30`, `300`, lowercase
notes, flat/sharp casing, duplicate option detection, major/minor filtering, and
reversed fuzzy-title arrays.

## Done criteria

- [ ] Every key/mode filter option and Vue key is unique.
- [ ] Filtering distinguishes major and minor tracks of the same pitch class.
- [ ] BPM validation and serialization share one full-string parser.
- [ ] Long-form key parsing is case-insensitive in practice and has source-neutral naming.
- [ ] Fuzzy title scores are independent of comparison order.
- [ ] Dead or vaguely named alternative APIs are removed or made semantic.

## STOP conditions

Stop if stricter BPM parsing would reject an intentionally documented syntax,
if a key representation change would require persisted-data migration, or if
matching-score changes extend beyond the reproduced maximum-selection defect.

## Git workflow

- Branch: `codex/045-correct-track-input-and-matching-semantics`
- Commit: `fix(tracks): make input and matching semantics exact`
