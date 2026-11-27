# Crate Guide Implementation Plans

This directory contains active, self-contained implementation plans. Completed
plans are removed only after their code and verification evidence are confirmed;
Git history retains the handoffs and completion commits.

Plans 044-069, 074 and 075 were completed and removed on 2026-11-18. Their
handoffs, finding coverage and delivery sequencing remain available at the git
tag `archive/local-library-2026-11`, and their evidence ledger is
[implementation-evidence-2026-07-22.md](implementation-evidence-2026-07-22.md).
Plan 079 (tap tempo, the Camelot key picker and record annotation mode) was
completed and removed on 2026-11-25. It shipped in PRs #42-#44 (`7b7e3f6`,
`537dc41`, `5acb301`); manual BPM and key entry is documented in
[track-enrichment.md](../docs/track-enrichment.md).
The [November audit](../docs/codebase-audit-2026-11-18.md) records the current
quality and performance programme.

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

## Remaining plans

|   # | Plan                                                                                  | Priority | Effort | Risk | Status   |
| --: | ------------------------------------------------------------------------------------- | :------: | :----: | :--: | -------- |
| 070 | [Add portable library archives](070-add-portable-library-archives.md)                 |    P1    |   XL   | HIGH | DEFERRED |
| 071 | [Launch signed-out Local libraries](071-launch-signed-out-local-library.md)           |    P1    |   XL   | HIGH | DEFERRED |
| 072 | [Copy a Local library to cloud](072-copy-local-library-to-cloud.md)                   |    P2    |   XL   | HIGH | DEFERRED |
| 073 | [Enable accountless Discogs connection](073-enable-accountless-discogs-connection.md) |    P2    |   XL   | HIGH | DEFERRED |
| 076 | [Enable the offline Local app shell](076-enable-offline-local-app-shell.md)           |    P3    |   L    | MED  | DEFERRED |
| 082 | [First-run checklist and Phase 0 positioning](082-first-run-checklist.md)             |    P1    |   S    | LOW  | DONE     |

[077](077-stabilisation-foundation.md) and
[078](078-recovery-and-draft-ownership.md) record the stabilisation and recovery
programme and its remaining operational follow-ups.

The implementation code for the deferred Plans 070-073 and 076 has been
removed, together with Plan 069's catalog and library repository and the
local-to-cloud copy, workspace transition, startup selection, backup reminder,
and storage-health label policies. Production keeps only the device-draft
storage kernel used by resumable enrichment reviews, and the IndexedDB schema is
unchanged. The removed code is recoverable from the git tag
`archive/local-library-2026-11`. A resumed plan must start from that tag and
re-prove its guarantees against the current schema; see
[`docs/library-repository-architecture.md`](../docs/library-repository-architecture.md).
The maintainer deferred the accountless program on 2026-07-28 without changing
the requirement that Discogs acquisition is core; its earlier foundation is
preserved at `codex/accountless-mode-foundation` (`3253e15`).

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
