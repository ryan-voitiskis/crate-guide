# Implementation Plans

Generated and reconciled by the improve skill on 2026-07-12. Plans 001–002 are
completed history. Plans 003–016 are the implementation portfolio from the
deep code-quality, readability, organization, and conventions audit at commit
`004d548`. Plan 018 and Plans 025–032 are the login/logout and
account-lifecycle portfolio planned at commit `d78d42a`.

Execute in dependency order, not merely numeric order. Every executor must read
its selected plan fully, run the drift check, honor STOP conditions, and update
its status row when done unless a reviewer explicitly owns the index.

## Execution order and status

| Plan | Title                                                                                                               | Priority | Effort | Depends on                   | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------------------------- | ------ |
| 001  | [Redesign the session track picker around physical records](001-record-first-session-track-picker.md)               | P1       | M      | —                            | DONE   |
| 002  | [Attach the load-track dialog hook to real DOM](002-attach-load-track-dialog-hook.md)                               | P1       | S      | 001                          | DONE   |
| 003  | [Restore the browser E2E baseline](003-restore-browser-e2e-baseline.md)                                             | P1       | S      | —                            | DONE   |
| 004  | [Integrate Deno Edge runtime verification](004-integrate-edge-runtime-verification.md)                              | P1       | M      | —                            | DONE   |
| 005  | [Make maintenance tooling safe and composable](005-make-maintenance-tooling-trustworthy.md)                         | P1       | M      | 003, 004                     | DONE   |
| 006  | [Add rendered workflow characterization](006-add-rendered-workflow-characterization.md)                             | P1       | L      | 003, 005                     | DONE   |
| 007  | [Retire disabled ingestion and unused APIs](007-retire-disabled-and-unused-code.md)                                 | P2       | M      | 006                          | DONE   |
| 008  | [Make user-data loading truthful](008-make-user-data-loading-truthful.md)                                           | P1       | M      | 007                          | DONE   |
| 009  | [Validate Supabase JSON boundaries](009-validate-supabase-json-boundaries.md)                                       | P2       | L      | 007, 008                     | DONE   |
| 010  | [Restore store and domain layering](010-restore-store-and-domain-layering.md)                                       | P2       | M      | 008, 009                     | DONE   |
| 011  | [Consolidate track-editor domain logic](011-consolidate-track-editor-logic.md)                                      | P1       | M      | 006, 007                     | DONE   |
| 012  | [Protect application UI contracts](012-protect-app-ui-contracts.md)                                                 | P1       | M      | 006, 007, 011                | DONE   |
| 013  | [Extract the track-enrichment workflow](013-extract-track-enrichment-workflow.md)                                   | P2       | L      | 006, 008, 009, 012           | DONE   |
| 014  | [Centralize audio-analyzer configuration](014-centralize-audio-analyzer-configuration.md)                           | P2       | M      | 005, 006                     | DONE   |
| 015  | [Enforce component and Tailwind conventions](015-enforce-component-and-tailwind-conventions.md)                     | P2       | M      | 005, 006, 007, 011, 012, 014 | DONE   |
| 016  | [Refresh and archive architecture documentation](016-refresh-architecture-documentation.md)                         | P3       | S      | 003–015                      | DONE   |
| 018  | [Keep email-confirmation failures visible and actionable](018-persist-auth-confirmation-failures.md)                | P1       | S      | —                            | DONE   |
| 025  | [Bind profile and settings work to one authenticated identity](025-bind-profile-work-to-auth-identity.md)           | P1       | M      | 018                          | DONE   |
| 026  | [Make DJ session state safe to reset between accounts](026-reset-session-state-on-account-change.md)                | P1       | M      | —                            | DONE   |
| 027  | [Make Discogs import state safe to reset between accounts](027-reset-discogs-state-on-account-change.md)            | P1       | M      | —                            | DONE   |
| 028  | [Enforce one account lifecycle across logout and route protection](028-enforce-account-lifecycle-and-logout.md)     | P1       | L      | 025, 026, 027                | DONE   |
| 029  | [Gate password reset behind a recovery auth event](029-gate-password-recovery-flow.md)                              | P1       | M      | 028                          | DONE   |
| 030  | [Make login destinations and auth callbacks deterministic](030-make-auth-routing-and-callbacks-deterministic.md)    | P1       | M      | 028                          | DONE   |
| 031  | [Align credential forms with password policy and browser semantics](031-harden-auth-credential-forms.md)            | P2       | M      | 029, 030                     | DONE   |
| 032  | [Align Supabase redirect allowlists with auth callback destinations](032-align-supabase-auth-redirect-allowlist.md) | P1       | S      | 030                          | DONE   |

