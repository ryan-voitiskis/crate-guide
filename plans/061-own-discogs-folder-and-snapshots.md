# Plan 061: Own Discogs folder review and snapshots explicitly

> **Executor instructions**: Fix the two ownership races without redesigning
> the transfer pipeline. Add same-account folder-switch and A to B snapshot
> tests before changing source.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/stores/discogsStore.ts app/stores/__tests__/discogsStore.test.ts app/components/import/DialogCollectionImport.vue app/composables/useUserData.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / concurrency
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

Folder review validates account ownership but not selected-folder ownership, so
folder A can publish after the UI has switched to B. During account replacement,
snapshot cleanup prefers the incoming current user over the outgoing snapshot
owner, deleting B's report and retaining A's.

## Current state

- `discogsStore.ts:400-449` captures a folder object, then checks only
  `isCurrentAccountContext(context)` before publishing releases/dialog state.
- `DialogCollectionImport.vue:95-125` leaves folder selection interactive while
  the request is running.
- `clearTransferSnapshot` at `discogsStore.ts:228-240` defaults to
  `currentUserId() ?? snapshotUserId`; `resetAccountState` calls it after the
  reactive identity may already be B.
- Existing tests cover account replacement during folder work and same-user
  snapshot restore, but not same-account folder replacement or two storage keys.

## Commands you will need

| Purpose     | Command                                                                        | Expected on success |
| ----------- | ------------------------------------------------------------------------------ | ------------------- |
| Store tests | `npx vitest run --project stores app/stores/__tests__/discogsStore.test.ts`    | all pass            |
| Nuxt tests  | `npx vitest run --project nuxt test/nuxt/discogs-source-manifest.nuxt.test.ts` | all pass            |
| Full gate   | `npm run verify`                                                               | exit 0              |

## Scope

**In scope**:

- `app/stores/discogsStore.ts`
- `app/stores/__tests__/discogsStore.test.ts`
- `app/components/import/DialogCollectionImport.vue` and focused test if the UX
  deliberately locks selection
- `app/composables/useUserData.ts` only if it must pass an outgoing identity

**Out of scope**: transfer-runner extraction (Plan 067), OAuth finalization
(Plan 049), accountless credentials (Plan 073), or snapshot format expansion.

## Git workflow

- Branch: `codex/061-own-discogs-folder-and-snapshots`
- Commit: `fix(discogs): own folder reviews and snapshots`

## Steps

1. Add deferred folder A/B tests. Capture folder ID plus a monotonic review
   generation. Changing selection, closing/reopening, reset, or starting a
   newer review invalidates the old generation. Only the owned request may set
   releases, errors, loading, or dialog visibility. Keep selection interactive:
   switching to B invalidates A immediately, starts B's review, and shows loading
   for B; A's later result is discarded without a stale toast or dialog change.
2. Replace implicit snapshot deletion with an explicit owner parameter. Track
   the hydrated/snapshot owner independently of the reactive incoming user.
   Preserve terminal snapshots across same-account reload/token refresh. On
   explicit sign-out or A-to-B account replacement, clear only the outgoing
   owner's snapshot before activating the incoming account; never delete another
   user's key.
3. Exercise A and B keys through A to B, A to signed-out, restored B, dismiss,
   malformed B, and storage exceptions. Ensure stale A work cannot alter B's
   loading or dialogs.

**Verify**: focused tests after each step, then format/conventions/full gate.

## Test plan

Use exact sessionStorage keys and deferred API promises. Include folder names
that are identical but IDs differ so ownership is ID-based, not label-based.

## Done criteria

- [x] Folder results publish only for the selected folder/request generation.
- [x] Reset/dismiss removes only the explicitly owned snapshot key.
- [x] A to B replacement preserves B state and cannot leave A state active.
- [x] Focused and full gates pass.

## STOP conditions

Stop if product requirements need concurrent folder reviews or if fixing
ownership requires changing the terminal snapshot payload contract.

## Maintenance notes

Plan 067 should consume these explicit folder/snapshot identities rather than
recreating implicit current-user lookup inside the extracted runner.
