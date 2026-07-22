# Track Evidence v2 read compatibility

Track Evidence explains which bounded observations Crate Guide retained. It is
not an audit history, proof that a value is correct, or proof that analysis did
or did not occur.

This document describes a **compatibility reader only**. The live track-row
decoder and every production writer remain on Evidence v1. Nothing in this
foundation writes v2 to the database, browser library, archive, or enrichment
workflow.

## Bounded v2 contract

Evidence v2 retains at most one observation in each known source slot:

- `rekordboxXml`
- `embeddedTags`
- `essentiaBrowser`

Each current observation has a stable observation ID and time, source-specific
identity-match evidence, and the matcher policy version used to produce that
match. Rekordbox evidence can retain its Rekordbox track ID. Essentia evidence
continues to retain separate analyzer and configuration identities.

Identity-match confidence and analyzer confidence are deliberately separate.
Agreement between sources is also a separate, versioned interpretation; it
must never be presented as correctness.

An applied BPM or key/mode snapshot records:

- its source;
- the exact source observation ID;
- the value applied; and
- when the value was applied.

The compatibility reader rejects a current snapshot if its source slot is
absent or its observation ID does not exactly match that slot. This prevents a
dangling attribution from being displayed as valid provenance. Migrated v1
data cannot satisfy this relationship and therefore keeps current v2 applied
snapshots null.

The model version is `latest-per-source-v1`. There is no observation array and
no append-only history hidden in JSON. A future immutable timeline would need a
normalized table with explicit retention, query, privacy, and archive design.

## Honest v1 migration

The reader deterministically maps a privacy-safe v1 value accepted by the
compatibility reader into a v2-shaped `v1-migrated` result. It does not generate
IDs, timestamps, applied values, or source associations.

| V1 field                                        | Read-compatible representation                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Root `updatedAt`                                | Preserved verbatim as migrated `updatedAt`                                                      |
| Latest known source slot                        | One explicit `legacy-v1` observation in the corresponding source slot                           |
| Source `importedAt`                             | Preserved verbatim as `observedAt`; not reinterpreted as another event                          |
| Missing observation ID                          | `observationId: null` plus `missing-observation-id`                                             |
| One global match                                | Preserved under `legacy.globalMatch`; never copied onto individual sources                      |
| Missing source-specific match                   | `match: null` plus `missing-source-match`                                                       |
| V1 applied marker                               | Preserved under `legacy.applied`; current applied snapshot remains null                         |
| Missing applied value and observation ID        | Explicit `missing-application-values-and-observation-ids` limitation                            |
| Missing Rekordbox track ID                      | `rekordboxTrackId: null` plus `missing-rekordbox-track-id`                                      |
| Unknown root, container, marker, or source data | Preserved in the nearest explicit `unknownFields` envelope                                      |
| Unknown source slot                             | Preserved under `legacy.unknownFields.sources`; never promoted to a known source interpretation |

Legacy timestamps and finite numeric values remain in the domain accepted by
the existing v1 row decoder. Migration does not silently normalize or clamp
them. Non-finite numbers are not JSON-compatible and are rejected.

## Strict and privacy-preserving reads

The reader has a 49,152-byte serialized ceiling, matching the existing
persisted `audio_features` budget. Known arrays and text fields have additional
bounds. Authorable current-v2 observations also require nonempty basename-style
filenames, nonempty analyzer/configuration identities, and identity-match
scores in the established 0–100 range. The migrated-v1 branch remains as
permissive as the old reader for those fields so compatibility does not rewrite
old meaning. Current v2 objects reject undeclared keys at every level. Explicit
`unknownFields` containers exist only for honest v1 preservation; they are not
an extension mechanism for current v2.

Before schema parsing, the reader rejects:

- cyclic, non-plain, BigInt, function, undefined, and other non-JSON values;
- forbidden payload fields associated with raw audio, XML, file handles,
  object URLs, workers, or whole row/entity snapshots;
- absolute local paths, including encoded, Windows, UNC, and `file:` forms; and
- non-canonical relative hints, parent traversal, encoded traversal, encoded
  separators, and backslash traversal.

Failures contain stable issue codes and JSON-pointer locations only. They do
not echo rejected values in logs or UI-facing errors. The codec fails closed;
it does not silently strip a private value and call the remainder lossless.

## Future Evidence statuses

Later consumers can derive useful labels without changing the stored model:

- compare a track's current BPM or key/mode with the applied value snapshot to
  distinguish current from changed after application;
- treat a populated value without an attributable current snapshot as
  unattributed;
- expose missing legacy sources honestly when a v1 marker names a source that
  was not retained; and
- apply a visible, versioned policy to latest source values for agreement and
  conflict.

These are display interpretations, not truth claims. This compatibility step
does not add those UI labels or an agreement policy.

## Integration gates still closed

Before any production writer can emit v2, Plans 070, 074, and 075 still need to
provide and verify:

1. atomic per-source repository merges and compare-and-swap behavior for both
   cloud and accountless browser repositories;
2. a database/RPC validator and migration that old readers cannot silently
   downgrade;
3. archive import/export round-trips with old and new golden fixtures;
4. a versioned enrichment-draft intent for explicitly approved evidence-only
   saves, including rematch invalidation;
5. fill-only value behavior, with populated conflicts sent to review rather
   than overwritten; and
6. Evidence lens and inspector UX that separates identity match, analyzer
   confidence, agreement, and divergence.

Until those gates pass, `TrackAudioFeatures` intentionally remains the v1 type,
`decodeTrackRow` remains v1-only, and active enrichment merge functions keep
writing v1.
