# Audit-defect production release

Status: **released; production smoke and synthetic-account cleanup passed**. Completed on 8 September 2026 in Melbourne (7 September UTC).

## Released source and artifact

- [PR #15](https://github.com/ryan-voitiskis/crate-guide/pull/15) released the four audit fixes and forward migration at `8e568acd296f394b8496e2e73d01fb343580086d`.
- Production smoke exposed one additional conflict-review edge case: an untouched 180 ms duration could become null on retry. [PR #16](https://github.com/ryan-voitiskis/crate-guide/pull/16) fixed it and added regressions in the patch builder and both editors. Final released source: `b4a6dbd186ea3541b122951264c84d10c1a3bd94`.
- Production: <https://crate.guide>.
- Cloudflare Pages project: `crate-guide`, production branch `main`.
- Final deployment: `a511fedf-248d-46b8-a827-f5ad1e264890`; [immutable production URL](https://a511fedf.crate-guide.pages.dev).
- Build ID: `bb61232f-6a51-4ba5-96af-4a12b6d21c8f`; built at `2026-09-07T14:34:52.057Z` from a clean detached checkout of the exact merged source.
- Compiled backend: `https://czlfiwivlgqhqezmywfx.supabase.co`. The artifact was checked for accidental staging, local, and test configuration.

The preceding deployment from this release was `0e0a67c5-626a-4928-91af-3a70d706896f` (source `8e568ac`, build `56a64588-241b-4671-9585-634b88e91d45`). The pre-release production baseline was `dd06a247-4053-43be-b898-30f3b2e29c4e` (source `d8d76df`, build `255966e6-7b29-4198-84b5-dbb7d3b6af67`). Cloudflare retains these prior deployments.

## Verification

- The original release passed [candidate CI](https://github.com/ryan-voitiskis/crate-guide/actions/runs/34124808708) and [merged-source CI](https://github.com/ryan-voitiskis/crate-guide/actions/runs/34125514782).
- The duration follow-up passed [candidate CI](https://github.com/ryan-voitiskis/crate-guide/actions/runs/34132803241) and [merged-source CI](https://github.com/ryan-voitiskis/crate-guide/actions/runs/34133492267), both application and database jobs. Candidate `cb6b6a4b9c9ea74209be7291876ecd36f1f38839` and merged source have identical Git trees.
- The original clean checkout passed `npm ci` and `npm run verify:full`, including 473 database assertions and generated-schema parity. The follow-up passed `npm run format` and the complete `npm run verify`: 2,524 application tests, 26 E2E passes with one existing conditional skip, 82 browser tests, 146 Edge tests, and convention/type/lint checks. The required browser matrix was enabled, with the same audio timing setting as CI.
- Before the duration fix, the 180 ms regression failed in the shared patch builder and both editors. After the fix, tests cover null, zero, sub-second, and fractional-second durations.
- The final production-configured build passed security-header and client-bundle-budget checks.
- At `2026-09-07T14:39:41.196Z` (stable origin) and `2026-09-07T14:39:35.101Z` (immutable deployment), ten routes passed HTTP 200, exact-build, production-backend, security-header, and JavaScript-asset checks: `/`, `/login`, `/privacy/`, `/PRIVACY/`, `/tracks/`, `/TRACKS/?genre=House`, `/demo`, `/demo/tracks`, `/demo/records`, and `/demo/enrichment`.

The original artifact also had a hosted preview at <https://54eabc11.crate-guide.pages.dev>. The final duration follow-up was validated locally, in CI, and on the production deployment; no separate follow-up preview was published.

## Hosted database migration

Both hosted projects were verified through the authenticated Supabase dashboard in organization `grxffkeajwssrcfwtxny`:

| Environment | Actual project name | Project ref          | PostgreSQL |
| ----------- | ------------------- | -------------------- | ---------- |
| Production  | crate-guide         | czlfiwivlgqhqezmywfx | 17.6       |
| Staging     | crate-guide-staging | xrekloexiottvfueijgb | 17.6       |

Both had the same 33 preceding migrations through `20260730140000_enable_track_evidence_v2_writes.sql`. The only new migration was `20260907110000_make_track_edit_versions_monotonic.sql`.

The exact migration text and its migration-history entry were applied atomically, first to staging and then production, using a transaction with a 5-second lock timeout and 30-second statement timeout. The stored statement MD5 was verified on both projects and again in production after smoke: `eb447fafdc0bc484c6a328a848a70989`.

The migration replaces only the tracks timestamp trigger with the invoker function `public.update_track_updated_at_monotonic()`. It uses the greater of the wall clock and the previous version plus one microsecond. It pins `search_path` and revokes direct application-role execution. Existing library rows were not rewritten.

Rollback-only SQL fixtures passed on both hosted databases: trigger and function privileges, two updates in one transaction, stale compare-and-swap rejection, title/BPM preservation, explicit retry, a legacy null timestamp, and cross-owner rejection. The transactions rolled back; final counts for those fixed SQL fixture IDs were zero.

The dashboard reported no automatic backups. The pre-migration trigger definition was captured: `tracks_update_updated_at_trigger` called the existing `public.update_updated_at_column()`, whose body assigns `NOW()` to `NEW.updated_at`. A database backout would be a separately reviewed forward migration restoring that trigger and removing the new function. No backout was executed.

## Edge Function release

Only `delete-account` was deployed to staging and production. Its handler continues to authenticate callers internally; the production dashboard confirmed **Verify JWT with legacy secret = off** after deployment. Both environments rejected an unauthenticated POST with HTTP 401 and `authentication_required`.

Dashboard deployment required two packaging adjustments: the shared account-deletion contract was included as a sibling `accountDeletion.ts`, and the handler import was changed to `./accountDeletion.ts`; bare Supabase SDK imports were expanded to `npm:@supabase/supabase-js@2.111.0`, the exact version already pinned in the function's `deno.json`. The dashboard does not preserve the repository import map. No runtime logic was changed by packaging.

All seven production editor files were compared with the verified staging package before deployment. The [deterministic package manifest](2026-09-07-audit-defects-edge-package.json) records the corresponding paths and SHA-256 hashes. The production dashboard confirmed deployment and cleared its modified/new file indicators. A production authenticated request subsequently verified the new response contract.

The existing minute-by-minute production account-cover cleanup cron remained active. No secrets, scheduler configuration, unrelated function, or existing user's library data was changed. The CLI credential still belongs to a different organization, so hosted Supabase work used the authenticated dashboard; no privileged production credential was exported.

## Production browser and data smoke

One auto-confirmed, disposable account was created without sending email, with one synthetic record, two tracks, and one uploaded cover. All authenticated test writes were scoped to that account.

- **Manual conflict and retry:** a title edit remained open while a second authenticated request changed only BPM from 128 to 141. The first save was rejected as stale, retained the title input, and disabled Save pending explicit review. The reviewed retry saved the title while preserving BPM 141. On the final deployment, a database read confirmed the exact 180 ms duration remained intact: `updated_at = 2026-09-07T14:42:10.488787+00:00`.
- **Abandoned enrichment preparation:** in the test tab, one WebCrypto digest was temporarily held during preparation. Save was disabled at 0/0. The SPA navigated away through its track link, then the digest was released. BPM, key, evidence, and the row version remained unchanged. The original browser crypto method was restored and the temporary harness removed.
- **Successful enrichment:** normal retry saved BPM 128, A minor (`key = 9`, `mode = 0`), and v2 source evidence to the intended second track. The UI reported 1 of 1 staged tracks saved. The unrelated first track remained unchanged.
- **Library and routes:** records showed 1 of 1 records and two tracks with the synthetic cover. The final production build loaded the authenticated `/TRACKS/?genre=House#release-smoke` route. Signed out, that exact path, query, and hash survived in the login return URL. Both `/privacy/` and `/PRIVACY/` rendered the public Privacy Notice.
- **Runtime errors:** none were observed in the inspected manual-edit and enrichment browser checks. The original preview had existing report-only inline-style CSP diagnostics.
- **Deletion:** the normal authenticated `delete-account` API returned HTTP 200 with `success: true`, `cleanup_state: "queued"`, `cleanup_queued: true`, and both legacy completion booleans false. Account and library deletion completed immediately; cover cleanup then completed through the existing scheduled worker. The browser signed out, and a new password sign-in was rejected with `invalid_credentials` (HTTP 400).

The deletion API and actual background cleanup were exercised in production. The client’s queued-success toast branch is covered by automated tests; the live browser did not submit the irreversible deletion dialog itself.

## Synthetic-data cleanup

The disposable account was `001197a6-510f-4675-a04a-b27ca9597868`, created at `2026-09-07T14:03:45.009814Z`. Its record was `94cf8e1b-8f2b-46e0-94b6-ebccab773355`; its tracks were `f22bcc0e-fa68-4ebe-a86a-c24cbb0d64a4` and `5ef2be84-1699-445a-a9fa-d7652e7bf18e`. Before deletion, a read-only check confirmed that every record, track, and cover owned by the account matched this run's exact fixtures.

Final production SQL readback showed zero rows for the account in Auth users, profiles, records, tracks, crates, Discogs credentials, user-specific Discogs quota, enrichment receipts, cover storage objects, account cleanup jobs, and record cleanup jobs. The migration hash remained correct and the production cleanup cron remained active. The test account's temporary credentials were removed from local helper files after verification.

The existing local Supabase stack was left running. The final released runtime source remains `b4a6dbd186ea3541b122951264c84d10c1a3bd94`.
