# Current operations

This is the current operating entry point. The [staging release runbook](staging-release-runbook.md) retains the detailed staging procedures and historical July rehearsal. The latest completed production release is recorded in [8 September release evidence](release-evidence/2026-09-07-audit-defects-release.md).

## Release baseline

| Environment | Supabase project       | Pages project         | Stable origin                           |
| ----------- | ---------------------- | --------------------- | --------------------------------------- |
| Production  | `czlfiwivlgqhqezmywfx` | `crate-guide`         | <https://crate.guide>                   |
| Staging     | `xrekloexiottvfueijgb` | `crate-guide-staging` | <https://crate-guide-staging.pages.dev> |

Both backend projects belong to organization `grxffkeajwssrcfwtxny`. The production Pages branch is `main`; the staging Pages branch is `staging`. Public backend configuration is compiled into the frontend build.

Use a clean checkout at a full, explicit commit SHA already verified by a push to `main`. Both staging and production preflights use this merged source. The preflight is read-only:

```bash
npm run release:preflight -- --environment staging --commit <full-sha>
npm run release:preflight -- --environment production --commit <full-sha>
```

It verifies the checkout and origin, the latest successful push-to-main Verify workflow for that exact source, and CLI visibility of the intended healthy Supabase project and organization. A PR workflow does not satisfy this gate: it tests GitHub's synthetic merge commit, which can contain base changes absent from the PR head. The preflight emits migration file hashes and a list of the remaining release checks. It does **not** certify the hosted migration ledger, restore capability, a built artifact, or deployment completion.

The last release used authenticated dashboard access because the CLI identity could not see this organization. The preflight deliberately fails in that situation. Configure a correctly scoped CLI identity before the next backend release. Do not export privileged credentials into source control, browser evidence, or release logs.

Before mutation, compare the hosted migration ledger with the emitted inventory, review pending SQL, and establish a recovery point. Rehearse changed migrations and only the changed Edge Functions in staging. Record the exact source, built backend, build ID, migration readback, deployed functions, and Pages deployment identity. Use repository import maps for CLI Edge deployment; the last release's [dashboard package manifest](release-evidence/2026-09-07-audit-defects-edge-package.json) is historical fallback evidence, not a reusable package for later source.

After deployment, run the same read-only smoke against the immutable deployment and the stable origin, supplying the build ID recorded from the artifact:

```bash
npm run smoke:release -- --environment production --build-id <build-id> --url https://<deployment-id>.crate-guide.pages.dev
npm run smoke:release -- --environment production --build-id <build-id>
```

The smoke checks ten routes, exact build and backend identity, the repository's browser security-header contract, and application JavaScript entry assets. It rejects redirects, a mixed/stale build, and an origin outside the selected environment. Authentication, OAuth, real account flows, and data cleanup still need scoped browser/data evidence. Never equate an HTTP smoke pass with those checks.

## Local integration gate

With the existing local Supabase stack running:

```bash
npm run test:integration
```

This separate Vitest project runs against the repository's migrated local stack, using real accounts, PostgREST, database triggers, and Storage. It must fail if the stack is unavailable. It cannot be pointed at a hosted project through environment variables: configuration comes from local CLI status and is restricted to literal loopback ports `42821` and `42822`. The server pins its effective runtime URL/key, the browser verifies them before entering credentials, and a request guard blocks origins other than the test app and local Supabase. The suite deliberately supplies conflicting inherited Nuxt/Nitro settings to exercise this boundary.

Each run creates unique, auto-confirmed `example.invalid` accounts without sending mail. Teardown removes only their known cover paths and accounts, then checks that their rows, jobs, and objects are gone. An unrelated synthetic account proves isolation. The developer stack is never reset or stopped.

The browser uses the real Supabase client. Edge requests execute the production handlers with local credential providers in the test process; the global account cleanup dispatcher and expired-quota pruning are excluded so tests cannot drain a developer's unrelated jobs or quota rows. The account cover worker is exercised with a real, explicitly scoped database claim. Its own quota row is removed while an unrelated expired quota sentinel must remain unchanged; teardown removes and verifies only each fixture's exact quota key. Edge gateway configuration, global job claiming, and expiry pruning remain covered by the existing Edge/database tests and hosted smoke. CI runs this integration gate after database migrations and schema verification.

## Recovery activation

Recovery is still an open operational requirement. The dashboard at the last release showed no automatic backups. The July manual database restore rehearsal is historical evidence; it is not a current recovery point.

The proposed baseline is a daily encrypted backup to independent private storage, with 30 daily copies and a monthly isolated restore rehearsal. Before activation, confirm the destination, retention, encryption-key ownership, and access for an unattended operator. Do not upload production data to a guessed destination or use CI logs/artifacts as an implicit backup store.

A complete backup set must contain:

- A consistent logical database export, including application data, Auth state, schema, migration history, and the roles/permissions needed to restore into the chosen isolated target. Treat provider-managed schemas and secrets explicitly during the restore procedure.
- The bytes of every referenced managed cover object, plus a manifest containing object path, size, and checksum. Database backups contain Storage metadata, not the cover files themselves.
- A manifest with source project, start/end time, database export checksum, migration inventory, cover inventory and checksums, and the backup format/tool versions. The manifest must record unresolved missing or changing objects as a failed backup.

Database snapshots and Storage downloads are not one atomic snapshot. Preserve the cover versions referenced by the database export and verify their hashes after capture; a missing referenced object fails the recovery set. Do not claim a clean backup from two unrelated successful export commands.

An isolated restore must prove schema/migration parity, representative record/track/crate/set relationships, authentication configuration needed for recovery, and every referenced cover's bytes. Outbound mail, provider calls, cron, and production integrations must remain disabled in that target. Record elapsed restore time and measured data loss window, then remove only the restore target and its synthetic verification fixtures.

Until the destination, unattended access, a successful backup, and a verified restore exist, report backup capability as **not activated**. The automation must alert on failed capture, missing objects, checksum mismatch, stale last success, and failed restore rehearsal.

The [8 September recovery preflight](recovery/2026-09-08-preflight.md) records restored CLI access, the PostgreSQL tooling correction, and the remaining Cloudflare billing step.
