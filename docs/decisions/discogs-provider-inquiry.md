# Discogs provider inquiry

- **Status:** deferred - not sent
- **Prepared:** 2026-07-23
- **Deferred:** 2026-07-28
- **Owner action required:** review and authorize external submission
- **Related gates:** Plans 070 and 073

This is a copy-ready request for written provider guidance. Preparing it does
not grant permission, resolve the legal review, or change either STOP in
[`discogs-data-portability.md`](./discogs-data-portability.md) or
[`accountless-discogs.md`](./accountless-discogs.md).

## Submission target

Use the `Submit a request` path linked from the official
[Discogs API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use).
Do not send from an automated process. Retain the submitted text, provider case
identifier, complete response, responder identity/role when supplied, and dates
in the response record below.

## Copy-ready request

**Subject:** Guidance for private local-library persistence, backup, and
device-scoped OAuth

Hello Discogs API team,

Crate Guide is a personal, non-commercial, open-source music-library tool. We
are considering a mode where a person's library is stored in IndexedDB in their
own browser, without a Crate Guide account and without Crate Guide remotely
backing up that library. A separate optional integration would use Discogs OAuth
through Crate Guide's server. We have not implemented or enabled the proposed
archive or accountless OAuth designs while the questions below remain open.

The proposed safeguards are:

- Discogs consumer secrets and OAuth access credentials remain server-side and
  never enter browser library data, URLs, logs, diagnostics, or backups.
- Portable backups are private files explicitly downloaded by the user for
  restoring their own library; they are not published, shared, sold, or used for
  advertising or analytics.
- Discogs usernames, collection folders/membership/notes/ratings, marketplace
  data, image URLs or bytes, avatars, and credentials would be excluded from
  portable backups unless Discogs expressly approves a narrower item.
- Visible API-derived groups would carry `Data provided by Discogs.` beside the
  data with a link to the exact Discogs page, and the application would retain
  the required non-affiliation notice.
- Crate Guide would honor provider rate limits and could refresh, suppress, or
  delete data according to the policy Discogs confirms.

Could you please answer the following questions in writing?

1. Do the API Terms' six-hour display rule and necessary-storage rule apply to
   expressly CC0 catalogue fields copied from the API into a person's private,
   persistent cloud or browser library? If so, must those fields be revalidated
   or suppressed after six hours?
2. May those CC0 catalogue fields be included in a private, user-directed backup
   and later reimported solely to restore that user's library? Does this count as
   transferring Content to a third party when the file is delivered only to the
   same user?
3. May a user-authorized collection membership be materialized as records in
   that user's private local library? Is the answer different for public folder
   `0`, private/custom folders, or a collection CSV explicitly exported by the
   user?
4. Are release IDs, Discogs release URLs, genres/styles, catalogue numbers, and
   entity-type codes included in the API Terms' CC0 categories? Which of these
   may be retained for refresh, deduplication, private backup, and restore?
5. Are the monthly CC0 data dumps independent of the API Content six-hour
   display and necessary-storage rules for durable catalogue metadata? May a
   local application combine a user's collection CSV or selected release IDs
   with fields obtained from those dumps?
6. Is the proposed adjacent attribution acceptable on cards, tables, record
   details, immutable set snapshots, and offline/restored views? If offline
   display cannot link at that moment, must API-derived fields be hidden until a
   connection is available?
7. May one registered Discogs application store server-side OAuth credentials
   for a user under a random, pseudonymous device-integration identifier when
   that user has no Crate Guide account? The browser would hold a separate
   high-entropy proof; credentials and the application secret would remain on
   the server, and each connection would still identify the authorized Discogs
   username to its user.
8. If that device-scoped model is acceptable, are there provider-required
   credential expiry, revocation, eligibility, audit, or per-device abuse
   controls beyond the documented OAuth flow and API rate limits?

If an answer depends on narrower constraints, please state the permitted fields,
display/freshness policy, retention/deletion policy, backup/reimport policy,
attribution placement, and OAuth identity model. We are happy to exclude fields
or keep the existing account-bound integration rather than infer permission.

Thank you.

## Response record

Do not change the related ADRs to accepted until this record is complete and the
response has been reviewed for the exact proposed use.

| Field                                  | Recorded value                                   |
| -------------------------------------- | ------------------------------------------------ |
| Submitted by                           | Pending                                          |
| Submitted at                           | Pending                                          |
| Provider case/reference                | Pending                                          |
| Complete submitted text                | Use the exact reviewed revision of this document |
| Provider responder and role            | Pending                                          |
| Provider response date                 | Pending                                          |
| Complete response location             | Pending                                          |
| Approved fields                        | Pending                                          |
| Display/freshness policy               | Pending                                          |
| Retention/deletion policy              | Pending                                          |
| Private backup/reimport policy         | Pending                                          |
| Attribution policy                     | Pending                                          |
| Device-scoped OAuth position           | Pending                                          |
| Additional provider controls           | Pending                                          |
| Legal review                           | Pending                                          |
| Maintainer decision and effective date | Pending                                          |

## After a response

1. Preserve the complete response, not only a paraphrase.
2. Update the dated primary evidence and every affected source-path row in
   `discogs-data-portability.md`.
3. Record legal review separately; provider guidance is not legal approval.
4. Resolve or retain each STOP explicitly. Silence or an ambiguous response does
   not approve schema, archive, display, or accountless OAuth work.
5. Run `npm run check:discogs-docs` before any implementation begins.
