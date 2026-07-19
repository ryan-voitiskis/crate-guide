# Plan 017: Cancel obsolete fader animations before they mutate reset decks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Execution base**: approved Plan 012 commit `0010d9b`. **Drift check (run
> first)**: `git diff --stat 0010d9b..HEAD -- app/stores/sessionStore.ts app/stores/__tests__/sessionStore.test.ts`
> The Plan 012 autosave queue is expected and must remain intact. If either
> in-scope file changed after `0010d9b`, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/012-serialize-session-autosave.md`
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `3b1a07d` (integrated as `6806010`), 2026-07-19

## Why this matters

`slideFader` holds a deck reference and continues its timer loop after the deck
is unloaded, pitch-reset, account-reset, removed, or assigned a newer animation.
The obsolete loop can later restore an old target pitch and clear the new
animation's `faderSliding` flag. Per-deck generation ownership makes cancellation
deterministic without changing the visual step/delay behavior.

## Current state

- `sessionStore.ts:177-194` runs an async `while` loop with 2-unit steps and
  10 ms delays; it has no cancellation check.
- `resetPitch` (196-201), `unloadDeck` (222-229), `clearSession` (268-282),
  `resetAccountState` (285-305), and deck-count changes can reset/replace decks
  while the loop remains alive.
- `setPitch` refuses manual changes while `faderSliding` is true, but does not
  cancel animation.
- Existing tests cover pitch setters and deck lifecycle, but no direct
  `slideFader` ordering/cancellation.
- `seedDemoPinia()` performs one direct deck-array replacement while seeding a
  newly created private demo Pinia. This happens before that Pinia is provided
  to any consumer, is guarded to run once, and therefore cannot overlap a
  fader animation. Treat this initialization-only write as an explicit safe
  exemption; do not broaden it to live workbench mutations.
- Preserve the async public method and exact final pitch behavior; use fake
  timers for deterministic tests.

## Commands you will need

| Purpose       | Command                                                                     | Expected on success |
| ------------- | --------------------------------------------------------------------------- | ------------------- |
| Focused tests | `npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts` | all pass            |
| Typecheck     | `npm run typecheck`                                                         | exit 0              |
| Full gate     | `npm run verify`                                                            | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`
- `plans/README.md` status row

**Out of scope**:

- Changing animation duration, step size, easing, or UI controls
- `requestAnimationFrame` migration
- Session autosave; Plan 012 owns persistence ordering
- Changing or weakening the approved Plan 012 write queue
- Tempo-match calculation or pitch range

## Git workflow

- Branch: `codex/017-fader-animation-cancel`
- Use one Conventional Commit, for example
  `fix(session): cancel obsolete fader animations`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Track animation ownership independently of reactive deck state

Add a private monotonically increasing generation per deck slot (array or map)
and helpers:

```ts
function beginFaderAnimation(deckIndex: number): number
function cancelFaderAnimation(deckIndex: number): void
function ownsFaderAnimation(
	deckIndex: number,
	deck: Deck,
	generation: number
): boolean
```

Ownership requires both the current generation and
`decks.value[deckIndex] === deck`, so a removed/replaced deck object can never
commit. Starting a new animation increments generation and supersedes the old.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Guard the timer loop and final state

In `slideFader`, capture deck and generation. After every awaited delay and
immediately before final pitch/flag writes, require ownership. A canceled call
returns without changing pitch/position and without clearing `faderSliding` if a
newer animation owns the slot. Only the owning call sets `faderSliding=false`.

Preserve step `2`, delay `10`, clamping done by callers, and return type.

**Verify**: a normal fake-timer test reaches the target and ends with
`pitch=target`, `faderPosition=target`, `faderSliding=false`.

### Step 3: Cancel from every deck-reset lifecycle

Call cancellation before mutation in:

- `resetPitch`;
- `unloadDeck`;
- each deck reset in `clearSession`;
- `resetAccountState` before replacing the deck array;
- `initializeDecks` before removing a slot;
- any other live code path that replaces a deck object.

When `resetPitch`/`unloadDeck` cancels, explicitly set `faderSliding=false` on the
current deck. A new `slideFader` call may intentionally replace an old animation.

**Verify**: source search plus tests prove every lifecycle path leaves the reset
pitch unchanged after all timers drain.

### Step 4: Add ordering/cancellation regressions

With fake timers, cover:

1. normal completion;
2. second animation supersedes first and only second target commits;
3. resetPitch during animation stays at 0 after timers;
4. unloadDeck during animation stays unloaded/0;
5. clearSession and resetAccountState prevent late commits;
6. shrinking then regrowing deck count prevents removed-slot animation from
   mutating the new deck;
7. canceled old completion cannot clear a newer animation's sliding flag.

Always await both returned promises and restore real timers.

**Verify**: focused session test file passes.

### Step 5: Run full verification

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts && npm run verify`
-> exit 0.

## Test plan

- Use fake timers and retain each `slideFader` promise.
- Assert both intermediate ownership (`faderSliding`) and final state.
- Drain all timers after cancellation to prove no hidden late mutation.
- Preserve existing tempo-match, setPitch, reset, unload, and deck-count tests.

## Done criteria

- [ ] Exactly one animation generation owns each deck slot.
- [ ] Obsolete loops cannot write position, pitch, or sliding state.
- [ ] Every reset/replacement/removal path cancels first.
- [ ] New animation safely supersedes old animation.
- [ ] Step/delay/final target behavior is unchanged for normal completion.
- [ ] Focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- Deck objects are intentionally shared across indices.
- Another module mutates/replaces `decks` outside the store after consumers can
  start animations and cannot call the cancellation helper. The one-time
  pre-provision `seedDemoPinia()` replacement documented above is exempt.
- Correct cancellation requires changing the public animation API or UI timing.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any future async deck animation must use explicit ownership/cancellation.
- Review removed-slot behavior when deck-count logic changes.
- Do not use `faderSliding` alone as a cancellation token; stale calls can write
  it too.
