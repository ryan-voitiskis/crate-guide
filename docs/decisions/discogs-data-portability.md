# Discogs data portability and display decision

- **Status:** STOP - unresolved
- **Evidence checked:** 2026-07-22
- **Decision owner:** maintainer, not yet accepted
- **Provider position:** no written response recorded
- **Legal position:** no legal review or approval recorded
- **Applies to:** Plans 070 and 073, current cloud imports, future Local
  libraries, portable archives, and accountless Discogs access

This document is a source-controlled classification and decision gate. It does
not grant permission, record provider approval, or change current application
behaviour. Schema fixtures, archive export/reimport, accountless OAuth, and any
claim that Discogs-derived data may be displayed indefinitely must remain
blocked until the unresolved questions below have an accepted answer.

## Primary official evidence

Only first-party Discogs sources are used for this decision package.

| Source                                                                                                                          | Date used                                               | Relevant evidence                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)                                 | Last updated 2025-05-27; checked 2026-07-22             | Defines CC0 Data and Restricted Data, the six-hour display rule, necessary-storage limit, Restricted Data transfer limits, eligibility, and attribution.                                |
| [Developer documentation](https://www.discogs.com/developers/)                                                                  | Checked 2026-07-22; no page-level update date displayed | Documents API v2, identifying User-Agent requirements, pagination, current rate limits, OAuth, collection visibility, image access, and CC0 monthly data dumps.                         |
| [OAuth documentation](https://www.discogs.com/developers/#page:authentication)                                                  | Checked 2026-07-22                                      | Calls the OAuth 1.0a endpoints server-side, requires consumer and access secrets to remain private, gives request-token expiry, and states access credentials persist until revocation. |
| [Collection documentation](https://www.discogs.com/developers/#page:user-collection,header:user-collection-collection-get)      | Checked 2026-07-22                                      | Limits unauthenticated public collection reads to folder `0`; private collections and non-zero folders require owner authentication.                                                    |
| [Image documentation](https://www.discogs.com/developers/#page:images)                                                          | Checked 2026-07-22                                      | Requires authentication for image requests. The API Terms separately classify release, artist, label, and user images as Restricted Data.                                               |
| [Monthly data dumps](https://www.discogs.com/data/)                                                                             | Checked 2026-07-22                                      | Linked by the developer documentation as CC0. Their use as a durable metadata source is an unapproved alternative, not a settled interpretation of API Content retention.               |
| [Collection CSV documentation](https://support.discogs.com/hc/en-us/articles/360007331534-How-Does-The-Collection-Feature-Work) | Page dated 2026-06-03; checked 2026-07-22               | Documents a user-requested CSV export of an entire collection. It does not itself approve downstream archive redistribution.                                                            |

The [Discogs Privacy and Data Protection FAQ](https://support.discogs.com/hc/en-us/articles/360004240094-Privacy-and-Data-Protection),
last updated 2025-04-28, is privacy context only. It is not an additional data
licence or approval for Crate Guide's storage model.

## Classification rules

The matrix uses these deliberately conservative labels:

- **CC0-explicit:** the API Terms expressly name the underlying catalogue data.
  This is only an archive candidate. The API Terms also apply a six-hour display
  and necessary-storage rule to API Content generally, so CC0 classification
  alone does not resolve indefinite Local display or archive reimport.
- **Restricted-explicit:** the API Terms expressly classify the data as
  Restricted. Do not place it in a portable archive, transfer snapshot, or
  restored Local library without a written decision that specifically permits
  that use.
- **Derived:** Crate Guide computes the value from another field. The derived
  value inherits the source field's unresolved display and portability gate; a
  transform does not erase provenance.
- **User/application:** created independently by the user or Crate Guide. This
  classification is valid only when provenance proves it was not copied from a
  provider field.
- **Unknown:** the current official CC0 list does not clearly name the field.
  Treat it like Restricted Data for persistence and portability until resolved.
- **Operational/secret:** workflow state or credentials rather than library
  content. Retain only for its bounded purpose and never archive it.

Classification is by **source endpoint and source JSON path**, not by column
name. For example, release notes and dates can be CC0 catalogue data while
collection notes and membership dates are Restricted collection data.

## Source-path field matrix

`Candidate after decision` means the underlying data is expressly CC0 or
derived from expressly CC0 data. It is not approval to ship an archive.

| Provider endpoint and JSON path                                                                                      | Current Crate Guide field or state                                   | Classification                                                                                                                 | Display and attribution                                                                                                                                                                   | Retention and deletion                                                                              | Archive and reimport                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Release `title`                                                                                                      | `records.title`                                                      | CC0-explicit: release title                                                                                                    | Revalidate within six hours unless a written decision permits independently materialised CC0 display. Place the exact adjacent attribution beside the displayed data.                     | Retain only as accepted for the library service; preserve provider and user-override provenance.    | Candidate after decision. Restoring an archive must not silently claim freshness.    |
| Release `year`, `released`, or other catalogue dates                                                                 | `records.year` currently; other dates not persisted                  | CC0-explicit: release dates                                                                                                    | Same six-hour and adjacent-attribution gate.                                                                                                                                              | Same source-provenance requirement.                                                                 | Candidate after decision.                                                            |
| Release `artists[].name` and credit roles                                                                            | `records.artists[].name` and `.role`                                 | CC0-explicit: artist names and credits                                                                                         | Same six-hour and adjacent-attribution gate.                                                                                                                                              | Preserve per-field source and any later user override.                                              | Candidate after decision.                                                            |
| Release `artists[].id`                                                                                               | `records.artists[].discogs_id`                                       | Unknown: a Discogs catalogue ID may be an identifier, but the current Terms do not say so expressly                            | Do not depend on it for visible offline behaviour until accepted.                                                                                                                         | Provenance-only retention pending decision.                                                         | Exclude pending decision.                                                            |
| Release `labels[].name`                                                                                              | `records.labels[].name`                                              | CC0-explicit: label name                                                                                                       | Same six-hour and adjacent-attribution gate.                                                                                                                                              | Preserve source and user-override provenance.                                                       | Candidate after decision.                                                            |
| Release `labels[].catno`                                                                                             | `records.labels[].catno`                                             | CC0-explicit: catalogue number maps to the expressly named release identifiers; the accepted decision must record that mapping | Same gate.                                                                                                                                                                                | Preserve provenance.                                                                                | Candidate only after the interpretation is accepted.                                 |
| Release `labels[].id` and `labels[].entity_type`                                                                     | `records.labels[].discogs_id` and `.entity_type`                     | Unknown                                                                                                                        | Do not display as portable provider facts.                                                                                                                                                | Retain only if a written decision establishes necessity.                                            | Exclude pending decision.                                                            |
| Release `labels[].thumbnail_url`                                                                                     | `records.labels[].thumbnail_url`                                     | Restricted-explicit: image reference                                                                                           | Do not use a persisted URL as offline or stale artwork. Any approved live image display remains subject to authentication, freshness, and adjacent attribution.                           | Remove when no longer necessary and on any provider-data cleanup required by the accepted decision. | Exclude. Never fetch during export or restore preview.                               |
| Release `tracklist[].title`, `.position`, and `.duration`                                                            | `tracks.title`, `.position`, and `.duration`                         | CC0-explicit: track listing                                                                                                    | Same six-hour and adjacent-attribution gate.                                                                                                                                              | Preserve source and user-override provenance.                                                       | Candidate after decision.                                                            |
| Track `artists[].name`, `extraartists[].name`, and credit roles                                                      | `tracks.artists`, `tracks.extraartists` names and roles              | CC0-explicit: artist names and credits                                                                                         | Same gate.                                                                                                                                                                                | Preserve per-field provenance.                                                                      | Candidate after decision; embedded Discogs IDs remain Unknown.                       |
| Release `styles[]`                                                                                                   | `tracks.genres[]`                                                    | Unknown: genres and styles are absent from the current express CC0 list                                                        | Suppress or constrain pending a written answer.                                                                                                                                           | Do not normalise indefinite storage without approval.                                               | Exclude pending decision.                                                            |
| Release `formats[].descriptions`                                                                                     | `tracks.rpm`, computed as `45` or `33`                               | Derived from CC0-explicit format data                                                                                          | The displayed derived value inherits the unresolved source display gate.                                                                                                                  | Store the derivation and source provenance if accepted.                                             | Candidate after decision.                                                            |
| Release `id`                                                                                                         | `records.discogs_id`                                                 | Unknown: arguably an identifier, but not expressly identified as a Discogs catalogue ID in the CC0 list                        | Use as non-visible provenance only pending decision.                                                                                                                                      | Retain only if accepted as necessary for refresh/deduplication.                                     | Exclude pending decision.                                                            |
| Release `uri`                                                                                                        | `records.discogs_release_url`                                        | Unknown: the CC0 list expressly mentions third-party URLs, while this is a Discogs URL                                         | A source-page link is required for attribution, but storing this API value is not automatically approved. Prefer generating an accepted canonical link from an accepted source reference. | Delete if the underlying provider reference is not accepted.                                        | Do not freeze into the archive schema pending decision.                              |
| Release `images[].resource_url` and collection `basic_information.cover_image`                                       | `records.cover`, import-card image URL                               | Restricted-explicit: release image                                                                                             | Do not treat a stale external URL as durable library artwork.                                                                                                                             | Avoid indefinite persistence; remove when no longer necessary.                                      | Exclude. Never fetch or internalise automatically during export/reimport.            |
| Explicit user cover upload                                                                                           | Managed cover bytes plus `cover_storage_path`                        | User/application if upload provenance is reliable                                                                              | Display under the user-content contract, independently of a retained Discogs image URL.                                                                                                   | Keep/delete with the user library. `cover_storage_path` remains operational.                        | Include only bytes and a logical archive reference; exclude the storage path.        |
| OAuth identity `username`                                                                                            | `profiles.discogs_username`                                          | Restricted-explicit: Discogs User Data                                                                                         | Display only while necessary for an active integration, within the accepted freshness policy, with adjacent attribution where API-derived.                                                | Delete on disconnect, expiry, or provider-data cleanup.                                             | Exclude.                                                                             |
| User resource `avatar_url`                                                                                           | `profiles.discogs_avatar_url`                                        | Restricted-explicit: User Image                                                                                                | Prefer fresh/on-demand display if approved; never treat it as portable profile artwork.                                                                                                   | Delete on disconnect, expiry, or provider-data cleanup.                                             | Exclude.                                                                             |
| OAuth/user identifier represented by legacy application field                                                        | `profiles.discogs_uid`                                               | Unknown; conservatively Restricted                                                                                             | No visible dependency should be added.                                                                                                                                                    | No current write path was found; removal is a separate migration decision.                          | Exclude.                                                                             |
| Collection folders, membership, instance IDs, rating, grading, notes, and membership dates                           | `discogsStore` folder/release review state; not durable library rows | Restricted-explicit: collection                                                                                                | Keep the review surface fresh and put attribution beside every displayed provider-data group. A stale badge does not make display permissible.                                            | Memory-only and minimum necessary; discard after the operation or freshness limit.                  | Exclude.                                                                             |
| Collection `basic_information` object                                                                                | Import selection state                                               | Mixed: collection wrapper Restricted; individual catalogue fields require source-path classification above                     | Never classify or persist the entire object as CC0.                                                                                                                                       | Split accepted catalogue fields from collection state.                                              | Only separately accepted catalogue fields can be candidates.                         |
| Release `community.submitter`, `community.contributors`, `num_for_sale`, `lowest_price`, and similar response fields | Present in response types but not persisted by the current transform | Restricted user or marketplace data, or Unknown                                                                                | Do not add to library displays without a new classification.                                                                                                                              | Continue not persisting.                                                                            | Exclude.                                                                             |
| Imported title and artist copied into set history                                                                    | `sets.played_tracks[].track_title` and `.artist_display`             | Inherits the original track field's provenance                                                                                 | Apply the same display decision as the source field. Existing snapshots lack origin metadata.                                                                                             | Add provenance before claiming copies are user/application data.                                    | Omit or regenerate ambiguous legacy copies unless the accepted decision covers them. |
| Transfer result labels and release IDs                                                                               | Session-storage Discogs transfer snapshot                            | Operational plus possibly provider-derived display text                                                                        | Current snapshot has no source timestamp. Add expiry or remove provider display labels before relying on it beyond the active operation.                                                  | Session-only and bounded; clear on dismissal/account change.                                        | Exclude.                                                                             |
| OAuth request/access tokens and secrets                                                                              | `discogs_credentials`                                                | Operational/secret                                                                                                             | Never display or return to the browser.                                                                                                                                                   | Server-only, minimum necessary, deleted on disconnect and accepted expiry.                          | Never export or reimport.                                                            |
| Quota buckets, request IDs, errors, owner IDs, storage paths, and OAuth-completion flags                             | Database and workflow state                                          | Operational                                                                                                                    | Display only curated diagnostics where appropriate.                                                                                                                                       | Bounded retention or pruning.                                                                       | Never export or reimport.                                                            |
| BPM, key, mode, time signature, `audio_features`, `beatport_data`, and `playable`                                    | Track enrichment and application fields                              | Not Discogs-derived at import                                                                                                  | Classify under their actual user/application/provider source.                                                                                                                             | Preserve their independent provenance.                                                              | Outside this Discogs decision.                                                       |

## Freshness, retention, and attribution contract

Until a written decision says otherwise, implementers must assume all data
obtained through the API is subject to the following constraints even when its
catalogue category is CC0:

1. Do not display API Content more than six hours older than the corresponding
   Discogs information. `updated_at` is not provider freshness. A stale badge is
   not a substitute for revalidation or suppression.
2. Do not cache or store API Content longer than necessary to provide the
   accepted service. Persistent Local libraries and portable reimport are
   specifically unresolved uses.
3. Display `Data provided by Discogs.` directly next to each API-derived data
   group, linked to the exact Discogs page containing that data. Do not add
   `nofollow` or another mechanism that withholds ranking credit.
4. Keep the separate application-level non-affiliation notice in terms or usage
   documentation. The existing general notice wording remains unchanged by this
   decision package.
5. Attribution does not convert Restricted or Unknown data into portable data.
6. Disconnect, library deletion, archive restore, and provider revocation are
   separate lifecycle events and must not be described as equivalent.

The existing legal-page attribution points to the Discogs home page and is not
directly next to library/import data. It does not satisfy the adjacent exact-page
requirement on its own. This package records the requirement but intentionally
does not implement UI changes.

## Archive constraints before approval

Portable archive schema and golden fixtures must remain stopped unless an
accepted decision permits a useful field set. A constrained archive proposal
must, at minimum:

- exclude OAuth credentials, request tokens, device proofs, identity, username,
  avatar, collection folders/membership/notes/ratings, image URLs, external
  cover bytes, marketplace/community user data, transfer snapshots, quota rows,
  owner IDs, signed URLs, absolute paths, and storage paths;
- exclude every Unknown field until it is expressly classified;
- include only accepted CC0-explicit or independently user/application fields,
  with source and user-override provenance;
- preserve inherited provenance for immutable set-history copies;
- never fetch external artwork during export, inspection, or restore;
- never restore or reconnect a Discogs credential; and
- avoid displaying restored provider data until the accepted freshness decision
  permits it or a current revalidation succeeds.

If these exclusions make the archive unable to restore a useful library, stop
the archive release rather than silently widening the interpretation.

## Alternatives requiring separate acceptance

- **User-provided Discogs CSV:** Discogs officially offers collection CSV
  export. Local parsing could avoid OAuth, but user-provided files can still
  contain third-party data and do not prove downstream redistribution rights.
- **CC0 monthly data-dump index:** This may provide durable catalogue metadata
  under the dump's stated CC0 basis. Confirm whether it is independent of the
  API Content freshness/storage contract and evaluate index size, update cadence,
  and collection-privacy leakage before adopting it.
- **Manual entry and explicit user edits:** Provider-independent data is the
  clearest Local/archive path, but current rows do not retain enough field-level
  provenance to distinguish every historical user edit from an import.

## Unresolved questions and STOP gate

Obtain a written provider, legal, and maintainer decision answering all of the
following before marking this document accepted:

1. Does the six-hour display rule apply to CC0-explicit API data copied into a
   user-maintained Local library or restored from a private portable archive?
2. Does the necessary-storage rule permit persistent cloud/Local libraries and
   user-directed archive export/reimport?
3. May a user-authorised collection membership be materialised as a local
   library, and may public folder-zero membership be used the same way?
4. Are Discogs catalogue IDs, internal Discogs URLs, genres/styles, and entity
   type codes CC0 Data?
5. May release, label, or avatar image URLs be retained or rendered after the
   immediate authenticated operation?
6. What adjacent-attribution layout is accepted for cards, tables, record
   details, set history, transfer summaries, and offline/restored views?
7. Does using monthly data dumps, rather than the API, permit durable display
   under CC0 without the API's six-hour rule?
8. Does a user-provided collection CSV support the proposed local import and
   private archive flow without additional provider permission?

The accepted record must name the decision owner, source or written provider
response, exact approved fields, display policy, retention/deletion policy,
archive/reimport policy, attribution placement, and effective date. Until then:

- **Provider approval:** unresolved
- **Legal approval:** unresolved
- **Maintainer acceptance:** unresolved
- **Schema/archive gate:** STOP
- **Accountless Discogs production gate:** STOP

## Drift control

Run:

```bash
node --test scripts/check-discogs-doc-contract.test.mjs
npm run check:discogs-docs
```

The checker protects the dated official sources, source-path classification,
freshness/retention restrictions, archive exclusions, attribution requirement,
and explicit unresolved STOP state. It cannot supply provider or legal approval.
