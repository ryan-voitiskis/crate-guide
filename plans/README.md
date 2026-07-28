# Crate Guide Implementation Plans

This directory contains active, self-contained implementation plans. Completed
plans are removed only after their code and verification evidence are confirmed;
Git history retains the handoffs and completion commits.

Plans 044-056 came from the 2026-07-19 integrated-result re-audit. On
2026-07-22, current `main` at `0a0cda6` was reconciled against all 17 retained
whole-repository findings. Existing plans were expanded where they already own
the same behavior; Plans 057-067 cover the remaining non-overlapping findings.
Plans 068-076 turn the four product directions into a staged Local library,
portable backup, resumable review, Evidence, Discogs, migration, and offline
program.

## Execution rules

- Read the selected plan fully and run its drift check first. `Planned at` is an
  evidence baseline, never a command to reset later work.
- Preserve unrelated worktree changes and stage only the plan's declared files.
- Use Conventional Commits. Do not push, deploy, mutate provider configuration,
  or open a PR unless separately instructed.
- Run `npm run format`, `npm run check:conventions`, and the plan's focused/full
  gates before handoff. Prettier owns Edge formatting; never run `deno fmt`.
- Treat every STOP condition as a handoff boundary. Do not weaken correctness,
  privacy, security, data durability, or acceptance criteria to make a gate pass.
- Update the status row when work starts, blocks, or completes. Remove a plan
  only after implementation and required evidence are confirmed.
- Plans sharing source files remain sequential even if their dependencies allow
  independent preparation.

Status values: `READY`, `TODO`, `IN PROGRESS`, `BLOCKED`, `DEFERRED`, `DONE`, or
`REJECTED`. `DEFERRED` records an intentional product-scope decision; it is not
evidence that a STOP or dependency was resolved.

## Active queue

