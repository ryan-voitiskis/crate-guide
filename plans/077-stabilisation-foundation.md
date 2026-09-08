# Stabilisation foundation

Status: steps 1–3 implemented and locally verified; recovery activation remains open. Approved by Ryan on 8 September 2026 after the audit-defect production release.

## Objective

Make changes to the production Cloud library easier to verify and recover, then reduce the coupling around active enrichment drafts. Preserve the existing IndexedDB database and upgrade path. Accountless libraries, portable archives, and offline expansion remain deferred.

## Sequence and completion evidence

1. Record the completed audit-defect release and replace operator-only release checks with repeatable, read-only tooling. Keep production and staging identities explicit. A backend preflight must detect credentials that cannot see the intended organization.
2. Add a local Supabase integration gate. Exercise real authenticated requests and the application against the migrated database, including stale track writes, abandoned enrichment, recovery, record covers, and account deletion. Fixtures must be unique to the run and cleaned up even on failure. Never reset or stop an existing developer stack.
3. Extract the active device-draft dependency boundary from deferred browser-library operations. Keep public compatibility exports and IndexedDB schema unchanged. Validate persistence and browser lifecycle behavior before further refactoring.
4. Establish database **and cover-object** backup and restore evidence. Select an independent private destination before enabling an automated production export. A successful upload alone is not recovery proof. Rehearse a restore in isolation before marking recovery complete.

Keep these as separate commits with focused verification. Run formatting, conventions, and the complete repository verification before handoff. Build and test database contracts where affected.

## Current operational constraints

- Latest released runtime source: `b4a6dbd186ea3541b122951264c84d10c1a3bd94`; [release evidence](../docs/release-evidence/2026-09-07-audit-defects-release.md).
- Production Supabase: `czlfiwivlgqhqezmywfx`; staging: `xrekloexiottvfueijgb`; organization: `grxffkeajwssrcfwtxny`.
- The CLI identity at the last release could not see this organization. Authenticated Chrome dashboard access worked. Reliable backend CLI access remains an activation requirement, not a completed task.
- The dashboard showed no automatic backups. An independent backup destination has been requested; production export and restore capability remain unverified.
- Local Supabase ports remain `42820–42829`. Integration tooling must reject hosted endpoints and operate only on its own disposable fixtures.

## Verification and remaining work

The release tooling, integration foundation, and first draft boundary are implemented. `npm run verify:full` passed with the required browser matrix enabled and the CI audio timing setting: 2,526 application tests, 26 E2E passes with the existing conditional skip, 82 browser tests, 146 Edge tests, 473 database assertions, generated-schema parity, conventions, security headers, and bundle budgets. Initial JavaScript measured 1,106,394 raw / 348,913 gzip bytes; the largest ordinary chunk measured 128,150 raw / 37,143 gzip bytes. Existing budgets were not increased.

The four real local Supabase application flows passed, including teardown readback. Final review added a fifth integration test for Auth creation committing before its response is lost; the helper recovers that exact synthetic account and removes it. Formatting, lint, type checking, and the complete five-test integration suite passed after that addition.

Independent PR review found three gaps in the new tooling. Release preflight now requires exact push-to-main workflow provenance, since PR CI tests a synthetic merge. The scoped integration worker excludes global quota expiry pruning and verifies that only its own quota row is removed. The integration server pins effective Nuxt/Nitro backend configuration; each browser page blocks unexpected origins and checks URL/key before entering credentials. All five integration tests passed with deliberately conflicting inherited settings and an unrelated expired quota sentinel. The reviewers rechecked these fixes and found no remaining actionable defects.

The read-only production smoke verified all ten routes against the existing released build. The new preflight reproduced the missing CLI organization access without exposing unrelated project details. No hosted migration, Edge Function, or frontend deployment belongs to this milestone.

The extracted draft read implementation was compared with the preceding commit and is byte-identical. The schema, persisted keys, revisions, leases, and compatibility exports remain unchanged. The new public entry point passed the existing lazy-loading and browser-persistence checks, and a dependency-graph test rejects runtime coupling to the deferred workspace catalog, library adapter, and export/copy operations.

Recovery remains **not activated**: an independent private backup destination and unattended access are still required. [Current operations](../docs/operations.md#recovery-activation) defines the database/object manifest, failure conditions, encryption/retention decisions, and isolated restore acceptance criteria. The earlier July restore rehearsal is historical evidence only.

## Follow-up decisions

After this foundation, extract enrichment lease, autosave, recovery, and apply behavior one boundary at a time. Investigate record/crate metadata write conflicts before changing their contracts. Add actionable cleanup/error monitoring and validate CSP enforcement separately. Measure library hydration and bundle costs with realistic libraries before optimizing.
