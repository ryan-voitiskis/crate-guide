# Enrichment draft recovery and privacy contract

Track enrichment drafts are device-local recovery state. They let someone
continue a careful review after navigation, reload, or browser restart without
requiring a Crate Guide account. They are not a library backup, a cloud-synced
draft, or permission to apply changes later without another check.

## Product promise

Signed-out and accountless use should provide the complete local enrichment
workflow. An account is not an integrity requirement: the active workspace and
repository identify the library, and current-library rematching protects writes.
The meaningful difference is durability:

- A browser library and its enrichment draft stay in this browser profile on
  this device. Crate Guide does not receive or back them up.
- Clearing site data, using a temporary/private profile, losing the device, or
  switching browser profiles can remove local data.
- A cloud library may back up applied library changes remotely, but its
  enrichment review draft remains local recovery state unless a future product
  explicitly introduces private draft sync.

Use this primary explanation wherever local durability is introduced:

> Saved in this browser, not backed up to Crate Guide.

Expanded help text should say:

> You can close this tab and resume this review on this browser profile. Clearing
> browser data or losing this device can remove it.

Never use `backed up`, `synced`, or `saved to your account` for a local draft.
`Saved locally` must always retain the device qualifier.

## One active review per workspace

The first contract allows one active enrichment draft for each exact
workspace/repository pair. It does not store a raw Crate Guide account or
Supabase user ID. Cloud drafts instead use a deterministic, pseudonymous
device-local routing alias derived for this purpose. That alias separates cloud
libraries on the device; it is not encryption or anonymization. Browser-library
workspace IDs remain byte-identical. Repository revision is retained as
provenance, but a revision change is a reason to rematch, not a reason to bind a
draft to an obsolete library snapshot.

On the source step, an active-review strip should show:

- the sanitized source label and source kind;
- reviewed, staged, changed, done, and retry counts;
- the last successful local-save time and current save state;
- the device-local durability explanation;
- `Resume`, `Start fresh`, and `Delete draft` actions.

`Start fresh` must confirm that it replaces this device's saved review for the
current library. `Delete draft` is explicit and separate. Neither action should
delete library content or local-audio analysis cache entries.

When persistence is connected, save status should use these states:

- `Saving…`
- `Saved locally 14:32`
- `Couldn't save—keep this tab open`
- `Open in another tab—review here is read-only`

Times need an accessible full date/time label. Status changes should be
announced without stealing focus. A second tab must not overwrite the active
writer; takeover is an explicit later persistence action, not a last-write-wins
shortcut.

If another tab deletes a draft while this tab still has its review in memory,
this tab must keep that review visible but read-only, cancel pending saves, and
block source selection. It must not silently recreate the deleted draft. The
recovery notice should say that the saved review was deleted elsewhere and
offer `Start fresh`, which explicitly discards the in-memory review. Resume,
takeover, keep, replace, and delete transitions are mutually exclusive while a
destructive action is settling, so a completed delete cannot be followed by a
stale hydration or replacement write.

## Persisted data boundary

The versioned draft DTO contains only:

- schema, matcher, parser-provenance, and sanitized-snapshot versions;
- device-local workspace routing ID, repository ID and observed repository
  revision;
- draft revision and timestamps;
- a sanitized source kind, basename-style label, dataset fingerprint, and
  reconnect requirement;
- purpose-built observations needed to rematch: display metadata, bounded
  relative location hints, duration, proposed values and their provenance,
  warnings, and minimal analysis confidence/version evidence;
- separate source/target bindings plus intent-specific proposal/blank-field or
  current-Evidence fingerprint preconditions for reviewed decisions;
- sanitized success/failure outcome codes; and
- useful review filter, sort, density, and anchor state.

It must never contain review rows, full track or record snapshots, absolute
locations, raw XML, raw audio, `File`, blobs, file/directory handles, promises,
workers, object URLs, dialogs, apply-in-flight state, or raw provider errors.
Recursive validation runs before schema parsing and before unknown future intent
payloads are discarded. Rejected diagnostics report JSON-pointer locations, not
the rejected private values.

