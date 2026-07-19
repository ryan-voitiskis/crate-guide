# Plan 027: Cancel obsolete fader work when loading a replacement track

> **Executor instructions**: Start from the final integrated Plan 017 code.
> Follow this scope exactly; root owns `plans/README.md`. Preserve physical deck
> pitch semantics and do not turn this focused cancellation fix into a turntable
> redesign.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/017-cancel-fader-animations.md`
- **Category**: bug
- **Discovered at**: integration review of commit `f0443af`, 2026-07-19
- **Completed by**: commit `fca90bf` (integrated as `812f102`), 2026-07-19

## Why this matters

Plan 017 gives each fader animation an ownership generation, but `loadTrack`
replaces `deck.loadedTrack` without invalidating the current generation. The
deck object itself remains the same, so an older animation still owns it and can
later commit its target pitch to a newly loaded track. The normal load dialog
passes `matchTempo=false`, making this race directly reachable.

## Scope

Modify only:

- `app/stores/sessionStore.ts`
- `app/stores/__tests__/sessionStore.test.ts`

Do not change fader timing, pitch-range calculations, suggestion selection,
session-history fields, or dialog behavior.

## Steps

1. Before replacing a valid target deck's track, cancel that deck's current
   fader generation.
2. Restore a coherent non-animating visual state: `faderSliding=false` and
   `faderPosition` aligned with the last committed `pitch`. Do not reset the
   user's physical pitch merely because a track changed.
3. Load the replacement track and preserve existing RPM/history behavior.
4. If `matchTempo=true`, start the new animation only after cancellation and
   track replacement, so the new generation owns the replacement track.
5. Add fake-timer tests that start an animation, load a different track before
   completion, drain all old timers, and prove the old target never commits.
   Cover both non-matching load and a new match-tempo generation superseding the
   old one.
6. Prove invalid track/deck requests retain their existing no-op behavior and do
   not cancel valid work accidentally.

## Verification

Run:

```bash
npx vitest run --project stores app/stores/__tests__/sessionStore.test.ts
npm run format
npm run check:conventions
npm run verify
git diff --check
```

## Done criteria

- [ ] Replacing a track invalidates the old fader owner.
- [ ] Old timers cannot change pitch, position, or sliding state afterward.
- [ ] The stable committed pitch survives a non-matching track load.
- [ ] A requested new match-tempo animation owns and completes normally.
- [ ] Invalid loads remain no-ops.
- [ ] Only the store and its test changed and all gates pass.

## STOP conditions

Stop and report if:

- product behavior requires resetting physical pitch on every track load;
- cancellation cannot be distinguished from starting the new match operation;
- the fix requires component or persisted-session schema changes;
- verification fails twice after one reasonable in-scope correction.

## Git workflow

Use branch `codex/027-cancel-fader-on-load` and commit
`fix(session): cancel fader work on track load`. Do not push or merge.
