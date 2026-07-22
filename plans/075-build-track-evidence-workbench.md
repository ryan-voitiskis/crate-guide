# Plan 075: Build a trustworthy track Evidence workbench

> **Executor instructions**: Call the feature Evidence, not history or ground
> truth. Upgrade the bounded latest-evidence model before building persuasive UI.
> Keep existing BPM/key fill-only behavior; conflicts open review/editor and do
> not one-click overwrite populated values.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- shared/types/audioFeatures.ts app/utils/trackEnrichment.ts app/components/library/InspectorTrack.vue app/components/enrichment/TableTrackEnrichmentReview.vue app/pages/tracks.vue app/repositories supabase/migrations supabase/tests docs/track-enrichment.md`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 045, 063, 064, 068, 070, and 074
- **Category**: direction / provenance UX / data evolution
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

Crate Guide retains useful Rekordbox, embedded-tag, and Essentia evidence but
does not expose it after apply. Version 1 is not an audit log: source slots and
one global match are overwritten, applied markers lack value snapshots, and
complete tracks cannot retain newly reviewed evidence without filling a value.
A dense Evidence lens can make uncertainty and provenance useful without
overstating correctness.

## Current state

```ts
// shared/types/audioFeatures.ts:3-20
version: 1
applied: { bpm: { source, appliedAt } | null, keyMode: ... }
match: { confidence, score, reasons, warnings }
sources: { rekordboxXml?, embeddedTags?, essentiaBrowser? }
```

- Merge functions preserve other source slots but replace the one global match.
- Applied markers do not retain the value/observation that was applied.
- `InspectorTrack.vue:107-198` shows current BPM/key, not retained evidence.
- Analyzer BPM confidence/key strength and identity-match confidence are
  different measures and must never become one score.

## Commands you will need

| Purpose      | Command                                                                                          | Expected on success                       |
| ------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Codecs/unit  | `npx vitest run --project unit app/utils/trackEnrichment.test.ts app/utils/supabaseRows.test.ts` | all pass                                  |
| Database     | `npm run test:db`                                                                                | atomic evidence merge/security tests pass |
| Nuxt/browser | `npm run test:nuxt && npm run test:browser`                                                      | lens/inspector/scale flows pass           |
| Full gate    | `npm run verify:full`                                                                            | exit 0                                    |

## Scope

**In scope**: backward-compatible Evidence v2 codecs/migration, atomic per-source
merge, explicit evidence-only save, collection Evidence lens, selected-track
inspector, agreement/conflict/version filters, privacy/docs/archive compatibility,
cloud/local adapter conformance and tests.

**Out of scope**: unbounded append-only history, claiming correctness, automatic
replacement of nonblank values, audio/file upload, or a single composite
confidence score.

## Git workflow

- Branch: `codex/075-build-track-evidence-workbench`
- Commit: `feat(enrichment): add track evidence workbench`

## Steps

### Step 1: Define a bounded Evidence v2 model

Keep the latest observation per source, with model/matcher-policy version,
stable observation ID/time, source-specific match evidence, Rekordbox track ID,
and existing analyzer/configuration identity. Per-field application snapshots
must retain source observation ID, applied value, and applied time. Derive:
`current`, `changed since application`, `source missing`, `unattributed`,
agreement, and conflict.

Decode v1 without loss into honest `legacy/unknown` fields; do not invent missing
history or associations. Writer emits v2 only after migrator/golden/archive
fixtures pass. If full immutable history is later required, use a normalized
append-only table—not an unbounded JSON array.

**Verify**: v1/v2 malformed/mixed fixtures and round-trips pass.

### Step 2: Make evidence updates atomic per repository

Extend the Plan 064 server contract (or add a narrow RPC) to merge one source
observation/application snapshot without stale client JSON overwriting another
source. Enforce row/account CAS and return complete decoded v2. The browser
adapter provides equivalent transaction/revision semantics.

Add explicit `Save evidence only` staging for reviewed rows with no fillable
value. Never default-stage it. Confirmation and summary separate `Values filled`
from `Evidence saved`; existing BPM/key remains untouched. Persist sanitized
metadata/analysis only, never absolute paths/audio.

Version and migrate Plan 074's draft codec so `fill-values` and `evidence-only`
are distinct decision intents. Bind evidence-only approval to the exact source
fingerprint, stable observation/source identity, target track, and current
evidence precondition. Current-library rematch must unstage it when any binding
changes; old readers treat the new intent as safely unstaged/unsupported rather
than as a fill approval.

**Verify**: concurrent source merges, evidence-only, stale CAS, cloud/local
contract, and privacy tests pass.

### Step 3: Build the virtualized collection Evidence lens

Within Tracks/BPM & Key, reuse Plan 063's master-detail primitive. Header counts:
evidence retained, coverage per source, multi-source agreement, conflicts,
changed-after-import, old analyzer/config, and none. Table columns/filters cover
track/release, current value, applied source, each source value, match state,
agreement/conflict, and observation recency/status.

Define a pure versioned agreement policy with visible tolerance/harmonic rules.
Label it agreement, not correctness. Color is always paired with text.

**Verify**: filter/sort/keyboard/10k virtualization and accessible labels pass.

### Step 4: Add selected-track evidence inspection

Show current BPM/key, per-field applied statement, source cards with raw values
and observation time, source-specific match reasons/warnings, sanitized hints,
analyzer/config/segment/BPM confidence/key strength, and prominent `Changed
after import`. Distinguish `High identity match` from analysis confidence.

Actions may Compare, open Track Editor, or start a prefiltered enrichment review.
Do not one-click overwrite a populated value; a future replacement workflow
requires previous-value history and separate approval.

**Verify**: Nuxt/browser flows for legacy/current/conflict/divergence pass.

### Step 5: Align archive, privacy, docs, and claims

Teach Plan 070 current writer/reader about v2 while retaining old fixtures.
State whether evidence was retained from applied/enabled evidence-only reviews;
absent evidence does not prove analysis never occurred. Explain filenames,
relative hints, confidence meanings, and local/cloud storage.

**Verify**: codecs/SQL/types, archive, Nuxt/browser, docs, convention, and full
gates pass.

## Test plan

V1 normalization; v2 source-slot preservation; old/new draft codec migration
and rematch invalidation; concurrent merges; applied-value
snapshots/manual divergence; evidence-only no value mutation; confidence labels;
agreement edge cases; path sanitization; cloud/local parity; archive round-trip;
10k lens; keyboard/master-detail; actual DB/IDB read-back.

## Done criteria

- [ ] Evidence v2 accurately associates latest source, match, and applied value without claiming history.
- [ ] Cloud/local writes merge atomically and evidence-only never changes top-level BPM/key.
- [ ] The dense lens/inspector distinguishes identity match, analyzer confidence, agreement, and divergence.
- [ ] Nonblank values are never automatically replaced.
- [ ] Codec, SQL, archive, UI, accessibility, scale, docs, and full gates pass.

## STOP conditions

Stop if UI copy calls v1/v2 an audit history or ground truth, if confidences are
collapsed, if atomic source merge is unavailable, if absolute paths appear, or
if a v2 writer would strand old readers/archives.

## Maintenance notes

Keep observation/model/matcher/agreement versions explicit. A future immutable
timeline needs retention/query/privacy design separate from this bounded model.