|   # | Plan                                                                                                        | Priority | Effort | Risk | Active dependencies                         | Status   |
| --: | ----------------------------------------------------------------------------------------------------------- | :------: | :----: | :--: | ------------------------------------------- | -------- |
| 044 | [Reconcile same-account library writes and derived search](044-reconcile-same-account-library-writes.md)    |    P1    |   L    | HIGH | -                                           | DONE     |
| 045 | [Correct track input and matching semantics](045-correct-track-input-and-matching-semantics.md)             |    P2    |   M    | MED  | -                                           | DONE     |
| 046 | [Guard settings and dialog lifecycles](046-guard-settings-and-dialog-lifecycles.md)                         |    P2    |   M    | MED  | 044                                         | DONE     |
| 047 | [Enforce crate membership and record-delete integrity](047-enforce-crate-membership-delete-integrity.md)    |    P1    |   L    | HIGH | 044                                         | DONE     |
| 048 | [Preserve saved-set coherence, BPM, and history](048-preserve-saved-set-coherence-and-history.md)           |    P2    |   L    | HIGH | -                                           | DONE     |
| 049 | [Make Discogs OAuth finalization resumable](049-make-discogs-oauth-finalization-resumable.md)               |    P1    |   M    | HIGH | 059                                         | DONE     |
| 050 | [Bound the account and cover-cleanup lifecycle](050-bound-account-cleanup-lifecycle.md)                     |    P2    |   L    | HIGH | -                                           | DONE     |
| 051 | [Harden local, runtime-config, and Edge tooling](051-harden-local-and-edge-tooling.md)                      |    P2    |   M    | MED  | 059                                         | DONE     |
| 052 | [Make verification and supply-chain contracts truthful](052-make-verification-contracts-source-truthful.md) |    P2    |   L    | MED  | 051                                         | DONE     |
| 053 | [Enforce a client bundle budget](053-enforce-client-bundle-budget.md)                                       |    P3    |   M    | MED  | 052, 054, 055                               | DONE     |
| 054 | [Extract record and cover workflows](054-extract-record-cover-workflows.md)                                 |    P3    |   L    | MED  | 044, 046                                    | DONE     |
| 055 | [Decompose session/quality hotspots and profile suggestions](055-decompose-session-and-quality-hotspots.md) |    P3    |   XL   | MED  | 045, 048                                    | DONE     |
| 056 | [Make the audio benchmark testable](056-make-audio-benchmark-testable.md)                                   |    P3    |   M    | LOW  | -                                           | DONE     |
| 057 | [Bind account deletion completion](057-bind-account-deletion-completion.md)                                 |    P1    |   M    | HIGH | -                                           | DONE     |
| 058 | [Bound local-audio decode memory](058-bound-local-audio-decode-memory.md)                                   |    P1    |   L    | HIGH | 056                                         | DONE     |
| 059 | [Normalize the Edge site origin](059-normalize-edge-site-origin.md)                                         |    P1    |   S    | LOW  | -                                           | DONE     |
| 060 | [Reconcile profile read/write order](060-reconcile-profile-read-write-order.md)                             |    P2    |   M    | MED  | 057                                         | DONE     |
| 061 | [Own Discogs folder review and snapshots](061-own-discogs-folder-and-snapshots.md)                          |    P2    |   M    | LOW  | -                                           | DONE     |
| 062 | [Add browser security headers](062-add-browser-security-headers.md)                                         |    P2    |   M    | MED  | 052, 059                                    | DONE     |
| 063 | [Virtualize large workbench surfaces](063-virtualize-large-workbench-surfaces.md)                           |    P2    |   L    | MED  | 044, 052, 053, 054                          | DONE     |
| 064 | [Batch enrichment persistence](064-batch-enrichment-persistence.md)                                         |    P2    |   L    | HIGH | 044, 052                                    | DONE     |
| 065 | [Move Rekordbox parsing off the main thread](065-move-rekordbox-parse-off-main-thread.md)                   |    P2    |   L    | MED  | 045, 052, 053                               | DONE     |
| 066 | [Bound local-audio cache and Worker lifecycle](066-bound-local-audio-cache-and-worker.md)                   |    P3    |   M    | MED  | 056, 058                                    | DONE     |
| 067 | [Extract the Discogs transfer state machine](067-extract-discogs-transfer-state-machine.md)                 |    P3    |   L    | MED  | 044, 049, 061                               | DONE     |
| 068 | [Separate workbench storage from identity](068-separate-workbench-storage-and-identity.md)                  |    P1    |   XL   | HIGH | 044, 047, 048, 051, 054, 055, 057, 060, 064 | DONE     |
| 069 | [Implement the browser-library repository](069-implement-browser-library-repository.md)                     |    P1    |   XL   | HIGH | 053, 066, 068                               | DONE     |
| 070 | [Add portable library archives](070-add-portable-library-archives.md)                                       |    P1    |   XL   | HIGH | 047, 048, 054, 068, 069                     | BLOCKED  |
| 071 | [Launch signed-out Local libraries](071-launch-signed-out-local-library.md)                                 |    P1    |   XL   | HIGH | 058, 062, 063, 068, 069, 070                | DEFERRED |
| 072 | [Copy a Local library to cloud](072-copy-local-library-to-cloud.md)                                         |    P2    |   XL   | HIGH | 064, 070, 071                               | DEFERRED |
| 073 | [Enable accountless Discogs connection](073-enable-accountless-discogs-connection.md)                       |    P2    |   XL   | HIGH | 049, 059, 062, 067, 071                     | DEFERRED |
| 074 | [Persist resumable enrichment reviews](074-persist-resumable-enrichment-reviews.md)                         |    P2    |   L    | HIGH | 045, 064, 065, 066, 069, 071                | DONE     |
| 075 | [Build the track Evidence workbench](075-build-track-evidence-workbench.md)                                 |    P2    |   L    | HIGH | 045, 063, 064, 068, 070, 074                | BLOCKED  |
| 076 | [Enable the offline Local app shell](076-enable-offline-local-app-shell.md)                                 |    P3    |   L    | MED  | 053, 058, 062, 065, 066, 071                | DEFERRED |

Historical prerequisites named inside older plans have landed. The table lists
only active dependencies.

## Finding coverage

Every retained audit finding has one owning plan:

| Finding                                                 | Owning plan                   |
| ------------------------------------------------------- | ----------------------------- |
| F1 account-deletion completion identity                 | 057                           |
| F2 whole-file audio decode before the 180-second window | 058                           |
| F3 trailing-slash `SITE_URL` CORS failure               | 059                           |
| F4 adjusted BPM/source-deck history                     | 048 (expanded)                |
| F5 stale profile read overwrites settings write         | 060                           |
| F6 Discogs folder/snapshot ownership                    | 061                           |
| F7 stale record-search snapshots                        | 044 (expanded)                |
| F8 runtime configuration bootstrap/fail-fast            | 051 (expanded)                |
| F9 missing browser containment headers                  | 062                           |
| F10 whole-result rendering/cover signing                | 063                           |
| F11 serial enrichment persistence                       | 064                           |
| F12 blocking Rekordbox XML parse                        | 065                           |
| F13 pitch-driven full sorting                           | 055 (expanded, profile-gated) |
| F14 IndexedDB churn/cache growth/Worker residency       | 066                           |
| F15 cleanup failure-path request fan-out                | 050 (expanded)                |
| F16 Deno/action/Playwright supply-chain gaps            | 052 (expanded)                |
| F17 duplicated Discogs transfer orchestration           | 067                           |

Plan 046 was also expanded for late completions in track-details and manual-
record-create dialogs. Plan 052 corrects the README/config contradiction around
`verify_jwt = false` while retaining handler authentication; this is not treated
as an authentication bypass.

