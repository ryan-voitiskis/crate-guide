# Crate Guide v2 codebase analysis

Reviewed on 7 September 2026. Source baseline: `725357f0929f23358b371221485c0fd6b8ec0719` on `main`.

This report records the original audit baseline. The subsequent A1–A4 implementation and validation are recorded in [the defect-fix follow-up](./audit-defect-fixes-2026-09-07.md).

## Recommendation

Fund a focused stabilisation and simplification programme. Start with the four concrete defects below, then reduce the responsibilities concentrated in enrichment and separate current device-draft persistence from deferred Local-library functionality. Keep the existing Nuxt, Pinia, repository, and Supabase architecture.

The codebase contains considerable complexity, but much of it protects real production behaviour: account changes during requests, concurrent writes, resumable reviews, uncertain batch outcomes, private cover lifecycle, and historical saved sets. The highest-value cleanup will make those rules easier to understand and apply consistently. Removing them, introducing a new framework, or moving everything into generic CRUD helpers would increase risk.

The main problem is uneven integration between well-developed subsystems. The existing suites pass, yet a form can overwrite newer metadata, an abandoned enrichment preparation can still dispatch a write, route classification can disagree with the router, and the account-deletion client misinterprets its server's normal response. These are better starting points than a repository-wide formatting or renaming exercise.

## Scope and baseline

The review covered application bootstrapping and authentication, domain and repository contracts, Cloud/Demo/browser adapters, Pinia mutation and hydration lifecycles, track and record editing, Discogs transfer, enrichment and Evidence persistence, browser drafts, session playback, Edge Functions, migrations and database tests, build boundaries, CI, and release documentation. Investigation combined source tracing, dependency/caller searches, the existing verification suites, two deliberately failing regression reproductions, a local browser reproduction, and public production response inspection.

No application fixes, dependency changes, commits, or deployments were made. The audit's browser authentication was synthetic and local. Database tests used the existing local Supabase stack and transactional fixtures; production account or library writes were not exercised.

### Source and production are different baselines

