# Crate Guide Implementation Plans

This directory contains only active implementation plans. Completed plans are
removed after their code and verification evidence are confirmed; Git history
retains the original handoffs and completion commits.

Plans 044–056 come from the 2026-07-19 integrated-result re-audit at commit
`aba27ff`. A source review after the auth and Discogs follow-ups confirmed that
their findings remain present, so none of these plans are release-cleanup
candidates yet.

The four product-direction ideas from that audit are deliberately outside this
remediation queue: resumable enrichment review sessions, portable collection
export, a provenance workbench, and a local-only analysis mode. They need
separate product discovery rather than defect plans.

## Execution rules

- Start with the plan's drift check. Its `Planned at` SHA is an evidence
  baseline, never a command to reset later work.
- Preserve unrelated worktree changes and stage only the plan's listed files.
- Use a Conventional Commit for each coherent implementation.
- Run `npm run format`, `npm run check:conventions`, and `npm run verify` before
  handoff, plus every focused gate named by the plan.
- Treat STOP conditions as real handoff boundaries. Do not weaken correctness,
  security, or acceptance criteria to make a plan pass.
- Update this index as work becomes ready, starts, blocks, or completes. Remove
  a completed plan only after its implementation and required gates are
  confirmed.

## Active queue

|   # | Plan                                                                                                     | Priority | Effort | Risk | Active dependencies | Status |
| --: | -------------------------------------------------------------------------------------------------------- | :------: | :----: | :--: | ------------------- | ------ |
| 044 | [Reconcile same-account library writes](044-reconcile-same-account-library-writes.md)                    |    P1    |   L    | HIGH | —                   | READY  |
| 045 | [Correct track input and matching semantics](045-correct-track-input-and-matching-semantics.md)          |    P2    |   M    | MED  | —                   | READY  |
| 046 | [Guard settings and dialog lifecycles](046-guard-settings-and-dialog-lifecycles.md)                      |    P2    |   M    | MED  | —                   | READY  |
| 047 | [Enforce crate membership and record-delete integrity](047-enforce-crate-membership-delete-integrity.md) |    P1    |   L    | HIGH | 044                 | TODO   |
| 048 | [Preserve saved-set coherence and history](048-preserve-saved-set-coherence-and-history.md)              |    P2    |   L    | HIGH | —                   | READY  |
| 049 | [Make Discogs OAuth finalization resumable](049-make-discogs-oauth-finalization-resumable.md)            |    P1    |   M    | HIGH | —                   | READY  |
| 050 | [Bound the account-cleanup lifecycle](050-bound-account-cleanup-lifecycle.md)                            |    P2    |   L    | HIGH | —                   | READY  |
| 051 | [Harden local and Edge tooling](051-harden-local-and-edge-tooling.md)                                    |    P2    |   M    | MED  | —                   | READY  |
| 052 | [Make verification contracts source-truthful](052-make-verification-contracts-source-truthful.md)        |    P2    |   L    | MED  | 051                 | TODO   |
| 053 | [Enforce a client bundle budget](053-enforce-client-bundle-budget.md)                                    |    P3    |   M    | MED  | 052, 054, 055       | TODO   |
| 054 | [Extract record and cover workflows](054-extract-record-cover-workflows.md)                              |    P3    |   L    | MED  | 044, 046            | TODO   |
| 055 | [Decompose session and quality hotspots](055-decompose-session-and-quality-hotspots.md)                  |    P3    |   XL   | MED  | 045, 048            | TODO   |
| 056 | [Make the audio benchmark testable](056-make-audio-benchmark-testable.md)                                |    P3    |   M    | LOW  | —                   | READY  |

Historical prerequisites named inside individual plans have already landed and
are preserved in Git history. The table lists only dependencies that remain in
this active queue.

## Delivery waves

1. Run 044, 045, 046, 048, 049, 050, 051, and 056 independently where their
   scopes do not overlap.
2. Run 047 after 044, and 052 after 051.
3. Run 054 after 044 and 046; run 055 after 045 and 048.
4. Run 053 after 052, 054, and 055 so the bundle baseline measures the intended
   final module boundaries.

Plans that share files must remain sequential. In particular, do not overlap
044/047/054, 045/055, 048/055, 051/052, or 052/054/055 with 053. Plans 049 and
050 both touch Edge/shared documentation and need an explicit rebase before
integration if developed separately.

## Completion definition

The remediation queue is complete only when:

- every active row is implemented and passes its focused and repository gates;
- schema changes include passing local database tests and regenerated type
  parity;
- the final production dependency audit has no unreviewed high-risk advisory;
- current security and integration documentation matches the implemented
  handlers, configuration, migrations, and verification boundaries; and
- no STOP condition was bypassed or silently relaxed.