Local-audio identity is the versioned tuple of canonical relative path, byte
size, and last-modified time. XML identity is the sanitized dataset fingerprint
plus a unique Rekordbox TrackID; missing or duplicate TrackIDs use an ordered,
snapshot-local ID. Fingerprints are deterministic identity checks, not proof of
authenticity or a substitute for rematching.

## Resume is a new safety check

Every resume reads the current active library and runs the current matcher. A
persisted target is never trusted as a library snapshot. A previously staged
decision can be staged again only when all of these remain exact:

1. matcher policy permits retention;
2. source fingerprint and sanitized observation fingerprint;
3. rematched target track ID;
4. recognized intent kind and version;
5. proposed BPM/key/mode values and their evidence source;
6. expected nullable target update timestamp;
7. BPM and key/mode blank-field preconditions; and
8. current stageability.

Any mismatch leaves the item unstaged. Unknown future intents retain only inert
provenance and are always unstaged; the current app must not reinterpret them as
fill-empty-fields approval.

`evidence-only` is a recognized but inert provenance intent while its atomic
writer and archive compatibility gates remain closed. Resume checks its exact
source snapshot/fingerprint/observation identity, current matcher target, target
update timestamp, and bounded current-Evidence fingerprint, then always returns
it unstaged and unsupported—even if persisted `staged` was true. It has no fill
proposal or partial write outcome and cannot change top-level BPM/key values.
Older readers demote it to unknown, safely unstaged provenance; unknown future
kinds and future versions of known intents remain inert under the same rule.

Changed items should be grouped under `Changed since last review`, with a
specific explanation:

| Internal classification | User-facing explanation                                        |
| ----------------------- | -------------------------------------------------------------- |
| Source missing          | This source item is no longer in the saved source snapshot.    |
| Source changed          | Source evidence changed; review the proposal again.            |
| Target deleted          | The previously reviewed library track no longer exists.        |
| No longer matching      | The current matcher no longer selects the same library track.  |
| Proposal changed        | The proposed value or its evidence source changed.             |
| Already filled          | The library field is no longer blank.                          |
| Target changed          | The target changed since this decision was reviewed.           |
| Preconditions changed   | The fields eligible to fill changed.                           |
| No longer stageable     | Current conflicts or evidence now require manual review.       |
| Matcher policy changed  | Matching rules changed; review this decision again.            |
| Unknown intent          | This decision came from a newer app version and is not staged. |

A migration/resume summary should report retained, changed, dropped, and
intentionally unstaged decisions before the user returns to the table. No
restored decision is applied automatically.

## Source recovery

XML drafts store a compatible sanitized observation snapshot, not the XML. They
can resume review and rematch from that snapshot. A parser provenance change can
remain reviewable when the sanitized snapshot version is unchanged. A changed
snapshot format is usable only through an explicit, pure migrator for that exact
source kind and version pair. Otherwise show `Re-import XML` or `Delete draft`;
never imply the parser ran again.

Local-audio drafts can resume review of evidence already scanned or analyzed.
They do not retain files or browser permission handles. Any new scan or
reanalysis must show:

> Reconnect folder to continue analysis.

After selection, reconcile files by canonical relative path, size, and
last-modified time. Report missing and changed files before analysis. Do not
promise that browser file permission survives restart, and do not block review
of already saved sanitized evidence merely because files are disconnected.

## Partial apply recovery

Successful writes stay `Done`. Failed writes remain available to retry with a
sanitized failure category. Keep the draft until every intended write succeeds
and the result is acknowledged, or the user explicitly chooses to keep or
delete it. A retry still rebuilds current preconditions and uses the current
repository operation context; the old outcome is history, not write authority.

## Versioning rule

Schema v1 is the first real on-disk contract. Do not manufacture a historical
schema merely to exercise migration code. The evidence-only intent is an
additive part of the not-yet-released schema v2 and retains v2 because older v2
readers already fail it closed as unknown. After a schema ships, a future intent
or shape change must bump the schema and add a golden fixture plus a pure,
explicit migrator. A future schema the current app cannot understand is
preserved as incompatible state and offered for app upgrade or deletion; it is
never coerced into a known write intent.
