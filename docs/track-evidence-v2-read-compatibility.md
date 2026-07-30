# Track Evidence v2 read compatibility

Track Evidence explains which bounded observations Crate Guide retained. It is
not an audit history, proof that a value is correct, or proof that analysis did
or did not occur.

This document describes the **read compatibility contract** and the signed-in
cloud writer that activates v2. The live track-row decoder accepts persisted
Evidence v1 and v2. Reviewed cloud enrichment writes v2 through the
owner-scoped, row compare-and-swap RPC. The browser-library repository and
portable archives do not write or claim to carry v2.

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

An application snapshot remains useful even after the bounded source slot is
replaced or removed: it still records the value, source, observation identity,
and application time. The reader accepts that snapshot but reports its source
observation as no longer retained; it never displays the newer slot as the
source of the older application. Migrated v1 data has no applied values or
observation identities and therefore keeps current v2 applied snapshots null.

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

### Incremental v1 upgrade

The bounded model permits a lossless, source-at-a-time upgrade. When the cloud
writer adds a current observation to a migrated v1 value:

- the touched source slot becomes a current `observation`;
- every untouched known v1 slot remains a `legacy-v1` observation;
- unknown fields from the touched known v1 slot move to
  `legacy.unknownFields.sources.<source>` rather than being discarded;
- `origin` becomes `v2`; and
- the `legacy` envelope remains attached so the unattributed global match,
  applied markers, and unknown v1 fields are not discarded or reassigned.

A current v2 object that retains any `legacy-v1` source slot is invalid without
that legacy envelope. Replacing a source slot intentionally supersedes that
source's previous latest observation; it does not create history or rewrite an
older application snapshot to point at the replacement.

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

## Derived Evidence statuses

Consumers can derive useful labels without changing the stored model:

- compare a track's current BPM or key/mode with the applied value snapshot to
  distinguish current from changed after application;
- label an application whose exact source observation was superseded or removed
  as source observation not retained;
- treat a populated value without an attributable current snapshot as
  unattributed;
- expose missing legacy sources honestly when a v1 marker names a source that
  was not retained; and
- apply a visible, versioned policy to latest source values for agreement and
  conflict.

These are display interpretations, not truth claims. Identity-match
confidence, analyzer confidence, agreement, and application state remain
separate axes.

## Read-only collection and selected-track views

The collection Evidence lens keeps its projection bounded for large libraries.
It shows current values, retained per-source BPM/key values, source-specific
identity-match state, latest observation dates, applied source/state, agreement
or conflict, and whether retained Essentia analyzer/configuration identifiers
differ from the current local-analysis configuration. The lens never retains
filenames, relative hints, or raw Evidence in its row projection.

The selected-track inspector may disclose the strictly decoded, privacy-safe
details needed to understand one retained observation:

- basename-style filenames and sanitized relative hints;
- Rekordbox track identity;
- source-specific match score, policy, reasons, and warnings;
- analyzer and configuration identifiers;
- analyzed segment duration and offset, sample rate, BPM estimates, BPM
  analyzer confidence, key strength, and analyzer warnings; and
- the applied value, source, application time, and a prominent changed-after-
  import state.

Identity-match confidence and analyzer metrics have separate headings and
labels. Filenames and relative hints are context for the retained observation,
not downloadable paths. Missing Evidence does not establish whether analysis
ran. These views provide comparison and inspection only; they do not overwrite
populated BPM/key values.

## Cloud write and concurrency contract

The cloud writer constructs one strict, complete v2 value and submits it with
the target row revision. The RPC validates ownership, schema, privacy,
idempotency, and the compare-and-swap precondition before replacing
`audio_features`. A concurrent update—including an observation from another
source—returns `stale`; it cannot silently replace either source slot. The
client must rehydrate the current row, require review again where bindings
changed, and retry with a newly constructed value. This is safe CAS-and-retry,
not a server-side merge of stale JSON.

An explicit `evidence-only` draft intent may retain reviewed Evidence without
changing populated top-level BPM/key/mode. It is never default-staged and resume
restores it only while source, observation, matcher target, target revision, and
current-Evidence bindings remain exact. The read-only collection lens and
inspector keep identity match, analyzer confidence, agreement, and divergence
separate.

The database rejects malformed v2, direct v2 mutation, and v2-to-v1 downgrade.
That makes a prior v1-only application unsuitable as an application-only
rollback once any v2 value exists.

Portable archives remain deferred and make no Evidence portability promise.
Any future archive writer must define and test v2 export/import compatibility
before presenting Evidence as portable.
