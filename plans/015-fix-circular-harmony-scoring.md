# Plan 015: Score fractional pitch classes correctly across the 0/12 boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/utils/keyFunctions.ts app/utils/keyFunctions.test.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `3206c0a` (integrated as `e08c4e9`), 2026-07-19

## Why this matters

Pitch-adjusted keys are fractional values on a circular 12-semitone domain.
The harmony scorer compares them with linear absolute differences, so 11.9 and
0.1 appear 11.8 semitones apart instead of 0.2. This misclassifies compatible
same-key, mode-change, and fifth relationships near the wrap boundary and
degrades session suggestions.

## Current state

- `keyFunctions.ts:367-375` already provides a correct positive `mod` helper and
  `adjustKey` returns fractional values modulo 12.
- `scoreHarmony` at lines 380-407 repeatedly uses linear distance:

  ```ts
  if (Math.abs(a.key - b.key) < 0.5)
  // ...
  if (Math.abs(mod(a.key + 5, 12) - b.key) < 0.5)
  ```

- The returned affinity is `1 - Math.abs(...)`, so the same incorrect distance
  affects the score.
- `keyFunctions.test.ts:193-251` covers integer same/fifth/mode relationships
  and fractional `0.2` vs `0.1`, but no wrap boundary.
- Preserve the existing `keyCombination` indices and the current `+5/-5`
  mapping semantics; this plan changes distance only.

## Commands you will need

| Purpose       | Command                                                        | Expected on success |
| ------------- | -------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run --project unit app/utils/keyFunctions.test.ts` | all pass            |
| Typecheck     | `npm run typecheck`                                            | exit 0              |
| Full gate     | `npm run verify`                                               | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/utils/keyFunctions.ts`
- `app/utils/keyFunctions.test.ts`
- `plans/README.md` status row

**Out of scope**:

- Changing Camelot mappings, key labels/colors, pitch adjustment, or suggestion
  weights
- Changing the 0.5-semitone acceptance threshold
- Reinterpreting up/down-fifth `keyCombination` indices
- Refactoring unrelated key utilities

## Git workflow

- Branch: `codex/015-circular-harmony-distance`
- Use one Conventional Commit, for example
  `fix(harmony): use circular pitch-class distance`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a focused circular distance helper

Add and export:

```ts
export function pitchClassDistance(left: number, right: number): number {
	const linear = Math.abs(mod(left, 12) - mod(right, 12))
	return Math.min(linear, 12 - linear)
}
```

It must return a finite value in `[0, 6]` for finite inputs and normalize
negative/out-of-range pitch classes. Do not silently accept non-finite values;
throw a clear `RangeError` for `NaN`/Infinity.

**Verify**: tests cover `11.9/0.1 = 0.2`, symmetry, negative values,
values above 12, opposite points (`0/6 = 6`), and non-finite rejection.

### Step 2: Use one distance calculation in every harmony branch

Replace each linear `Math.abs` in `scoreHarmony` with
`pitchClassDistance`:

- same pitch class, same mode;
- target `mod(a.key + 5, 12)`;
- target `mod(a.key - 5, 12)`;
- same pitch class, opposite mode.

Calculate the distance once per attempted branch and use that same value for
both `< 0.5` and `1 - distance`. Keep incompatible results at affinity 0.

**Verify**: focused tests preserve all existing integer expected combinations.

### Step 3: Add wrap-boundary scoring regressions

Add tests for:

1. same-mode `11.9 -> 0.1` gives combination 0 and affinity ~0.8;
2. opposite-mode `0.1 -> 11.9` gives combination 3/4 as appropriate and ~0.8;
3. both fifth directions when the target crosses 0/12;
4. symmetry of affinity for same-key comparisons;
5. incompatible fractional tritone remains zero;
6. all returned affinities stay in `[0,1]`.

**Verify**: `npx vitest run --project unit app/utils/keyFunctions.test.ts` -> all
pass.

### Step 4: Run full verification

**Verify**: `npm run format && npm run check:conventions && npm run typecheck && npm run verify`
-> exit 0.

## Test plan

- Extend the existing `mod`, `adjustKey`, and `scoreHarmony` describe blocks.
- Use `toBeCloseTo` for fractional results and exact assertions for combination
  indices.
- Preserve the current C/G fifth tests to guard direction semantics.

## Done criteria

- [ ] Circular distance is normalized, symmetric, and bounded.
- [ ] Every `scoreHarmony` pitch-class comparison uses it.
- [ ] Wrap-boundary same-key, mode, and fifth cases pass.
- [ ] Existing integer behavior and combination indices are unchanged.
- [ ] Focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Product intent says fractional pitch classes should be rounded before scoring.
- Existing `+5/-5` direction semantics change or tests reveal a separate mapping
  bug; do not combine it here.
- Non-finite keys are intentionally supported elsewhere.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Use `pitchClassDistance` for any future continuous pitch-class comparison.
- Reviewers should ensure the same distance feeds both threshold and affinity.
- Keep key mapping/product decisions separate from this mathematical correction.
