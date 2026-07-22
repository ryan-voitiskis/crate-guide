# Plan 072: Copy a browser library into an empty cloud account

> **Executor instructions**: Implement one-way copy-and-switch, not sync. Inspect
> the destination before writing, retain the local source through verification,
> and refuse automatic merge when both libraries contain data.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/repositories app/pages/auth/finalising.vue app/pages/settings.vue app/components/layout supabase/functions supabase/migrations supabase/tests shared/types/database.ts supabase/functions/_shared/types/database.ts`

## Status

- **Priority**: P2
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 064, 070, and 071
- **Category**: direction / migration
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

Local mode should not trap users or make account creation destructive. A user
may later want a cloud-backed, cross-device library. The safe first migration
copies a coherent local snapshot into a proven-empty destination, verifies it,
keeps the local library, and asks before switching; merging two live libraries
is a different product with unresolved identity conflicts.

## Current state

- `auth/finalising.vue:51-66` redirects once a user appears; it has no workspace
  decision state.
- Plan 070 provides portable source references and strict graph validation.
- Cloud IDs/owner fields and managed cover storage are destination concerns.
- Discogs releases are unique per user while manual records lack a natural key,
  making silent nonempty merge unsafe.

## Commands you will need

| Purpose     | Command                                            | Expected on success                       |
| ----------- | -------------------------------------------------- | ----------------------------------------- |
| Database    | `npm run test:db`                                  | staging/finalize/security assertions pass |
| Types       | `npm run genTypes && npm run check:database-types` | tracked copies match                      |
| E2E/browser | `npm run test:e2e && npm run test:browser`         | migration/recovery flows pass             |
| Full gate   | `npm run verify:full`                              | exit 0                                    |

## Scope

**In scope**: destination inspection, authenticated staged/chunked metadata
copy, ID mapping, resumable managed-cover upload, read-back verification,
copy receipts, server-owned abort/expiry/pruning, preference adoption, workspace
decision UX, local retention, both generated database type copies, docs/tests.

**Out of scope**: bidirectional sync, nonempty merge, automatic local deletion,
copying credentials/cache/raw files, or treating the cloud library as guaranteed
backup.

## Git workflow

- Branch: `codex/072-copy-local-library-to-cloud`
- Commit: `feat(library): copy local library to cloud`

## Steps

### Step 1: Add explicit post-auth workspace decisions

When authentication completes while a browser library is active, keep it active.
Inspect cloud counts without loading/replacing local state, then show:

- empty destination: `Copy this browser library to my account`, `Open empty
cloud library`, or `Continue with this browser`;
- nonempty destination: `Continue with this browser`, `Open cloud library`, and
  export actions for both. State that automatic merge is unavailable.

No choice may upload or switch implicitly.

Define `empty cloud library` as zero owned records/tracks/crates/sets, zero
managed cover references/objects in the library namespace, and no active or
finalized copy receipt. The normal profile/identity row does not make a library
nonempty. Preview that library-owned Local preferences from Plan 068 will replace
the cloud profile's corresponding preference fields at finalization;
`selected_crate` is remapped through the crate ID map. Identity/Discogs fields
and device-only density/theme fallback are never overwritten or copied.

**Verify**: empty/nonempty/error/offline auth transitions preserve local state.

### Step 2: Add an authenticated staged-import contract

Create forward-only staging tables/functions keyed by random migration ID and
derived `auth.uid()`. Add a per-user library-write guard row/state. Every normal
records/tracks/crates/sets/preference/managed-cover mutation path must acquire
the same guard through a trigger or equally complete server-enforced boundary;
the finalizer locks it, proves emptiness, and commits the graph/preferences
atomically. A concurrent ordinary insert must block then fail/re-evaluate, not
slip between the emptiness check and commit.

Keep the guard in a documented copy phase through deterministic read-back. If
an inactivity expiry must release it after metadata commit, transition to
`metadata complete; covers/verification pending` and make later verification
receipt/ID-map scoped, reporting intervening cloud edits separately. Never
pretend the destination became empty again or start a second import.

Accept bounded archive-domain chunks, never owner/storage
path/auth fields. Validate format/source ID, counts, duplicate refs, quotas,
destination emptiness, and one active migration per user. Build explicit source
to destination ID mappings for records, tracks, crates, sets, and covers.

Finalization performs the metadata graph commit transactionally only when all
declared chunks/hashes/references validate and the destination remains empty.
Functions have allowlisted privileges. Add owned abort, short inactivity expiry,
and bounded pruning for staging rows, idempotency/receipts, and cover objects;
expired/aborted operations release the write guard and cannot strand the user's
next attempt.

**Verify**: pgTAP covers cross-user/anonymous denial, duplicate/replay,
interruption, count/hash/ref failure, nonempty race, and atomic finalization.

### Step 3: Build resumable copy orchestration

Read one coherent local snapshot/content revision, validate it with Plan 070
codecs, and upload bounded idempotent chunks. Persist device-local progress keyed
by source workspace plus opaque server migration ID—not an account ID. Every
resume asks the server under the current authenticated session to resolve and
prove ownership; account B cannot learn or continue A's operation.

Before metadata finalization, a source content-revision/workspace change pauses
and requires an owned abort plus restart while the destination is still empty.
After finalization, the receipt freezes the copied source revision, ID map, and
cover hash manifest. Later Local edits are reported as `changes not copied` and
do not invalidate/restart the now-nonempty destination. Returning to the same
authenticated account resumes post-finalization work from the immutable receipt;
another account cannot.

After metadata finalization, upload managed covers with bounded concurrency into
a migration-owned, hash-addressed namespace recorded durably in the receipt,
then attach paths idempotently through owned functions. A successful upload
followed by client loss is discoverable for resume or bounded server cleanup;
never rely on record-cover tombstones to find unattached objects. External cover
URLs remain metadata. Cover failure leaves a valid cloud graph and an explicit
`covers need retry` result.

**Verify**: reload/cancel/network/A-to-B/failure-at-each-phase tests pass.

### Step 4: Verify before offering a switch

Read back destination counts, ID relationships, remapped library preferences,
set snapshots, provenance, and cover status against the immutable source
manifest/receipt. Only then offer `Open cloud
library`. Keep the local workspace by default; if removal is offered, require a
separate exact destructive confirmation after verification.

Store a copy receipt but do not link later edits or call them synchronized.

**Verify**: corrupted/incomplete read-back cannot report completion or delete
local data.

### Step 5: Align UX and documentation

Call this `Copy to your account` / `Cloud library`, not “turn on backup.” Explain
cross-device value, current provider backup limitations, retained local copy,
and absence of sync/merge. Add progress, cancellation, retry, accessible summary,
and a redacted issue export.

**Verify**: SQL/types, Nuxt/E2E/browser, docs, convention, and full gates pass.

## Test plan

Empty definition with an existing profile; preference adoption and
`selected_crate` remap; destination becomes nonempty through a concurrent normal
write; 0/1/10k entities; ID remapping; sets/crates; duplicate Discogs ID; chunk
replay; finalization crash; pre-finalization restart; post-finalization source
edit; upload-before-attach loss; orphan pruning; abort/expiry/guard release;
covers partial; source/account switch; offline; reload; cancel; verification
mismatch; local retention and explicit switch/remove.

## Done criteria

- [ ] Authentication never uploads/switches the active browser library implicitly.
- [ ] Only a proven-empty owned destination can finalize the first-version copy.
- [ ] Metadata is atomic; cover partials are resumable and accurately reported.
- [ ] Every normal cloud mutation participates in the emptiness guard; abandoned staging/covers expire safely.
- [ ] Preference ownership/remapping and post-finalization immutable resume are explicit and verified.
- [ ] Local data remains until a separately confirmed post-verification deletion.
- [ ] Nonempty cloud/local libraries are never silently merged.

## STOP conditions

Stop if destination emptiness cannot be transactionally protected, if a staged
operation can cross account/source identity, if verification cannot map the full
graph, if ordinary writes can bypass the migration guard, if unattached uploads
cannot be discovered/pruned, or if product asks for merge without a separate
conflict design.

## Maintenance notes

Copy receipts/source refs are foundations for a future merge, not permission to
infer entity equality. Fuzzy record/track matching must never become an implicit
merge rule.
