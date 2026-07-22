# Plan 074: Persist resumable enrichment reviews locally

> **Executor instructions**: Persist a sanitized draft domain, never live review
> rows or parser output. Resume by rematching against the current active library
> and retain staging only when source, target, proposal, and preconditions are
> identical. Browser persistence is recovery, not backup.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/composables/useTrackEnrichmentWorkflow.ts app/pages/enrichment.vue app/types/localAudio.ts app/utils/rekordboxXml.ts app/utils/trackEnrichment.ts app/repositories test/nuxt/enrichment-page.nuxt.test.ts`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 045, 064, 065, 066, 069, and 071
- **Category**: direction / workflow durability
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

Parsing, scanning, matches, staging decisions, and partial apply results exist
only in component refs. Refresh/restart loses a long, careful review. A device-
local draft can recover that work for cloud and Local libraries, but raw XML
rows contain absolute paths and local entries contain live `File` objects, so
naive serialization would create privacy and stale-write defects.

## Current state

- `useTrackEnrichmentWorkflow.ts:103-121` owns all state in refs.
- `enrichment.vue:123-138` only warns before reload when rows already exist.
- `LocalAudioFileEntry` contains `File`; parser rows retain decoded absolute
  `location` until converted to sanitized source evidence.
- Review row IDs combine source index and current target ID, not durable source
  fingerprints.

## Commands you will need

| Purpose         | Command                                                                                                                                              | Expected on success               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Composable/Nuxt | `npx vitest run --project stores --project nuxt app/composables/__tests__/useTrackEnrichmentWorkflow.test.ts test/nuxt/enrichment-page.nuxt.test.ts` | all pass                          |
| Browser         | `npm run test:browser`                                                                                                                               | reload/multi-tab/quota flows pass |
| Full gate       | `npm run verify`                                                                                                                                     | exit 0                            |

## Scope

**In scope**: versioned draft DTO/codec/migrators, one active draft per workspace,
IDB repository, debounced CAS autosave, rematch/resume, source reconnect UX,
partial apply recovery, multi-tab lease/conflict, privacy/docs/tests.

**Out of scope**: cloud-synced drafts, multiple named drafts, persistent file
permissions as a requirement, raw XML/audio/File serialization, or automatic
application of restored decisions.

## Git workflow

- Branch: `codex/074-persist-resumable-enrichment-reviews`
- Commit: `feat(enrichment): persist resumable review drafts`

## Steps

### Step 1: Define the sanitized draft format

Store schema/matcher/parser and sanitized-source snapshot versions,
workspace/repository ID, source
kind/label, timestamps/revision, sanitized source snapshots/fingerprints,
reviewed proposal decisions, partial outcomes, and useful UI anchor/filter/sort/
density state. Use:

- XML: dataset fingerprint plus Rekordbox TrackID where present, otherwise a
  deterministic snapshot-local source ID;
- local audio: versioned relativePath + size + lastModified cache identity.

Never store `TrackEnrichmentRow`, full Track/Record snapshots, absolute
locations, raw XML/audio, `File`/handles, promises/workers, object URLs, dialogs,
or in-flight apply state. One active draft per workspace is the first contract.

**Verify**: strict forbidden-field/path fixtures and current/previous migrators
pass.

### Step 2: Add atomic autosave and multi-tab ownership

Use Plan 069's reserved draft store, monotonic revision/CAS, and a writer lease.
Debounce meaningful decisions; show `Saving…`, `Saved locally 14:32`, or
`Couldn't save—keep this tab open`. A second tab is read-only until explicit
takeover and cannot silently overwrite. Starting fresh requires confirmation;
delete is explicit.

**Verify**: two-page, quota, corruption, blocked-upgrade, takeover, and stale
revision browser tests pass.

### Step 3: Rematch every resumed draft

Load current repository data, migrate the stored sanitized source snapshot when
an explicit pure migrator exists, and rebuild rows with the current matcher.
Do not claim to rerun a changed parser without the raw XML. Retain a staged
decision only when source fingerprint/observation identity, target track ID,
decision kind, proposed BPM/key/source, blank-field preconditions, and
stageability are identical. Put every other row unstaged in `Changed since last
review`; classify deleted, already-filled, changed, and no-longer-matching
explicitly.

On draft/snapshot/matcher migration summarize retained/changed/dropped
decisions. If a parser change makes the sanitized snapshot incompatible and no
safe snapshot migrator exists, offer Re-import or Delete; never trust it as
current. Keep the decision DTO as a versioned discriminated union so Plan 075
can add an evidence-only intent without treating an unknown future action as a
fillable approval.

**Verify**: target/source/policy permutation tests prove no stale staged write.

### Step 4: Define file recovery honestly

XML resumes from a compatible or explicitly migrated sanitized source snapshot;
parser-incompatible drafts require re-import because raw XML is not retained.
Local audio resumes already
scanned/analyzed evidence for review, but continuing scan/reanalysis requires
`Reconnect folder to continue analysis`; reconcile reselected files to cached
fingerprints and report missing/changed files. Do not promise portable/permanent
File System Access permission.

**Verify**: reload without files supports review but never reanalysis; reconnect
cases pass across supported path forms.

### Step 5: Preserve partial apply outcomes and UX

Keep successfully applied rows Done, failures available to retry, and the draft
until every intended write succeeds and the summary is acknowledged (or user
chooses keep). Add the active-review strip on source step with counts, saved
time/durability explanation, Resume, Start fresh, and Delete. Replace generic
reload warning with draft status.

**Verify**: partial network/CAS/account/workspace change, resume, retry, and final
cleanup tests pass; then format/convention/full gates.

## Test plan

Schema corruption/migration; Unix/Windows/UNC/URI path stripping; XML/local
reload; current-library rematch; changed/deleted/already-filled targets; policy
version; partial apply; quota/write failure; workspace/account replacement;
two-tab conflict/takeover; reconnect missing/changed files; accessibility.

## Done criteria

- [ ] One sanitized draft per workspace survives navigation, reload, and restart.
- [ ] Resume always rematches current data and never trusts stale staged approval.
- [ ] Local-audio review versus file-reconnect boundary is explicit.
- [ ] Drafts are device-local, mode-neutral, owner/revision-safe, and not called backup.
- [ ] Focused, browser, privacy/docs, and full gates pass.

## STOP conditions

Stop if implementation serializes application rows/parser output, restores
staging without rematch, requires Supabase user ID, claims files remain available,
or can overwrite a draft from another tab.

## Maintenance notes

Drafts are operational state and excluded from ordinary library backups. A later
optional draft export needs its own explicit privacy surface.
