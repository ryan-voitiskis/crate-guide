# Crate Guide Implementation Plans

Plans 001–023 address all 23 engineering findings from the repository-wide code-quality audit. Plans 024–043 address issues discovered while executing and independently reviewing the portfolio, including E2E readiness, dependency reproducibility, cross-writer state, stable pagination, runtime compatibility, and durable cleanup closure. Plans 001–023 were prepared against commit `99a570f` on 2026-07-19; each execution-discovered plan records its own later evidence base. All plans are written as independent implementation handoffs for other agents.

The four product-direction ideas from the audit are deliberately not included as remediation plans: resumable enrichment review sessions, portable collection export, a provenance workbench, and a local-only analysis mode were options rather than defects. They should be assessed through separate product discovery instead of being smuggled into a quality-remediation batch.

## Execution rules

- Start every plan with its drift check. `99a570f` is the common planning baseline, not a command to reset later work.
- Execute plans in numeric order unless the dependency column permits otherwise.
- Use one branch and one Conventional Commit per plan. Do not push or open a pull request unless explicitly requested.
- Preserve unrelated worktree changes and stage only the plan's listed files.
- Run `npm run format`, `npm run check:conventions`, and `npm run verify` before every implementation handoff, plus each plan's targeted gates.
- Update the plan status in this index when prerequisites clear, work starts,
  blocks, or completes. Use `TODO`, `READY`, `IN PROGRESS`, `BLOCKED`, or `DONE`.
- Treat every STOP condition as a real handoff boundary. Do not weaken correctness, security, or acceptance criteria to make a plan pass.
- Plans that share files are intentionally ordered. Do not implement overlapping plans concurrently without first rebasing their source evidence and scope.

## Plan index

