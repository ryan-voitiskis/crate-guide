# Stabilisation foundation

Status: in progress. Approved by Ryan on 8 September 2026 after the audit-defect production release.

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

## Follow-up decisions

The release tooling and integration foundation are implemented. The four real local Supabase integration flows passed on 8 September, including teardown readback. Lint and type checking passed. The read-only production smoke verified all ten routes against the existing released build. The new preflight reproduced the missing CLI organization access without exposing unrelated project details. Full repository verification and the draft boundary extraction follow in the next commit.

After this foundation, extract enrichment lease, autosave, recovery, and apply behavior one boundary at a time. Investigate record/crate metadata write conflicts before changing their contracts. Add actionable cleanup/error monitoring and validate CSP enforcement separately. Measure library hydration and bundle costs with realistic libraries before optimizing.