Status values: `TODO` | `IN PROGRESS` | `DONE` | `BLOCKED (<one-line
reason>)` | `REJECTED (<one-line rationale>)`.

## Recommended waves

### Wave A — Repair false-green gates

- Plan 003 fixes the browser E2E fixture without changing Cloudflare production
  output.
- Plan 003 execution added reserved test-only Supabase configuration after the
  runner first reached the browser and removed an ineffective payload-state
  mutation; Supabase behavior remains locally mocked.
- Plan 004 makes the Deno 2 Edge checker/linter/test task real and fixes the
  proven nullable OAuth credential bug.
- Plan 004 execution expanded to include the required stable Deno 2 lock
  refresh for the already-imported `oauth-signature` dependency.
- These two plans are independent and may run in parallel.

### Wave B — Compose trustworthy maintenance tooling

- Plan 005 depends on both Wave A plans because it builds the aggregate
  read-only `verify` command from their green scripts and makes type generation
  failure-safe.

### Wave C — Establish rendered refactor safety

- Plan 006 depends on the repaired browser/aggregate gates. It adds the Nuxt
  runtime project and characterizes UI, Worker, cache, and high-risk interaction
  contracts used by later refactors.

### Wave D — Reduce surface before editing shared stores

- Plan 007 deletes the unreachable Beatport ingestion pipeline and only APIs
  proven caller-free. It deliberately retains historical `beatport_data` and
  the active `getCratesContainingRecord` action.

### Wave E — Correct data contracts and active UI seams

- Plan 008 fixes fetch outcomes after Plan 007 stabilizes track/crate files.
- Plan 011 centralizes track-editor domain logic after Plan 007 stabilizes the
  track dialogs.
- Plan 014 centralizes analyzer configuration after the Worker tests exist.
- Plans 008, 011, and 014 may run in parallel after their dependencies.

### Wave F — Validate persisted data and protect UI wrappers

- Plan 009 builds on the truthful fetch contracts and adds JSON decoders.
- Plan 012 follows Plan 011 because both touch the track dialogs; it moves app
  loading/hit-area/labelled-divider behavior out of generated primitives.
- Plans 009 and 012 may run in parallel.

### Wave G — Architectural extractions

- Plan 010 follows Plans 008–009 so store ownership uses the final fetch and
  persisted-session contracts.
- Plan 013 follows the data and UI contract plans, then extracts the enrichment
  route workflow without touching matcher/Worker semantics.
- Plan 015 follows the UI/audio/deletion work so it renames and style-migrates
  only the final surviving component set.
- Plans 010 and 013 may run in parallel. Plan 015 can begin once its listed
  dependencies, including Plan 014, are DONE.

### Wave H — Record the implemented architecture

- Plan 016 runs last. It updates README/agent/architecture docs and archives the
  completed security audit based on live final source and commands.

## Auth lifecycle portfolio orchestration

- Plan 018 establishes truthful OTP outcomes and persistent confirmation errors.
- Plans 025–027 make profile, session, and Discogs state identity-safe.
- Plan 028 integrates those reset contracts into logout and route protection.
- Plans 029–030 gate password recovery and preserve safe callback destinations.
- Plan 031 aligns credential forms with the final recovery and routing behavior.
- Plan 032 records the local and hosted callback allowlist contract.

The portfolio was executed in one isolated integration worktree, reviewed one
commit at a time, and closed with the full verification gate, production build,
and a real-browser logout/deep-link regression walkthrough.

## Audit finding coverage

