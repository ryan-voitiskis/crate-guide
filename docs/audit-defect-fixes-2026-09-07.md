# Audit defect fixes — 7 September 2026

Implementation follow-up to [the codebase audit](./codebase-audit-2026-09-07.md), covering A1–A4. The starting commit is `725357f0929f23358b371221485c0fd6b8ec0719`. These are local changes; no application, Edge Function, or database changes have been deployed to a hosted environment.

## Changes

| Finding                              | Result                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: stale manual track edits         | Both editors capture an independent baseline and submit only changed fields. Cloud and browser repositories condition the write on the captured `updated_at` value. A rejected stale edit reloads the latest data and preserves form input. The user can review the saved changes, retain their own edits, and explicitly retry against the newer version. Key/mode and time-signature pairs remain atomic. |
| A2: abandoned enrichment preparation | Applying becomes busy before asynchronous preparation starts. Preparation checks its original operation, workspace, draft permissions, and page lifetime before dispatch. Reset, lease loss, page departure, or disposal cancels pending preparation; duplicate starts are ignored. Results of already-dispatched writes retain the existing reconciliation and receipt flow.                               |
| A3: route-policy disagreement        | Authentication, return-path validation, and Cloud runtime loading share one route policy. Static routes accept the router's case-insensitive matching and optional trailing slash, while preserving the original query and hash. Public and Demo routes retain their access classification.                                                                                                                 |
| A4: queued cleanup shown as failure  | Account deletion returns an explicit cleanup state. The client recognises current and legacy queued responses as successful background cleanup, and reserves cleanup warnings for failed or unconfirmed states. Existing response fields remain available to older clients.                                                                                                                                 |

The timestamp migration advances the version on every track update, including multiple updates within one database transaction and the first edit of a legacy null version. It does not rewrite existing track data. The migration has been applied to the existing local Supabase stack; transactional database fixtures leave application data intact.

## Release dependency

Apply `supabase/migrations/20260907110000_make_track_edit_versions_monotonic.sql` before releasing the track-editor change. Include the updated `delete-account` Edge Function and application in the release. The new client also understands the previous Edge response, and the new Edge response retains its previous fields for older clients.

The migration is compatible with older application code. An application rollback does not require reverting the timestamp trigger. Broader structural cleanup from the audit remains a separate follow-up.

## Validation

Validation used Node 24.18.1 and an exact `npm ci` installation. The lockfile and declared dependency versions are unchanged. Full application verification used `BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1` and `LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS=0`, matching CI. The production build used the CI test-only Supabase configuration.

| Check             | Result                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`  | Passed, exit 0; formatting, lint, type checking, conventions, and all included tooling checks passed.                                                                            |
| Application tests | 158 files; 2,513 tests passed.                                                                                                                                                   |
| E2E tests         | 8 files; 26 passed, 1 pre-existing conditional test skipped; Chromium, Firefox, and WebKit matrix required.                                                                      |
| Browser tests     | 10 files; 82 tests passed, including the actual IndexedDB track-edit conflict/retry regression.                                                                                  |
| Edge Functions    | Type checking and lint passed; 146 tests passed; frozen imports checked.                                                                                                         |
| Local database    | 14 pgTAP files; 473 assertions passed, including stale updates, null versions, same-transaction version advancement, and ownership. Generated types matched the migrated schema. |
| Production build  | Passed; generated security headers and client bundle budget passed. Initial JavaScript is 1,106,372 raw / 348,905 gzip bytes.                                                    |

The A1 and A2 regressions were reproduced before their fixes. Added coverage includes both editor surfaces, conflict review/retry, coupled musical values, asynchronous cancellation, duplicate apply starts, cold route variants and subsequent navigation, and compatibility with current and older account-cleanup responses. The final route assertions use the rendered empty-library state of their synthetic fixture.

Local logs: [full verification](/tmp/crate-guide-fixes-complete-verify.log), [focused editor and page checks](/tmp/crate-guide-fixes-final-focused.log), [route checks](/tmp/crate-guide-fixes-final-routing.log), [build](/tmp/crate-guide-fixes-build.log), and [build artifact checks](/tmp/crate-guide-fixes-build-checks.log). This record retains the results after temporary logs expire. Physical-device audio timing and hosted production journeys were not exercised.
