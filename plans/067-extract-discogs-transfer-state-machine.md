# Plan 067: Extract the Discogs transfer state machine

> **Executor instructions**: This is a behavior-preserving extraction after the
> ownership fixes. Characterize import and retry independently, then share only
> the lifecycle that is truly common. Keep the Pinia store as the public facade.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/stores/discogsStore.ts app/stores/__tests__/discogsStore.test.ts app/utils/discogs-retry.ts app/utils/discogs-import.ts`

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 044, 049, and 061
- **Category**: tech debt / state machine
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

The 875-line store owns folder loading, snapshot codec/storage, UI state, and
two near-duplicate transfer pipelines. Import and retry repeat setup, fetch,
cancellation, database save, refresh, snapshot, error, and finalization logic,
while subtle result-accounting differences make future fixes easy to apply to
only one branch.

## Current state

- `discogsStore.ts:559-817` contains `importSelectedReleases` and
  `retryFailedReleases` with repeated phases and cleanup.
- `discogsStore.ts:22-143` contains snapshot types/validation.
- `discogsStore.ts:236-298` performs sessionStorage serialization/hydration.
- Provider detail fetch pacing in `discogs-import.ts` is intentional and must
  remain one request per second; this plan does not parallelize it.

## Commands you will need

| Purpose     | Command                                                                     | Expected on success |
| ----------- | --------------------------------------------------------------------------- | ------------------- |
| Store tests | `npx vitest run --project stores app/stores/__tests__/discogsStore.test.ts` | all pass            |
| Unit tests  | `npx vitest run --project unit app/utils/discogs*.test.ts`                  | all pass            |
| Docs        | `npm run check:discogs-docs`                                                | exit 0              |
| Full gate   | `npm run verify`                                                            | exit 0              |

## Scope

**In scope**:

- `app/stores/discogsStore.ts` and split store tests
- `app/utils/discogsTransferSnapshot.ts` plus tests
- `app/utils/discogsTransferRunner.ts` / reducer plus tests
- types needed for dependencies, events, state, and mode policies
- Discogs architecture docs if ownership boundaries change

**Out of scope**: UI redesign, provider request concurrency, new snapshot
fields, accountless OAuth (Plan 073), or database import semantics.

## Git workflow

- Branch: `codex/067-extract-discogs-transfer-state-machine`
- Commit: `refactor(discogs): extract transfer state machine`

## Steps

1. Split tests by snapshot, folder, import, retry, cancellation, account change,
   and UI facade. Characterize every state transition and exact import-versus-
   retry accounting before moving code.
2. Extract a pure, versioned snapshot codec. It accepts explicit owner ID,
   validates safe request IDs/result fields, and contains no window/storage
   access. Keep persistence in a tiny adapter keyed by explicit owner.
3. Define one transfer runner with injected fetch/save/refresh/persist callbacks,
   captured account/folder generation, cancellation predicate, and event sink.
   Model phases as a discriminated state/event reducer. Mode-specific policy
   owns target preparation, previous-failure reconciliation, recovered counts,
   labels, and retry summary; do not hide these differences in booleans.
4. Make Pinia translate runner events into existing refs/dialogs/toasts and
   remain the sole public consumer API. A runner result must distinguish
   provider cancellation, stale owner, partial save, refresh failure after
   commit, and unexpected failure.
5. Remove duplicated branches only after parity tests pass. Update architecture
   docs with the ownership/state diagram and forbidden transitions.

**Verify after each step**: focused suites; finally docs, conventions, and full
gate.

## Test plan

Cover import and retry happy path, no targets, fetch partials, cancel during
fetch/save boundary, account change every phase, refresh failure after commit,
snapshot failure, malformed restore, runner callback throw, and double-start.
Assert exact state/event sequence and public Pinia output.

## Done criteria

- [x] Snapshot validation is pure and owner-explicit.
- [x] Import/retry share one lifecycle runner while retaining named result policies.
- [x] The Pinia public API, UI states, pacing, cancellation, and accounting are unchanged.
- [x] Focused, docs, convention, and full gates pass.

## STOP conditions

Stop if a shared abstraction needs mode booleans with undocumented branches,
if characterization exposes an unresolved behavior difference, or if extraction
weakens Plan 061 ownership/Plan 044 fresh-refresh semantics.

## Maintenance notes

Plan 073 may add another credential/source adapter, but it should reuse the
runner only after satisfying the same explicit ownership and cancellation
contract.