| Audit finding                                                         | Covered by |
| --------------------------------------------------------------------- | ---------- |
| Broken browser E2E gate                                               | 003        |
| Edge runtime outside root verification / conflicting Deno config      | 004, 005   |
| User-data load failures marked successful                             | 008        |
| Duplicated track editors and millisecond/second dirty bug             | 011        |
| Application behavior embedded/lost in generated primitives            | 006, 012   |
| Missing rendered/Worker/cache characterization                        | 006        |
| Permanently disabled Beatport pipeline                                | 007        |
| Enrichment route owns workflow/persistence/view state                 | 013        |
| Supabase JSON assertions at state boundaries                          | 009        |
| Cross-store direct mutations                                          | 010        |
| Test-maintained dead APIs and crate edit branch                       | 007        |
| Shared/pure modules depend upward on UI/store modules                 | 010        |
| Tailwind/type-first conventions violated and unenforced               | 015        |
| Production and benchmark analyzer defaults can drift                  | 014        |
| Destructive database type-generation command / incomplete format gate | 005        |
| Stale Discogs/security/testing/enrichment documentation               | 016        |
| Confirmation failure leaves a blank page                              | 018        |
| Profile fetch/settings queue can cross authentication identities      | 025        |
| DJ session/saved-set state survives account transitions               | 026, 028   |
| Discogs folder/import state survives account transitions              | 027, 028   |
| Protected UI remains rendered after logout/session loss               | 028        |
| Blanket `/auth/*` exemption exposes authenticated callback routes     | 028        |
| Logout scope conflicts with current-session copy                      | 028        |
| Password update page accepts an ordinary logged-in session            | 029        |
| OAuth denial and hydration failure spin forever                       | 030        |
| Protected deep-link destination is lost through login                 | 030        |
| Credential forms drift from password and browser semantics            | 031        |
| Redirect allowlist omits emitted callback destinations                | 032        |

## Findings considered and rejected or deferred

- Split `sessionStore` solely because it is large: rejected. It remains one
  coherent session domain with strong store coverage; Plans 009–010 extract
  only concrete persistence/type/ownership seams.
- Rewrite Nuxt auto-imports or adopt a repository-wide feature-folder layout:
  rejected as churn without a demonstrated failure. Plans target specific
  dependency directions and service boundaries instead.
- Add an elaborate discriminated enrichment source hierarchy now: deferred.
  Two sources do not justify it; Plan 013 creates one shared initializer that a
  third source can use before revisiting the type model.
- Split the full/compact pitch-fader implementation now: deferred until Plan
  006's rendered interaction layer is established and a separate behavior
  audit defines safe pointer/orientation parity.
- Move every I/O-shaped module out of `utils` in one sweep: rejected. Targeted
  moves should occur only when a selected plan already changes that module.
- Drop the rate-limit table/RPC when deleting Beatport: deferred. It requires a
  forward migration, local DB verification, and regenerated types, which would
  turn a low-risk dead-code plan into a deployment change.
- Build a general Edge handler framework in Plan 004: rejected for this
  portfolio. A pure credential-validation test closes the proven gate with much
  less risk; handler extraction should be driven by a concrete future change.
- Encode semantic type-first naming with an exhaustive prefix allowlist:
  rejected. Plan 015 automates only mechanically defensible cases and keeps
  ambiguous domain naming under human review.
- Add a global logout button now: deferred. Existing Settings copy promises the
  current session, so Plan 028 uses local scope. An all-devices action needs
  separate product copy and confirmation.
- Claim the client recovery gate enables Supabase Secure password change:
  rejected. That is a hosted setting; Plan 029 fixes the application state
  machine only.

## Tracker maintenance

- A plan is `DONE` only after its own done criteria and verification gates pass.
- If source drift invalidates a current-state excerpt or assumption, mark the
  plan `BLOCKED (<reason>)`; do not silently redesign it while executing.
- When a plan changes a command or path used by a later plan, update the later
  plan and record the reconciliation in the implementing review.
- Preserve completed Plans 001–002 and monotonic numbering; never recycle a
  number.
