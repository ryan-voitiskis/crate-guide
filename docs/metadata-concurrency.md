# Record and crate editor concurrency

Confirmed on 8 September 2026 against the migrated local Supabase stack, using two independently authenticated clients for one disposable account. Source baseline: `845bcb3308a35b4dfe8d4a24a9b10d8de4529b39` (PR #17). The ownership extraction does not change these paths.

## Observed behavior

Both editors can silently overwrite a newer edit from another session. This is a persisted lost update, not merely an optimistic display problem.

| Entity | Session A opens                              | Session B saves                                                                  | Session A then saves                                       | Persisted result                                                               |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Record | Original title, no year, original artist     | Year `2024`, artist `Concurrent artist`                                          | A new title with the original form's year and artist       | New title, year reset to `null`, original artist restored                      |
| Crate  | Original name, description, colour `#112233` | A new description and colour `#445566`; adds a record through the membership RPC | A new name with the original form's description and colour | New name, original description and colour restored; record membership survives |

Every save above succeeded through real Auth, PostgREST, row-level policies, and database triggers. The probe used the exact editor metadata fields and repository owner/id filters, rather than mocked repository outcomes. It did not automate the editor UI; the connection to each editor is established by the source paths below. No production data was changed.

The temporary probe asserted both lost updates, advancing record timestamps, preserved crate membership, and cleanup. It passed in the local integration project. Its disposable Auth user, library rows, crate, cover objects, quota state, and cleanup jobs were verified absent afterward. A permanent test should assert conflict protection when the fix is implemented, rather than preserve today's faulty behavior as a passing contract.

## Cause

- [DialogRecordDetails](../app/components/records/DialogRecordDetails.vue) always submits title, year, and artists from the open form. [cloudRecordsRepository](../app/repositories/library/cloud/cloudRecordsRepository.ts) updates by record ID and owner, without checking the version the editor opened.
- [DialogCrateDetails](../app/components/crates/DialogCrateDetails.vue) always submits name, description, and colour. [cloudCratesRepository](../app/repositories/library/cloud/cloudCratesRepository.ts) likewise updates metadata without an expected row version. Its failure handler currently reinitializes the form, which would discard input if a conflict were surfaced without changing the UI handling.
- Per-record queues and optimistic ownership tokens protect mutations within one running store. They cannot prevent another tab or device from saving an older form.
- Crate membership already uses atomic add/remove RPCs; the editor does not submit the membership array. Preserve that separation.

To repeat the experiment, create a fixture through `createLocalFixture` in `test/integration/fixtures/localSupabase.ts`; sign a second client into that exact fixture account using the guarded local URL; select an initial row with client A; update the other fields with client B; then submit the metadata fields shown above with client A. Assert persisted values, dispose the fixture in `finally`, and additionally verify no `public.crates` rows remain for the exact fixture user. Do not run this against a hosted project or retain a test asserting lost updates as correct behavior.

## Recommended next implementation

Extend the existing track-editor conflict contract in a separate correctness PR:

1. Capture the record/crate version when the form is initialized. Carry it through the store and repository mutation as `expectedUpdatedAt`; keep the full timestamp string, including database precision. Apply it in the same database statement as the update. A zero-row version match is a conflict, not a successful save or a generic transport error.
2. Preserve the user's fields on conflict, fetch the current server row, show what changed, and require explicit review before retry. Reuse the track editor's established behavior. Sending only dirty fields reduces incidental overwrites but does not protect against two people changing the same field.
3. Make record `updated_at` strictly monotonic before relying on it for compare-and-swap. The initial record trigger uses transaction-time `NOW()`. Crates already have the monotonic trigger introduced by `20260719121000_add_atomic_crate_membership.sql`; tracks received the equivalent guarantee in the audit release.
4. Carry the precondition through the record cover coordinator. A rejected save must not remove the current cover or leave the newly uploaded candidate behind. Preserve reconciliation of uncertain responses and account/workspace switching.
5. Implement equivalent outcomes in the Demo adapter and update store consumers deliberately. Preserve atomic crate membership, per-entity ordering, existing optimistic rollback ownership, and stale-workspace guards.

Acceptance requires two-session browser/integration tests for both editors, same-field and different-field conflicts, input preservation and reviewed retry, the record cover path, deletion/workspace switches during save, and simultaneous crate membership changes. Add a database regression for monotonically advancing record versions within one transaction. Run the existing full verification and scoped cleanup checks before release.

This investigation changes no persistence contracts or production behavior. The confirmed defects should be addressed before the next broad store or autosave extraction.