## Product direction coverage

The product program deliberately uses `Local library` / `This browser`, not
`guest`. Browser persistence and Crate Guide backup remain distinct promises.
The maintainer deferred the accountless program on 2026-07-28 without changing
the requirement that Discogs acquisition is core. Its verified foundation is
preserved at `codex/accountless-mode-foundation` (`3253e15`).

| Direction                      | Plans              | Launch boundary                                                                                                  |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Signed-out accountless product | 068, 069, 070, 071 | repository contracts, transactional browser storage, portable recovery, and honest storage UX must ship together |
| Portable backup/export         | 070                | cloud/browser export plus strict restore-as-new Local library; merge deferred                                    |
| Cloud adoption without lock-in | 072                | copy to a proven-empty account, verify, retain Local source; no sync/merge                                       |
| Accountless Discogs            | 073                | device-scoped server integration only after official provider/threat-model gate                                  |
| Resumable enrichment reviews   | 074                | one sanitized device-local draft per workspace; always rematch before restoring staging                          |
| Provenance workbench           | 075                | bounded latest Evidence model, not history/ground truth; no automatic overwrite                                  |
| Fresh offline reopening        | 076                | versioned first-party app shell only; APIs/private URLs/library data excluded from Cache Storage                 |

## Recommended delivery waves

1. **Immediate correctness/safety**: run 044, 045, 048, 050, 056, 057, 059, and
   061 in parallel only where files do not overlap.
2. **Dependent correctness and gates**: 046/047 after 044; 049/051 after 059;
   058 after 056; 060 after 057; 052 after 051; 062 after 052/059.
3. **Scale and structural seams**: 054 after 044/046; 055 after 045/048; 064
   after 044/052; 066 after 058; 067 after 049/061.
4. **Budgets, parsing, and workbench scale**: 053 after 052/054/055; 065 after
   045/052/053; 063 after the bundle, cover, verification, and reconciliation
   seams are stable.
5. **Local foundation**: 068 after correctness/domain seams, then 069. Build 070
   on both; do not open signed-out routes earlier.
6. **Deferred Local launch**: 071 remains out of the current scope; if resumed,
   launch only after security, scale, bounded audio, durable Local writes,
   portable restore, and core Discogs acquisition pass together.
7. **Remaining expansion**: 074 is complete. Plan 075 waits for Plan 070 archive
   compatibility. Plans 072, 073, and 076 remain deferred with the Local launch.

Do not overlap plans that share hotspots. In particular sequence:

- 044 -> 046/047 -> 054; 044 -> 064/067 -> 068;
- 045 -> 055; 053 -> 065 -> 074 -> 075;
- 048 -> 055 -> 068;
- 059 -> 049 -> 067 -> 073;
- 059 -> 051 -> 052 -> 062/064; 052/054/055 -> 053 -> 065;
- 056 -> 058 -> 066;
- 057 -> 060 -> 068;
- 062 -> 071/073;
- 061 -> 067;
- 068 -> 069 -> 070 -> 071.

## Deliberately deferred or rejected approaches

- **Supabase anonymous/fake users for Local mode**: rejected; they create remote
  identity/profile state and do not provide the promised browser-only library.
- **Mutable demo mode**: rejected; its in-memory Pinia is intentionally
  disposable and read-only.
- **Silent local/cloud merge or bidirectional sync**: deferred; manual records,
  Discogs uniqueness, tracks, crates, and saved sets need durable origin mapping
  plus a dedicated conflict workbench.
- **Browser-held Discogs provider secrets**: rejected unless current official
  provider/security evidence explicitly changes the Plan 073 decision.
- **Calling IndexedDB a backup or promising automatic background file backup**:
  rejected. `persist()` can reduce automatic eviction risk but cannot protect
  against user clearing, private-session closure, profile/device loss, or every
  browser policy.
- **Claiming a full provenance history**: rejected for the bounded Evidence
  model. Append-only history would require a separate normalized retention and
  privacy design.
- **Server pagination as the first scale fix**: deferred because session and
  enrichment currently require complete local collections; virtualize rendering
  first.

The prior audit's negative findings remain negative: no current RLS/IDOR,
public private-cover exposure, callback substitution, unsafe auth redirect,
tracked secret, or handler-authentication bypass was established. Do not create
remediation plans for those without new evidence.

## Completion definition

The remediation queue is complete only when every F1-F17 owner passes its
focused/full gates and no STOP condition was bypassed. The Local library launch
is complete only when transactional browser storage, portable recovery, clear
storage/backup UX, auth transition isolation, security headers, scale budgets,
and bounded local analysis all pass together. Product follow-ons retain their
own completion gates; a plan file or green local test is not hosted/provider
proof.