|   # | Plan                                                                                                               | Priority | Effort | Risk | Depends on                        | Status |
| --: | ------------------------------------------------------------------------------------------------------------------ | :------: | :----: | :--: | --------------------------------- | ------ |
| 001 | [Add the database test gate](001-add-database-test-gate.md)                                                        |    P2    |   S    | LOW  | —                                 | DONE   |
| 002 | [Enforce database type parity](002-enforce-database-type-parity.md)                                                |    P3    |   S    | LOW  | —                                 | DONE   |
| 003 | [Add CI verification](003-add-ci-verification.md)                                                                  |    P2    |   M    | LOW  | 001, 002                          | DONE   |
| 004 | [Move Discogs OAuth secrets to headers](004-move-discogs-oauth-to-headers.md)                                      |    P1    |   M    | MED  | —                                 | DONE   |
| 005 | [Enforce deploy JWT verification](005-enforce-deploy-jwt-verification.md)                                          |    P2    |   S    | LOW  | —                                 | DONE   |
| 006 | [Add Discogs server rate limits](006-add-discogs-server-rate-limits.md)                                            |    P1    |   L    | MED  | 001, 002                          | DONE   |
| 007 | [Require recent authentication for account deletion](007-require-recent-auth-for-account-deletion.md)              |    P2    |   L    | MED  | —                                 | DONE   |
| 008 | [Patch the Nuxt dependency graph](008-patch-nuxt-dependency-graph.md)                                              |    P1    |   M    | MED  | 003                               | DONE   |
| 009 | [Pin and update the Edge Supabase SDK](009-pin-update-edge-supabase-sdk.md)                                        |    P3    |   M    | MED  | 003                               | DONE   |
| 010 | [Page full-library queries safely](010-page-full-library-queries.md)                                               |    P1    |   M    | MED  | —                                 | DONE   |
| 011 | [Invalidate stale account fetches](011-invalidate-stale-account-fetches.md)                                        |    P2    |   M    | MED  | 010                               | DONE   |
| 012 | [Serialize session autosave](012-serialize-session-autosave.md)                                                    |    P1    |   M    | MED  | —                                 | DONE   |
| 013 | [Make crate membership atomic](013-make-crate-membership-atomic.md)                                                |    P1    |   M    | MED  | 001, 002                          | DONE   |
| 014 | [Make cover cleanup durable](014-make-cover-cleanup-durable.md)                                                    |    P2    |   L    | MED  | 001, 002                          | DONE   |
| 015 | [Fix circular harmony scoring](015-fix-circular-harmony-scoring.md)                                                |    P2    |   S    | LOW  | —                                 | DONE   |
| 016 | [Cancel stale cover inspection](016-cancel-stale-cover-inspection.md)                                              |    P2    |   S    | LOW  | —                                 | DONE   |
| 017 | [Cancel fader animations](017-cancel-fader-animations.md)                                                          |    P2    |   S    | LOW  | 012                               | DONE   |
| 018 | [Use the demo workbench store in crate cards](018-use-demo-workbench-store-in-card-crate.md)                       |    P2    |   S    | LOW  | —                                 | DONE   |
| 019 | [Test the real Essentia worker](019-test-real-essentia-worker.md)                                                  |    P2    |   M    | MED  | 003                               | DONE   |
| 020 | [Index enrichment candidate matching](020-index-enrichment-matching.md)                                            |    P2    |   L    | MED  | 010                               | DONE   |
| 021 | [Optimize track library rendering](021-optimize-track-library-rendering.md)                                        |    P2    |   M    | MED  | 010, 011                          | DONE   |
| 022 | [Refresh Discogs security documentation](022-refresh-discogs-security-docs.md)                                     |    P2    |   S    | LOW  | 004–006, 014, 030–032, 035        | DONE   |
| 023 | [Extract shared track editor fields](023-extract-shared-track-editor-fields.md)                                    |    P3    |   M    | MED  | —                                 | DONE   |
| 024 | [Stabilize workbench E2E readiness](024-stabilize-workbench-e2e-readiness.md)                                      |    P1    |   S    | LOW  | —                                 | DONE   |
| 025 | [Patch test-tooling advisories](025-patch-test-tooling-advisories.md)                                              |    P1    |   S    | LOW  | 008, 019                          | DONE   |
| 026 | [Make login pagination E2E truthful](026-make-login-pagination-e2e-truthful.md)                                    |    P2    |   S    | LOW  | 010, 024                          | DONE   |
| 027 | [Cancel fader work when loading tracks](027-cancel-fader-work-on-track-load.md)                                    |    P2    |   S    | LOW  | 017                               | DONE   |
| 028 | [Coordinate every crate writer through one reconciliation boundary](028-coordinate-crate-state-reconciliation.md)  |    P1    |   M    | MED  | 011, 013                          | DONE   |
| 029 | [Make the CI install and dependency topology reproducible](029-make-ci-install-and-topology-reproducible.md)       |    P1    |   S    | MED  | 003, 008, 025                     | DONE   |
| 030 | [Drain record-cover cleanup backlogs across bounded pages](030-drain-cover-cleanup-backlogs.md)                    |    P1    |   M    | MED  | 014, 029                          | DONE   |
| 031 | [Prevent queued cover paths from becoming current again](031-prevent-obsolete-cover-path-reuse.md)                 |    P1    |   S    | MED  | 001, 002, 014                     | DONE   |
| 032 | [Add a service-owned retry path for deleted-account cover cleanup](032-add-service-owned-account-cover-retries.md) |    P1    |   L    | HIGH | 001, 002, 007, 014, 031           | DONE   |
| 033 | [Close remaining crate reconciliation races](033-close-crate-reconciliation-races.md)                              |    P2    |   M    | MED  | 028                               | DONE   |
| 034 | [Replace mutable offset library pagination](034-replace-offset-library-pagination.md)                              |    P2    |   XL   | HIGH | 010, 026, 033, 036, 038, 039, 041 | DONE   |
| 035 | [Make client cover-cleanup ownership durable](035-make-cover-cleanup-ownership-durable.md)                         |    P1    |   M    | MED  | 030                               | DONE   |
| 036 | [Make library cursor ownership and keys immutable and indexed](036-make-library-cursor-keys-immutable.md)          |    P2    |   L    | HIGH | 001, 002                          | DONE   |
| 037 | [Isolate Nuxt tests from Node WebStorage globals](037-isolate-nuxt-tests-from-node-webstorage.md)                  |    P1    |   S    | MED  | 029                               | DONE   |
| 038 | [Close crate consumer and tombstone follow-ups](038-close-crate-consumer-and-tombstone-follow-ups.md)              |    P1    |   M    | MED  | 033                               | DONE   |
| 039 | [Reconcile rejected crate edit state and return values](039-reconcile-rejected-crate-edit-state.md)                |    P1    |   S    | MED  | 038                               | DONE   |
| 040 | [Close account-cover service progress and isolation gaps](040-close-account-cover-service-review-gaps.md)          |    P1    |   L    | HIGH | 032, 036                          | DONE   |
| 041 | [Bind record cleanup continuations to the originating account](041-bind-record-cleanup-to-originating-account.md)  |    P1    |   L    | HIGH | 035                               | DONE   |
| 042 | [Make account-cover enumeration work-bounded by UUID prefix](042-index-account-cover-enumeration.md)               |    P2    |   S    | MED  | 036, 040                          | DONE   |
| 043 | [Close keyset reconciliation account and concurrency gaps](043-close-keyset-reconciliation-gaps.md)                |    P1    |   L    | HIGH | 011, 012, 033, 034, 041           | DONE   |

