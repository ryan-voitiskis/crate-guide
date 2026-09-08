# Recovery and draft ownership

Status: ownership extraction verified; metadata investigation complete; recovery awaiting access and storage. Approved by Ryan on 8 September 2026 after PR #17 merged.

## Scope

1. Verify current Supabase access, prepare independent database and cover recovery, and prove an isolated restore before activating backups. Production data must have an explicit private destination and an encryption/recovery owner.
2. Extract draft claim, renewal, takeover, and release into one ownership controller. Preserve IndexedDB data, lease semantics, public session behavior, and the shared mutation queue used by autosave.
3. Reproduce record/crate metadata concurrency behavior with disposable local fixtures. Record confirmed defects and the smallest appropriate remediation before changing persistence contracts.

## Working baseline

- Main source: `845bcb3308a35b4dfe8d4a24a9b10d8de4529b39`; merged-source CI passed.
- The default CLI currently authenticates but does not list either Crate Guide project. The existing legacy profile is unusable, and an attempted separate profile fails with `LegacyProfileLoadError`. No credentials were replaced.
- Chrome still sees production and staging in organization `grxffkeajwssrcfwtxny`. CLI sign-in has been requested while local work proceeds.
- Independent backup storage and recovery-key ownership remain to be established. Backup capability is not activated.

## Implementation and investigation

- `createTrackEnrichmentDraftOwnership` now owns local lease state, claim/takeover, renewal timers, and release. It receives the session's existing mutation queue, device revision, and lifecycle guard so autosave and ownership still serialize against the same revision. The session retains hydration, recovery messages, unsaved-work handling, and public UI behavior. There is no IndexedDB schema or persistence-contract change.
- Calls back into the session recheck operation validity after the new asynchronous boundary. Teardown still drains the pending save and original queue, rereads the resulting persisted lease, and releases with that observed revision.
- Nine focused controller tests pass, including fresh compare-and-swap revisions after queued writes, overlapping renewal/release, superseded responses, expired/foreign ownership, and release after the first save. The existing 37 draft-session tests also pass after extraction.
- [Record/crate concurrency investigation](../docs/metadata-concurrency.md) confirms both persisted overwrite defects using two real local sessions. All synthetic data was removed and verified. The proposed next correctness PR adds version preconditions and input-preserving conflict review; it keeps crate membership atomic and handles cover cleanup explicitly.
- The production dashboard still reports no backups. R2 is not enabled on the intended Cloudflare account. CLI sign-in and the storage choice have been requested; [current operations](../docs/operations.md#recovery-activation) records the exact activation sequence. No production backup, restore, or schedule has been claimed complete.

## Verification

`npm run format`, `npm run check:conventions`, and `npm run verify:full` passed locally on 8 September 2026. This includes 2,535 application tests, 26 end-to-end tests (one existing skip), 82 browser tests, 146 Edge tests, 473 database assertions, and five real local Supabase integration tests, plus type checking, build, security headers, schema parity, and bundle budgets. Existing browser tests cover reopening a persisted review and cross-session takeover/deletion without resurrecting dirty work.

The local stack was neither reset nor stopped. Each integration fixture's teardown verified its own rows, objects, Auth user, and cleanup state; a final read-only query confirmed zero disposable integration Auth fixtures. Recovery remains unverified until a complete production backup set has been restored in isolation. No new production release was made.
