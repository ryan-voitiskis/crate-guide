# Plan 002: Attach the load-track dialog hook to real DOM

> **Executor instructions**: Follow this plan exactly in the isolated worktree.
> Touch only the in-scope file. Stop rather than widening scope. The reviewer
> owns `plans/README.md`.
>
> **Drift check**:
> `git diff --stat 50f6d3b..HEAD -- app/components/session/DialogLoadTrack.vue`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plan 001 implementation commit `50f6d3b`
- **Category**: bug
- **Planned at**: commit `50f6d3b`, 2026-07-10

## Why this matters

Rendered QA of Plan 001 found that `data-testid="load-track-dialog"` is passed
to the local `DialogContent` component. That component renders a Teleport root,
so Vue reports an extraneous-attribute warning and the test hook does not reach
real DOM. The picker works, but Plan 001 explicitly requires a usable dialog
hook and a warning-free console.

## Scope

**In scope**:

- `app/components/session/DialogLoadTrack.vue`

**Out of scope**:

- UI primitives, including `app/components/ui/dialog/DialogContent.vue`
- Search, ranking, result cards, stores, tests, and dependencies

## Required change

- Remove `data-testid="load-track-dialog"` from `<DialogContent>`.
- Put that test ID on a guaranteed native HTMLElement that contains both the
  fixed header/toolbar and results area.
- Preserve the current grid sizing and single outer scroll region. A native
  wrapper with `class="contents"` is acceptable because its children continue
  participating in the `DialogContent` grid.
- Ensure `resultsContentRef.value.closest('[data-testid="load-track-dialog"]')`
  resolves to that native element, so open autofocus continues to work.
- Do not change visible copy, result behavior, responsive layout, or keyboard
  behavior.

## Verification

Run:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:run
npm run build
git diff --check 50f6d3b..HEAD
git diff --name-only 50f6d3b..HEAD
```

Expected: every command exits 0 and the final name-only command lists only
`app/components/session/DialogLoadTrack.vue`.

Then run the authenticated local app and confirm:

- `[data-testid="load-track-dialog"]` resolves to exactly one real element while
  the picker is open;
- opening the picker focuses the search input;
- ArrowDown from a populated search focuses a track option;
- browser logs contain no extraneous `data-testid` Vue warning.

If authenticated browser access is unavailable, report that and leave rendered
QA to the reviewer; do not alter production code to manufacture test data.

## Done criteria

- [ ] The test ID is present on real DOM and absent from `DialogContent` props.
- [ ] Grid sizing, one-scroll-region layout, autofocus, and ArrowDown behavior
      remain intact.
- [ ] Automated verification passes.
- [ ] Browser console is free of the introduced Vue warning.
- [ ] Commit uses `fix(session): attach load-track dialog test hook`.

## STOP conditions

- Fixing the warning requires editing a UI primitive or any out-of-scope file.
- The native wrapper changes layout and cannot be corrected inside the one
  in-scope file.
- A verification command fails twice after one reasonable in-scope correction.