## Recommended delivery waves

1. **Foundation:** 001–003 establish database, generated-type, and CI gates used by later schema and dependency work.
2. **Security and dependency controls:** 004–009 remove secret-bearing URLs, enforce authentication layers, add server-side quotas and recent-auth deletion, then update vulnerable or drifting dependencies under CI.
3. **Data completeness and mutation safety:** 010–014 address silent row truncation, stale fetch commits, autosave races, crate membership races, and non-durable cover cleanup.
4. **Focused correctness and state cleanup:** 015–018 fix harmony wraparound, stale cover inspection, orphaned fader animations, and the duplicate demo state path.
5. **Test and performance depth:** 019–021 exercise the real worker boundary, index enrichment matching, and remove avoidable track-library render/storage work.
6. **Final reconciliation:** 022 documents the security architecture after its dependencies; 023 then removes editor-field duplication independently.

Plan 024 was discovered during execution and should run immediately: its
client-render readiness race can make the full verification gate fail while
reviewing any otherwise unrelated plan.

Plan 025 was discovered after Plan 019 introduced a real browser-mode gate.
Run it immediately after Plan 019 so the test server itself does not retain
known critical browser-mode advisories.

Plans 026–027 were discovered by the independent integration review. They are
small, non-overlapping follow-ups and may run in parallel after their listed
dependencies.

Plan 028 was discovered by the independent review of Plan 013. It closes the
client-side cross-writer, account-reset, rollback, and validation boundaries
around the otherwise sound atomic database mutation contract.

Plan 029 was discovered by an exact-runtime integration review. It restores the
CI install path and makes full peer topology plus generated Vue Router type
plugin resolution part of the normal verification contract.

Plans 030–032 were discovered by the independent review of Plan 014. They close
multi-page/transient retry, cover-path reattachment, and deleted-account service
ownership rather than relying on repeated logins or unreachable user sessions.

Plans 033–035 were discovered by independent reviews of the integrated crate
and cleanup follow-ups. They close stale response/version coherence, mutable
offset traversal, post-commit cleanup ownership, and hung-request cancellation.
Plan 036 is the database invariant and index prerequisite discovered while
reviewing Plan 034's proposed cursor trust boundary. Its first `(record_id, id)`
tracks design failed the mandatory representative-plan gate; the revised plan
adds parent-enforced direct track ownership so owner/ID traversal is both
secure and indexable.

Plan 037 was discovered by testing the declared Node engine range beyond CI's
minimum: Node 26 WebStorage accessors shadow Happy DOM inside Nuxt test workers.
Plan 038 is the independent review closure for Plan 033's remaining tombstone,
ordering, return-value, and consumer-feedback gaps. Complete Plan 038 before
Plan 034 extracts and reuses crate ordering behavior.

