# Plan 070: Add portable library backup and safe local restore

> **Executor instructions**: Treat archives as hostile input and restore into a
> new/staged browser workspace. Never clear the active library before complete
> validation and read-back. Do not call an export “backed up” merely because a
> download stream closed.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/repositories shared/types/audioFeatures.ts shared/types/database.ts supabase/functions/_shared/types/database.ts app/pages/privacy.vue app/pages/settings.vue app/components/settings package.json package-lock.json scripts/check-discogs-doc-contract.mjs docs/discogs-integration.md docs/decisions supabase/migrations supabase/tests`

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 047, 048, 054, 068, and 069
- **Category**: direction / backup / portability
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: BLOCKED

## Why this matters

A browser library is genuinely saved but not copied to Crate Guide's database.
Users need a transparent recovery path for clearing, eviction, profile/device
loss, and migration. Cloud users benefit too: the current privacy page says to
keep a copy but offers no export.

## Current state

- `privacy.vue:166-195` says Crate Guide is not a backup service.
- Records own tracks; crates reference records; sets retain track references in
  JSON. A flat table dump cannot preserve the graph safely.
- Managed covers are private WebP assets up to 2 MiB each; external provider
  covers are URLs.
- `audio_features` is durable provenance; `crate-guide-local-audio` is a
  derivable cache and must stay out of backups.

## Commands you will need

| Purpose       | Command                                                           | Expected on success                        |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Archive tests | `npx vitest run --project unit app/utils/libraryArchive*.test.ts` | all pass                                   |
| Browser       | `npm run test:browser`                                            | streaming/restore/large archive tests pass |
| Database      | `npm run test:db`                                                 | cloud snapshot security tests pass         |
| Types         | `npm run genTypes && npm run check:database-types`                | both generated copies match                |
| Provider docs | `npm run check:discogs-docs`                                      | classified fields/attribution stay aligned |
| Full gate     | `npm run verify:full`                                             | exit 0                                     |

## Scope

**In scope**:

- versioned `.crate-guide` ZIP-compatible archive contract, codecs, pure
  migrators, hashes, golden fixtures, Worker streaming
- coherent snapshot adapters for cloud and browser repositories
- metadata/full-with-managed-covers export
- inspect/preview and restore-as-new-browser-library; explicit local replace
  only through shadow workspace swap
- settings/status/destructive-flow backup actions and privacy/docs
- exact-pinned streaming ZIP/hash dependencies after licence/bundle spike
- `package-lock.json`, any cloud snapshot migration/RPC, both generated database
  type copies, and provider-data decision/checker updates

**Out of scope**: merge, CSV/provider formats, restoring directly into a
nonempty cloud account, raw audio/XML/cache, credentials/tokens, or automatic
background file backup.

## Git workflow

- Branch: `codex/070-add-portable-library-archives`
- Commit: `feat(backup): add portable library archives`

## Steps

### Step 1: Resolve third-party portability rights before freezing the schema

Inventory every Discogs-derived field currently stored or proposed for export,
including collection/release metadata, identifiers, images/URLs, and Evidence.
Against the current official
[Discogs API Terms](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)
(last updated 2025-05-27 at planning time), classify each as user-provided,
CC0 API Data, Restricted Data, derived, or unknown. Record display staleness,
retention, archive-export/reimport, redistribution, deletion, and adjacent
`Data provided by Discogs` link/attribution obligations.

Obtain a written maintainer/provider/legal decision before golden fixtures
normalize indefinite storage/export. If a field is not defensible, omit it from
the archive and/or constrain retention/display in the repository with a tested
migration; do not rely on a legal-page disclaimer. Extend the positive Discogs
docs checker so the field matrix, archive schema, import behavior, attribution,
and privacy text cannot drift.

**Verify**: dated primary sources, field matrix, decision owner, accepted schema,
and STOP/constrained fallback are committed before archive fixtures.

### Step 2: Freeze the portable schema and golden fixtures

Use one transparent container with:

- `manifest.json` (format/min-reader version, export/source-library IDs,
  timestamp, counts, sizes, sections, hashes)
- canonical preferences JSON
- deterministic `records.ndjson`, `tracks.ndjson`, `crates.ndjson`, and
  `sets.ndjson`
- optional `covers/<logical-ref>.webp`
- a human-readable format note

Whitelist domain fields. Remove/remap owner IDs and storage paths. Include
applied evidence/provenance and immutable set snapshots. Exclude auth/session,
Discogs credentials, transfer snapshots, signed URLs, raw files, absolute paths,
analysis cache, workflow drafts, copy receipts, storage-health diagnostics, and
operational revisions. Include only Discogs-derived fields allowed by Step 1.
Disclose that filenames/sanitized relative hints may appear.

**Verify**: golden current/previous-version fixtures round-trip canonically.
Forbidden-field scans inspect structural JSON keys/paths and archive entries,
not arbitrary user text that happens to resemble a field name.

### Step 3: Build coherent snapshot and streamed export

`readLibrarySnapshot()` must include every durable section, even sets not
mounted in Pinia. For IDB, read one logical revision transaction. For cloud,
use one authenticated server snapshot transaction or revision-bracketed reads
that retry on change; never call mutation-undetectable pagination coherent.
If this requires a migration/RPC, derive ownership from `auth.uid()`, restrict
grants, add pgTAP, regenerate both database type copies, and gate parity.

Stream serialization/compression/hashing in a Worker. Prefer File System Access
after explicit user choice; provide Blob download only below a measured memory
cap and offer metadata-only when full cover export is unsupported. Never fetch
external cover URLs. A missing managed cover produces an incomplete/error
summary, not a falsely “full” backup.

**Verify**: mutation-during-export, 10k entities, large cover sets, cancel, and
write failure remain bounded and truthful.

### Step 4: Strictly inspect untrusted archives

Before writes, enforce compressed/uncompressed bytes, entry count/size,
decompression ratio, legal relative paths, duplicate names/refs, strict schemas,
hashes, string/numeric limits, versions, cover MIME/dimensions, and graph
integrity. Reject absolute/traversal paths and unexpected entries. Never render
external cover URLs during preview.

Show date/version/source mode, counts, cover bytes/completeness, provenance
disclosure, compatibility, and every blocking issue.

**Verify**: corrupt/truncated/zip-bomb/path/duplicate/orphan/future-version
fixtures perform zero repository writes.

### Step 5: Restore atomically into a new browser workspace

Build a complete source-ref to new-ID map, write a shadow workspace in one
staged transaction, validate read-back counts/graph/hashes, then activate it.
Default action is `Restore as a new browser library`. Replacement first offers
`Download current backup`, requires exact counts/confirmation, and retains the
old workspace until the new one verifies. Merge is absent.

Cover restoration may be a bounded second phase but cannot corrupt metadata;
status distinguishes complete, metadata-only, and covers needing retry.

**Verify**: injected failure at every phase leaves the old active workspace
selectable and untouched.

### Step 6: Add honest backup UX and documentation

Use `Download backup`, `Last export created`, and `changes since export`; do not
claim the downloaded file still exists. Record the captured
`contentRevision` only after archive finalization and sink success; updating this
operational marker must not itself create a content change. Add backup-first actions to local clear,
cloud clear, and account deletion without weakening confirmation. Update privacy
for archive contents and unencrypted personal filenames/hints.

**Verify**: accessibility, browser, SQL, type, bundle, convention, and full gates
pass.

## Test plan

Canonical byte equality for the same unchanged snapshot under fixed test export
metadata; export to restore to export normalized semantic graph equality modulo
new workspace/entity IDs and volatile manifest fields; ID remapping through
every relationship and `selected_crate`; old/current/future version; corrupt
hashes; malformed provenance;
archive bombs/paths; A to B during cloud export; partial covers; no disk space;
cancel/reload; quota/blocked IDB; and destructive-flow backup actions.

## Done criteria

- [ ] Discogs-derived fields have an accepted, source-linked storage/export/attribution classification or are constrained/omitted.
- [ ] Cloud and browser libraries export one documented backend-neutral format.
- [ ] Credentials, owner IDs, raw files, storage paths, signed URLs, and cache never enter it.
- [ ] Invalid archives cause zero writes; failed restore leaves the old library intact.
- [ ] A valid archive restores as a verified new browser library with exact graph relationships.
- [ ] UX says local data is saved but not backed up by Crate Guide.

## STOP conditions

Stop if cloud snapshot consistency cannot be proven, if archive processing is
unbounded, if replacement needs destructive pre-validation writes, or if merge
is proposed without durable origin mapping/conflict UX. Also stop before schema
freeze if Discogs-derived storage/export/attribution rights remain unknown;
constrain or omit disputed fields rather than assume portability.

## Maintenance notes

Archive format version is independent of database migration numbers. Keep a
golden fixture for every supported reader version and make support removal an
explicit product decision.