- Local and remote `main` both resolved to `725357f0929f23358b371221485c0fd6b8ec0719` during review. Its [GitHub verification run](https://github.com/ryan-voitiskis/crate-guide/actions/runs/34109677973) completed successfully for both application and database jobs.
- The public response from [crate.guide](https://crate.guide/) at **10:13:06 UTC on 7 September** contained build ID `255966e6-7b29-4198-84b5-dbb7d3b6af67`. This matches the source-controlled [6 September production evidence](/Users/vz/projects/crate-guide/docs/release-evidence/2026-09-06-d8d76df-production.md:1) for `d8d76dfd7950352d3255807bef9229028d69dc2d`. This association comes from the live build ID and recorded release evidence; a fresh Cloudflare deployment API lookup was not performed.
- The newer source includes the strobe lifecycle fix. The four defect locations below are unchanged between that documented production source and the reviewed head. Their reproductions were local, not observations of affected production users.
- The working checkout's installed dependencies differed from the lockfile in 28 direct packages, including Nuxt, Pinia, TypeScript, and Playwright. Authoritative application verification therefore used an isolated copy with `npm ci`. The user's existing installation was preserved.

### Where complexity sits

These are physical source-line counts, including comments and blank lines, rather than a complexity score. Tests, generated UI, and generated database types were separated from application source. Test counts include fixtures, tooling tests, and SQL tests; application counts exclude CSS and binary assets.

| Area                                                    | Files |  Lines | Interpretation                                                      |
| ------------------------------------------------------- | ----: | -----: | ------------------------------------------------------------------- |
| Application TS/Vue/JS, excluding generated UI and tests |   278 | 62,361 | Substantial for the current product surface                         |
| Shared source                                           |    10 |  1,276 | Domain and cross-runtime contracts                                  |
| Edge source                                             |    29 |  2,792 | Relatively bounded server layer                                     |
| SQL migrations                                          |    33 |  4,788 | Historical schema and integrity contracts                           |
| Tests and fixtures                                      |   252 | 78,869 | Extensive investment; remaining gaps are about interaction coverage |
| Generated UI                                            |   150 |  3,164 | A poor primary target for cleanup                                   |

There are 34 application TypeScript/Vue files longer than 500 lines, including six longer than 1,000. The most relevant hotspots are:

| File                                                                                                                         | Lines | Reason to inspect or split                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ----: | -------------------------------------------------------------------------------- |
| [browserLibraryRepository.ts](/Users/vz/projects/crate-guide/app/repositories/library/browser/browserLibraryRepository.ts:1) | 1,857 | Complete deferred library adapter; separate from the active draft API            |
| [browserLibraryCodecs.ts](/Users/vz/projects/crate-guide/app/repositories/library/browser/browserLibraryCodecs.ts:1)         | 1,622 | Multiple persisted domains and compatibility rules                               |
| [useTrackEnrichmentDraftSession.ts](/Users/vz/projects/crate-guide/app/composables/useTrackEnrichmentDraftSession.ts:1)      | 1,620 | Discovery, ownership, renewal, autosave, recovery, and destructive transitions   |
| [browserWorkspaceCatalog.ts](/Users/vz/projects/crate-guide/app/repositories/library/browser/browserWorkspaceCatalog.ts:1)   | 1,198 | Deferred workspace lifecycle                                                     |
| [PageTrackEnrichment.vue](/Users/vz/projects/crate-guide/app/components/enrichment/PageTrackEnrichment.vue:1)                | 1,189 | Source selection, review, recovery, and apply UI                                 |
| [tracksStore.ts](/Users/vz/projects/crate-guide/app/stores/tracksStore.ts:1)                                                 | 1,083 | Hydration, ordinary mutation, optimistic state, and batch outcome reconciliation |
| [useTrackEnrichmentWorkflow.ts](/Users/vz/projects/crate-guide/app/composables/useTrackEnrichmentWorkflow.ts:1)              |   939 | Parsing, matching, staging, and apply orchestration                              |

The browser repository directory alone contains about **9,300 production source lines**. This is the size of an entangled subsystem, not an estimate of safely deletable code.

## Architecture worth keeping

The shipped application is a Nuxt SPA with Pinia view/cache stores and semantic repository interfaces. Cloud persistence uses Supabase; Demo implements the same read contracts with explicit read-only mutation outcomes. Account identity and Discogs integration have separate ownership from library content. Enrichment additionally persists device-local review state.

| Boundary                      | What is already sound                                                                                                | Cleanup implication                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| UI to persistence             | Domain shapes and repository operations keep Supabase query details out of pages and components                      | Improve the existing boundary; avoid introducing a competing data-access layer       |
| Client to database            | Ownership, relational integrity, privilege, idempotency, and batch/Evidence rules have dedicated database assertions | Preserve enforcement in the database while simplifying callers                       |
| Account and cover lifecycle   | Recent-authentication checks and durable cleanup intent precede account deletion                                     | Correct the response contract without moving unbounded cleanup back into the request |
| Long-running client work      | Parsing/audio workers, bounded caches, virtualised surfaces, and stale-work guards already exist                     | Profile and refine ownership instead of removing these protections                   |
| Verification and dependencies | Locked installs, pinned CI actions, frozen Edge imports, schema parity, and bundle checks are established            | Retain these gates and add the missing integration cases                             |

These boundaries are the foundation for a cleanup. The source does not justify a framework migration, replacement state library, or wholesale server rewrite.

## Four concrete defects to address first

Here, **P1** means prioritise before the next substantial feature tranche because committed data or user intent can be affected. **P2** means a reproducible user-facing defect that should be included in the stabilisation pass. These priorities do not assert a currently observed production incident.

| ID  | Priority | Finding                                                                           | Evidence                                                               |
| --- | -------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A1  | P1       | Manual track editing can overwrite newer, untouched metadata                      | Component regression reproduced; unconditional repository write traced |
| A2  | P1       | Abandoned enrichment preparation can still dispatch a write                       | Deferred-preparation regression reproduced                             |
| A3  | P2       | Trailing-slash routes disagree with authentication and runtime loading            | Local browser reproduction                                             |
| A4  | P2       | Successful deferred account cleanup is presented as a warning requiring attention | Server response and client branch traced directly                      |

### A1. Manual edits can silently replace newer metadata

**Trigger:** open a track editor at BPM 128, let another writer change the track to BPM 140, edit only its title, then save. The editor submits BPM 128 alongside the new title.

The form captures its initial values once in [DialogTrackEdit.vue](/Users/vz/projects/crate-guide/app/components/records/DialogTrackEdit.vue:85). Its save handler passes the entire [editor payload](/Users/vz/projects/crate-guide/app/utils/trackEditor.ts:91), including BPM, key, artists, and other fields, to `updateTrack`. [DialogTrackDetails.vue](/Users/vz/projects/crate-guide/app/components/tracks/DialogTrackDetails.vue:95) uses the same pattern. The [Cloud update](/Users/vz/projects/crate-guide/app/repositories/library/cloud/cloudTracksRepository.ts:213) filters by track and owner, with no persisted version precondition.

The focused Nuxt component reproduction produced:

```text
newerBpm: 140
submittedBpm: 128
submittedTitle: 'Retitled Track'
```

That test inspects the real component's outgoing payload using the existing store fixture. The source trace establishes that an ordinary Cloud update accepts it without a concurrency check. It did not write to production.

Per-entity queues and workspace generations protect other classes of race; they cannot make an old form current or coordinate two clients. Enrichment already has explicit mutation preconditions, which is a useful established pattern.

**Recommended change:** retain an immutable edit baseline, submit only fields the user actually changed, and add an atomic persisted precondition to normal metadata updates. Define conflict behaviour explicitly: preserve the user's input, show the changed current values, and allow a deliberate resolution. A dirty-field patch prevents this particular unrelated-field loss; it does not by itself resolve two writers changing the same field. Audit record and crate metadata editors for the same contract gap after fixing the demonstrated track case.

**Acceptance:** a title-only edit preserves a newer BPM; two edits to the same field produce an explicit conflict; current dialog-generation protections still prevent late completions from closing or changing another dialog. Exercise both track editor surfaces and a real local-database precondition failure.

### A2. Enrichment invalidates an operation after it has already dispatched

In [applyStagedRows](/Users/vz/projects/crate-guide/app/composables/useTrackEnrichmentWorkflow.ts:689), the operation generation is captured before asynchronous preparation. Each `buildTrackEnrichmentUpdate` is awaited, but `isApplying` is set only after preparation, and the first ownership check after preparation occurs **after** `updateTracksBatch` returns.

If the workflow is reset while preparation is awaiting, the old invocation can still set `isApplying`, dispatch the old rows, and then return without clearing the busy state because it no longer owns the operation. Preparation genuinely contains asynchronous work; this is not a purely synchronous theoretical boundary. The read-only draft check also occurs only at entry.

The focused reproduction delayed preparation, called `startAnotherSource()`, then released preparation. It observed:

```text
busyDuringPreparation: false
writesAfterReset: 1
isApplyingAfterReset: true
```

Existing coverage checks reset after batch dispatch, including suppressing stale progress and results. The missing case is invalidation **before** dispatch.

**Recommended change:** mark the entire prepare/apply operation busy before its first await; capture stable source, workspace, and draft-ownership inputs; check ownership after preparation and immediately before dispatch; prevent duplicate starts; put preparation and completion inside an owned `try/finally`. Lease loss must also prevent a still-undispatched apply.

Keep the existing distinction between cancellation before dispatch and an uncertain outcome after dispatch. Cancelling a UI operation cannot promise that an already-issued database write was rolled back; reconcile those outcomes through the established batch/draft receipt path.

**Acceptance:** reset, route departure, duplicate submission, or lease loss during preparation cannot dispatch a superseded batch. Preparation failures clear the correct busy state. Existing partial-result, stale-workspace, and unknown-outcome tests continue to pass.

### A3. Trailing slashes can break navigation and make public pages require login

[requiresCloudWorkbenchRuntime](/Users/vz/projects/crate-guide/app/utils/workbenchRuntimeAvailability.ts:1) compares exact path strings. [Authentication route classification](/Users/vz/projects/crate-guide/app/utils/authRoutes.ts:15) does the same. The router accepts route variants that those sets reject, while the [workbench plugin](/Users/vz/projects/crate-guide/app/plugins/workbench.client.ts:19) and application bootstrap depend on those classifications.

The local browser reproduced both behaviours:

- Opening `/privacy/` while signed out redirected to login with `/privacy/` as the return target.
- Opening `/tracks/` and completing the existing synthetic authentication fixture left the page showing “Authentication complete” and “Sign in successful. Redirecting...” at `/tracks/`. The console reported `No workbench runtime is available. The route runtime must load before its stores.`

This is a navigation/bootstrap defect, not an authentication bypass.

**Recommended change:** establish a single route policy based on canonical route identity or resolved metadata, shared by auth and runtime loading. If canonicalising paths, do so before the initial pathname-based bootstrap decision as well as during navigation. Preserve valid query/hash return targets and the existing unsafe-redirect checks.

**Acceptance:** cold entry, login return, and client navigation work for canonical and trailing-slash forms; public legal pages stay public. Add case-variant coverage where the router accepts it. Demo and public entrypoints retain their intended lazy-loading boundaries.

### A4. The account-deletion UI treats the normal cleanup queue state as exceptional

The [delete-account handler](/Users/vz/projects/crate-guide/supabase/functions/delete-account/handler.ts:249) deliberately returns:

```json
{
	"success": true,
	"cover_cleanup_complete": false,
	"cleanup_queue_complete": false,
	"cleanup_queued": true
}
```

It persists cleanup intent before deleting the auth user; bounded storage traversal belongs to the worker. That is sensible server behaviour.

The [client interpretation](/Users/vz/projects/crate-guide/app/stores/userStore.ts:467) ignores `cleanup_queued`. In the normal current-session success path it displays a 30-second warning that cleanup did not finish and suggests contacting the owner if a cover remains accessible. The state “queued as designed” is therefore indistinguishable from an exceptional incomplete cleanup. This does not mean account deletion itself failed or that the worker is malfunctioning.

**Recommended change:** use an explicit shared cleanup state such as `queued`, `complete`, or `failed`, with a compatible transition for the current response. A successful queued response should give a truthful acknowledgement without implying user intervention is required. Actual worker failures and excessive queue age need an operational signal. Preserve recent-authentication enforcement and enqueue-before-delete ordering.

**Acceptance:** test the actual producer response against the client, rather than a happy-path mock containing only `success: true`. Verify the queued, completed, failed, and local sign-out-failure cases separately.

## Structural cleanup with the best return

### 1. Separate shipped device drafts from deferred Local-library scope

The [plan index](/Users/vz/projects/crate-guide/plans/README.md:35) records **28 completed plans and five deliberately deferred plans**. Portable archives, the signed-out Local product, Local-to-Cloud copying, accountless Discogs, and an offline app shell are not unfinished cleanup obligations. They are product decisions.

Production caller searches found `openBrowserLibraryRepository` and `createBrowserWorkspaceCatalog` only at their declarations; their callers are tests. In contrast, [useTrackEnrichmentDraftSession](/Users/vz/projects/crate-guide/app/composables/useTrackEnrichmentDraftSession.ts:140) actively opens `openBrowserDeviceDraftRepository`.

The complication is that [the active draft repository](/Users/vz/projects/crate-guide/app/repositories/library/browser/browserDeviceDraftRepository.ts:1) imports shared browser schema, types, revisions, broadcasts, and workspace draft operations. Current drafts and future Local work therefore share storage machinery and compatibility history.

First give the active draft subsystem an explicit API and dependency boundary. Then make a product decision about deferred-only adapter and policy code: retain it as a clearly isolated future module with an owner, or remove it from the maintained application after checking dependencies and preserving its history. Keep the deployed IndexedDB schema and upgrade paths required to recover existing drafts. An unused public adapter constructor does not prove that every helper in its directory is unused.

A successful first cleanup PR should make it obvious which code current enrichment needs. File deletion and reduced bundle size are subsequent evidence, not assumptions.

### 2. Extract ownership mechanisms, while retaining domain-specific commands

The application repeatedly coordinates workspace generations, mutation queues, response revisions, optimistic snapshots, and activity counters. Some duplication is an opportunity for small common primitives. Some represents different guarantees and must remain distinct:

| Mechanism                                | What it protects                                             | What it does not establish                        |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Auth/workspace activation generation     | Late work publishing into a replacement account or workspace | Cross-client write conflict detection             |
| Per-entity queue and optimistic revision | Ordering and rollback within the current client              | Whether an editor's initial data is still current |
| Persisted precondition or draft lease    | Database/draft conflict and ownership decisions              | Whether the current UI still owns a completion    |

The [repository architecture contract](/Users/vz/projects/crate-guide/docs/library-repository-architecture.md:47) explicitly says an adapter revision is not a cross-client mutation precondition. A1 illustrates why that distinction matters.

Extract a small operation scope, keyed command queue, or owned activity counter only after writing down its guarantees and applying it to one representative store. Keep record/cover changes, crate membership, saved-set history, and enrichment outcomes as semantic operations. Avoid a generic repository wrapper that obscures their different transaction and recovery rules.

### 3. Split enrichment by lifecycle responsibility

The [draft-session state declarations](/Users/vz/projects/crate-guide/app/composables/useTrackEnrichmentDraftSession.ts:157) reveal why changes are difficult: discovery, lease ownership, hydration, autosave, recovery, replacement, deletion, and UI state are coordinated in one closure. The workflow and page add parsing, matching, staging, and persistence concerns around it.

A useful decomposition would give each of these a small, explicit owner:

- Repository connection and draft discovery.
- Lease acquisition, renewal, takeover, and release.
- Dirty revisions and serialised autosave.
- Resume/replacement/deletion commands and their recovery outcomes.
- Parse/match/review/apply orchestration.
- View sections consuming a stable, typed view model.

Start with the ownership boundary implicated by A2, then extract one lifecycle at a time with unchanged regression outcomes. Keep codecs and persistence compatibility as pure modules. Where workflow dependencies currently accept an entire Pinia store type, narrow them to the operations actually required. Make critical cross-feature imports explicit so the dependency graph remains understandable despite Nuxt auto-imports.

Splitting a long file into several files that share all the same mutable flags would not solve the problem. The goal is fewer reasons to change each owner, with explicit commands and outcomes between owners.

### 4. Improve tests at integration boundaries

The test investment is valuable and should be preserved. Database suites cover ownership, credentials, function privileges, crate integrity, idempotent imports, cover queues, and Evidence writes. Application and browser suites cover many adverse lifecycle cases. The four findings escaped because the existing suites did not combine the relevant behaviours.

Some application E2E tests use [a synthetic Supabase fixture](/Users/vz/projects/crate-guide/test/e2e/fixtures/authenticatedWorkbench.ts:59), while real SQL verification runs separately. That arrangement is useful for deterministic UI tests but does not validate every client/server response contract.

Add a small number of integrated journeys against an isolated local Supabase environment, using synthetic data:

1. Open editor, perform a competing metadata write, save, and verify persisted values or conflict.
2. Review enrichment, invalidate during preparation, and verify that no superseded write occurs; separately exercise a dispatched partial/unknown outcome and reload.
3. Create/update a record with a cover, change crate membership, delete the record, and verify the relevant database and cleanup intent.
4. Delete a synthetic account and verify the actual response, local transition, and durable cleanup state.

Keep exhaustive permutations in focused tests. Add the route variants to browser coverage and draft takeover cases to the existing multi-browser storage matrix. Require a demonstrated failure-before/fix-after test for each new defect. Avoid coverage-percentage targets or wholesale test rewrites.

### 5. Make the operating documentation current

The [staging runbook](/Users/vz/projects/crate-guide/docs/staging-release-runbook.md:8) still calls July 30 observations “Current evidence,” including pending production migrations and absent browser headers. Later release evidence and the public response contradict that as a present-state description. The repository architecture document also describes browser persistence as unavailable without distinguishing the implemented internal adapter from the deferred product launch.

Keep historical release records intact. Add a short current-state entrypoint that identifies the shipped product scope, current release evidence, production/staging identities, runtime versions, migration compatibility, and applicable rollout procedure. Clearly label the old umbrella-portfolio rehearsal as historical. Archive completed plans out of the active working queue while preserving their links and decisions.

The local dependency drift is a related contributor to confusing verification results. Document and automate a quick version/lockfile preflight; use `npm ci` in isolated verification and release environments. The committed dependency graph passed current audits, so another dependency upgrade campaign is not the immediate cleanup need.

## Operational and performance follow-through

### Finish the browser-policy rollout deliberately

The live response enforced `frame-ancestors 'none'`, `base-uri 'self'`, and `object-src 'none'`. The fuller resource policy, including `script-src` and `connect-src`, remained **Content-Security-Policy-Report-Only**, matching [the source policy](/Users/vz/projects/crate-guide/shared/security/browserHeaders.ts:173). The response had no CSP `report-uri` or `report-to` directive. Cloudflare's separate `cf-nel` reporting configuration reports network errors; it is not a CSP collector.

This is a hardening rollout gap, not a demonstrated injection vulnerability. Collect actionable violation evidence, exercise OAuth, covers, fonts, audio workers/WASM, and supported browsers, then promote the tested resource policy to enforcement. Keep reporting minimal and scrub sensitive URLs and user data.

The application uses local toasts and console errors, and Edge handlers have request-oriented logs. The inspected code did not establish a central browser-error pipeline or alerting for aged/failed cleanup work. Establish a small operational view of failed writes, failed auth completion, queue age/retries, and browser failures. Provider-side monitors might already exist; their current configuration was not verified here.

### Verify recoverability before storage changes

The July production evidence records a manual logical backup and restore rehearsal at that time. It does not prove today's backup schedule or restore point. Confirm current database and cover-storage recovery coverage, retention, restore procedure, and responsible owner before shipping schema or persistence cleanup.

Do not substitute the multi-query observed-library view for a coherent backup. The repository correctly labels that view non-atomic. An internal coherent database snapshot capability also does not, by itself, provide a supported user archive or cover-asset backup.

### Measure the next performance constraint before changing data loading

The audited production build passed its existing bundle boundaries:

| Artifact                                | Raw bytes | Gzip bytes |
| --------------------------------------- | --------: | ---------: |
| Initial JavaScript closure              | 1,101,625 |    347,246 |
| Largest ordinary chunk: enrichment page |   127,783 |     36,978 |
| Deferred Essentia WASM asset            | 2,505,805 |    780,903 |

The initial limits are 1,130,336 raw / 361,488 gzip, leaving about 2.5% raw headroom. Cloud runtime, the enrichment route, the device draft repository, and the MPEG metadata parser retained their intended lazy boundaries. The WASM figure is not initial JavaScript cost.

[Cloud track hydration](/Users/vz/projects/crate-guide/app/repositories/library/cloud/cloudTracksRepository.ts:158) fetches all owned pages using `select('*')`, including rich metadata. List virtualisation limits rendering work, but it does not limit total fetched or retained data. This is a plausible future scale constraint; the audit did not establish a current production performance incident.

Measure cold mobile startup, library payload size, memory at representative library sizes, route reactivation, and enrichment preparation time. If those measurements justify it, separate lightweight library summaries from detailed Evidence/audio metadata and load detail on demand. Account for matching and session features that require a whole-library view. Keep audio work and parsing in their current bounded workers.

Strict audio timing budgets were disabled for the functional verification run, as in CI. No new physical-device performance benchmark or production percentile measurement was performed.

### Resolve one playback product ambiguity

[Adjusted BPM/key calculation](/Users/vz/projects/crate-guide/app/stores/sessionPlayback.ts:68) applies pitch but does not use the selected deck RPM relative to the track's source RPM. The platter does use deck RPM. Decide whether the speed selector is intended to affect musical playback calculations or only the visual simulation. If it represents playing a 33⅓ RPM recording at 45 RPM, a nominal 120 BPM would become 162 BPM before pitch; the current calculation still returns 120.

This is recorded as a product-semantics decision, not one of the reproduced defects. Preserve the strobe's separate physical and apparent motion, fixed lamp mask, and stop-phase convergence while making any later playback change.

## Recommended delivery sequence

Use a short ordered backlog, with one behaviour or ownership boundary per PR. Reassess after the first structural extraction before committing to a large programme.

| Stage                                       | Work                                                                                                                             | Completion evidence                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Stabilise                                | A1 and A2 first; A3 and A4 as separate small fixes. Keep any required forward database migration separate from mechanical moves. | Each new regression fails on this baseline and passes with the fix; existing concurrency, database, browser, and batch-outcome suites pass.      |
| 2. Establish the current operating baseline | Update the current-state documentation; verify backup/restore and cleanup monitoring; finish the CSP rollout with evidence.      | A reader can identify the deployed application and backend state; the operational owner can detect failures and follow a verified recovery path. |
| 3. Isolate active persistence               | Extract the device-draft API and dependencies; decide whether deferred Local-only code remains maintained.                       | Current drafts resume and upgrade across supported browsers; active product imports have a clear boundary from deferred functionality.           |
| 4. Reduce lifecycle complexity              | Extract one enrichment lifecycle and one repeated store mechanism as pilots, then expand only where they reduce coupling.        | Fewer independent responsibilities and mutable states per owner, unchanged observable behaviour, preserved stale/conflict semantics.             |
| 5. Optimise measured bottlenecks            | Gather realistic payload, memory, and timing evidence; make targeted data-loading or rendering changes.                          | Measured improvement on the affected journey, no bundle-boundary regression, and no loss of whole-library functionality.                         |

For each PR, keep refactoring separate from intentional behaviour changes where practical. Run the relevant focused tests during development and the repository's required formatting, conventions, and verification gates before handoff. Before release, verify the exact integrated commit, build artifacts, database compatibility, and staging journeys. Schema changes need forward migrations and compatibility with the application versions that can still be served during rollout.

Retain these production invariants throughout:

- Account and workspace changes invalidate old work; queued commands retain their original owner.
- RLS, owner checks, private cover access, and server-side mutation preconditions remain authoritative.
- Record/track/crate relationships and cleanup intent remain transactional where required.
- Enrichment distinguishes confirmed, conflicted, unattempted, and unknown outcomes; drafts retain recovery information.
- Existing Evidence and IndexedDB formats remain readable through their supported upgrade paths.
- Saved-set snapshots preserve history rather than following later library edits.
- Demo remains isolated and read-only, and public routes do not eagerly acquire Cloud transports.

Success should be measured by eliminated defects, clearer ownership, fewer places to change for a feature, verified recoverability, and maintained performance boundaries. Lines deleted are useful evidence only when those properties improve with them.

## Verification record and limits

The baseline was installed from its lockfile in `/tmp/crate-guide-audit-725357f.ccuS5Q`. Full application verification was rerun with Node 24.18.1, `BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1`, and `LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS=0`.

| Check                    | Result                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Full `npm run verify`    | Passed, exit 0, on the final clean Node 24.18.1 run; includes formatting, lint, types, conventions, and tooling checks |
| Application suites       | 158 files; 2,471 tests passed                                                                                          |
| E2E suites               | 8 files; 22 passed, 1 skipped; required Chromium/Firefox/WebKit matrix exercised                                       |
| Browser component suites | 10 files; 81 tests passed                                                                                              |
| Edge suites              | 146 tests passed; check, lint, and six frozen function imports passed                                                  |
| Local database           | 13 pgTAP files; 463 assertions passed; generated types matched the migrated schema                                     |
| Production build         | Passed, including generated security headers and client bundle budget                                                  |
| Dependency audits        | npm production and full graph: zero reported vulnerabilities; Edge frozen graph: nine packages, no advisories reported |
| New targeted regressions | Two deliberately failing tests reproduced A1/A2 in the isolated copy; removed before rerunning the unchanged baseline  |
| Additional browser check | Reproduced A3 using local synthetic authentication                                                                     |

The initial checkout verification was unsuitable as final evidence because its installed graph was stale and the sandbox blocked a local listener. An initial isolated verification later stopped at convention checking because the source archive lacked Git metadata; that audit setup issue was corrected before the final clean rerun. These failures were not classified as application defects. Build and database checks passed separately. After an initial successful build under Node 26.8.1, the build and artifact checks were repeated successfully under Node 24.18.1; the table above uses that final build. Exact-head CI independently passed its Node 24 build.

Useful local investigation artifacts are [the targeted regression patch](/tmp/crate-guide-audit-reproductions.patch), [regression output](/tmp/crate-guide-audit-reproductions.log), [final verification log](/tmp/crate-guide-audit-final-verify.log), [build output](/tmp/crate-guide-audit-node24-build.log), [database output](/tmp/crate-guide-audit-db.log), and [dependency audit output](/tmp/crate-guide-audit-dependencies.log). These temporary files support the investigation; the findings, reproduction triggers, source references, and results are recorded here so the report remains useful after temporary files expire.

Current hosted backup settings, scheduler/alert configuration, remote migration inventory, authenticated production OAuth and write journeys, and production usage/performance telemetry were not revalidated. Those are explicit follow-up checks before the related operational or persistence changes, rather than inferred failures.