Plans 039–043 are adversarial-review closure. Plan 039 aligns rejected crate
forms and returned rows with authoritative state. Plan 040 guarantees all-depth
service cleanup progress, fair leases, and non-blocking ordinary responses.
Plan 041 carries account ownership through record mutations and their cleanup
continuations. Plans 039 and 041 must precede Plan 034 because they share crate
and record store reconciliation boundaries. Plan 042 makes Plan 040's bounded
enumeration index-backed under generic planning and restores displaced wide-tree
coverage; it can execute independently of Plan 034. Plan 043 closes Plan 034's
independent-review findings by binding track writers to account context,
coalescing saved-set loads with explicit local-write provenance, and proving
crate reconciliation under a deletion between keyset pages.

Within a wave, plans without dependencies can be assigned independently only when their scopes do not overlap. The following groups should remain sequential:

- 001/002 → 003 because the two foundation gates are independent prerequisites
  that converge before CI adopts both verification entry points.
- 004 → 006 → 022 because they share Discogs handler contracts and documentation.
- 010 → 011 → 020/021 because they touch account/library stores and depend on complete library retrieval.
- 013/014 must follow generated database type enforcement before adding RPCs/tables.
- 008/009 follow CI so dependency and Deno import changes are checked by a durable gate.

## Audit finding coverage

| Audit finding                                                          | Addressed by                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| 01. OAuth secrets/tokens appear in request URLs                        | [004](004-move-discogs-oauth-to-headers.md)            |
| 02. Default Supabase row limits silently truncate full-library fetches | [010](010-page-full-library-queries.md)                |
| 03. Session autosaves can complete out of order                        | [012](012-serialize-session-autosave.md)               |
| 04. Crate membership read-modify-write can lose concurrent updates     | [013](013-make-crate-membership-atomic.md)             |
| 05. Discogs proxying has no authoritative server-side quota            | [006](006-add-discogs-server-rate-limits.md)           |
| 06. The Nuxt dependency graph includes a known production advisory     | [008](008-patch-nuxt-dependency-graph.md)              |
| 07. Fetches can commit data for a superseded account                   | [011](011-invalidate-stale-account-fetches.md)         |
| 08. Deploy configuration bypasses gateway JWT verification             | [005](005-enforce-deploy-jwt-verification.md)          |
| 09. Account deletion lacks a recent-authentication gate                | [007](007-require-recent-auth-for-account-deletion.md) |
| 10. Failed cover deletion is not retried durably                       | [014](014-make-cover-cleanup-durable.md)               |
| 11. Harmonic scoring mishandles circular wraparound                    | [015](015-fix-circular-harmony-scoring.md)             |
| 12. Stale cover inspection can overwrite current state                 | [016](016-cancel-stale-cover-inspection.md)            |
| 13. Fader animation frames survive superseding work/unmount            | [017](017-cancel-fader-animations.md)                  |
| 14. Enrichment matching scans every candidate per source row           | [020](020-index-enrichment-matching.md)                |
| 15. Track rendering repeats linear lookups and cover signing           | [021](021-optimize-track-library-rendering.md)         |
| 16. Crate cards bypass the workbench/demo store abstraction            | [018](018-use-demo-workbench-store-in-card-crate.md)   |
| 17. SQL tests are not included in the normal verification gate         | [001](001-add-database-test-gate.md)                   |
| 18. Worker tests bypass the real Essentia worker boundary              | [019](019-test-real-essentia-worker.md)                |
| 19. Source verification is not enforced by repository CI               | [003](003-add-ci-verification.md)                      |
| 20. Discogs security/integration documentation is stale                | [022](022-refresh-discogs-security-docs.md)            |
| 21. Edge Supabase SDK imports float independently                      | [009](009-pin-update-edge-supabase-sdk.md)             |
| 22. Generated database types are not enforced against schema           | [002](002-enforce-database-type-parity.md)             |
| 23. Track editor field UI is duplicated across dialogs                 | [023](023-extract-shared-track-editor-fields.md)       |

Every audited engineering finding maps to exactly one primary plan. Dependencies may add enabling work, but no finding relies on an implicit follow-up.

## Execution-discovered remediation

| Finding                                                                                                   | Addressed by                                                |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Complete E2E verification intermittently reads the `/demo` shell before client rendering finishes         | [024](024-stabilize-workbench-e2e-readiness.md)             |
| The new browser-mode test dependency is pinned to a release with critical advisories                      | [025](025-patch-test-tooling-advisories.md)                 |
| Login E2E records table access before the new pagination chain throws                                     | [026](026-make-login-pagination-e2e-truthful.md)            |
| A fader animation can commit pitch after its deck loads a replacement track                               | [027](027-cancel-fader-work-on-track-load.md)               |
| Membership reconciliation excludes fetch, metadata, cleanup, rollback, and account reset boundaries       | [028](028-coordinate-crate-state-reconciliation.md)         |
| The CI-pinned npm cannot install the lockfile and typecheck omits a Vue Router plugin                     | [029](029-make-ci-install-and-topology-reproducible.md)     |
| One client invocation leaves jobs beyond the Edge 100-row page and does not retry transient load failures | [030](030-drain-cover-cleanup-backlogs.md)                  |
| A queued path can be reattached between the database reference check and Storage deletion                 | [031](031-prevent-obsolete-cover-path-reuse.md)             |
| Post-account-deletion cleanup failures retain work that no authenticated user can drain                   | [032](032-add-service-owned-account-cover-retries.md)       |
| Delayed crate responses can poison version floors, resurrect deletes, or report false membership success  | [033](033-close-crate-reconciliation-races.md)              |
| Offset pagination can omit a row when an earlier page is deleted between requests                         | [034](034-replace-offset-library-pagination.md)             |
| Post-commit cleanup can join pre-commit work, lose retry eligibility, or hang indefinitely                | [035](035-make-cover-cleanup-ownership-durable.md)          |
| Library UUID keys can move and tracks lack an indexable direct ownership cursor                           | [036](036-make-library-cursor-keys-immutable.md)            |
| Node 26 experimental WebStorage globals shadow the Nuxt test DOM environment                              | [037](037-isolate-nuxt-tests-from-node-webstorage.md)       |
| Fetch omission, response-order insertion, and dialog consumers can misreport crate outcomes               | [038](038-close-crate-consumer-and-tombstone-follow-ups.md) |
| Rejected crate edits retain stale fields and accepted updates can return unreconciled membership          | [039](039-reconcile-rejected-crate-edit-state.md)           |
| Deep Storage paths, oldest live rows, and inline opportunism can stall account cleanup                    | [040](040-close-account-cover-service-review-gaps.md)       |
| Post-reset record mutation cleanup can target and clear the replacement account                           | [041](041-bind-record-cleanup-to-originating-account.md)    |
| Bounded account-cover enumeration still scans and sorts the entire shared bucket                          | [042](042-index-account-cover-enumeration.md)               |

## Findings considered and not planned

The audit investigated and rejected the following candidate findings based on current source and schema evidence. They should not be reopened without new evidence or architecture drift:

- **Direct credential-table RLS/IDOR exposure:** browser clients do not have a credential getter path; handlers scope service-role access to a server-verified user ID.
- **Public record-cover exposure:** the cover bucket and policies are private; application access uses signed URLs.
- **OAuth callback token substitution:** callback state and request-token verification bind the exchange to the authenticated flow.
- **Unsafe post-auth redirect:** the redirect path is constrained to an internal application destination.
- **Tracked production secret:** reviewed configuration/examples contained placeholders rather than a committed live credential.

These rejections do not waive the planned defense-in-depth work. Plans 004–007 and 022 still improve transport, gateway checks, quotas, sensitive-action authentication, and documentation around the verified architecture.

## Completion definition

This remediation program is complete only when:

- all remediation rows above are `DONE`;
- every plan's targeted tests and repository gates pass on its final branch;
- schema-changing plans include passing local database tests and regenerated type parity;
- the final dependency audit has no unreviewed production advisory;
- current security documentation matches the implemented handlers, configuration, migrations, and gates;
- no plan's STOP condition was bypassed or silently relaxed;
- the final integration branch is clean and contains no unrelated user changes.
