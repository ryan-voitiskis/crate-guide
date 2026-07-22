# Accountless Discogs connection decision

- **Status:** STOP - unresolved
- **Evidence checked:** 2026-07-22
- **Target:** a device-scoped server credential for a Local library with no
  Crate Guide account
- **Provider position:** no written response recorded
- **Legal position:** no legal review or approval recorded
- **Maintainer acceptance:** not yet recorded

This ADR evaluates how a signed-out Local library could use Discogs. It records
a conditional target and rejected/constrained alternatives; it does not approve
implementation. The current account-bound OAuth flow remains the only
implemented Discogs connection.

The related [data portability decision](./discogs-data-portability.md) controls
which provider fields may be stored, displayed, archived, or restored. This ADR
cannot be accepted while that decision remains STOP.

## Primary official evidence

Only first-party Discogs sources are used.

| Source                                                                                                                                        | Date used                                               | Relevant evidence                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)                                               | Last updated 2025-05-27; checked 2026-07-22             | Defines content classes, six-hour display, necessary storage, attribution, Restricted Data transfer limits, and minimum contract-age eligibility; users in the US must be at least 18. |
| [Developer and rate-limit documentation](https://www.discogs.com/developers/#page:home,header:home-rate-limiting)                             | Checked 2026-07-22; no page-level update date displayed | Requires an identifying User-Agent and currently documents 60 authenticated or 25 unauthenticated requests per source IP in a moving 60-second window.                                 |
| [OAuth documentation](https://www.discogs.com/developers/#page:authentication)                                                                | Checked 2026-07-22                                      | Describes three server-side OAuth 1.0a endpoints, private consumer/access secrets, 15-minute request-token/verifier expiry, and non-expiring access credentials until user revocation. |
| [Collection documentation](https://www.discogs.com/developers/#page:user-collection,header:user-collection-collection-get)                    | Checked 2026-07-22                                      | Documents owner authentication for private collections and non-zero folders, with public folder `0` as the limited unauthenticated alternative.                                        |
| [Image documentation](https://www.discogs.com/developers/#page:images)                                                                        | Checked 2026-07-22                                      | Requires authenticated image access; images remain Restricted under the API Terms.                                                                                                     |
| [Account settings](https://support.discogs.com/hc/en-us/articles/360007423833-How-Do-I-Change-My-Account-Settings)                            | Page dated 2025-07-23; checked 2026-07-22               | Identifies Applications settings for app access and Developers settings for registered applications/tokens.                                                                            |
| [Application Name and Description Policy](https://support.discogs.com/hc/en-us/articles/360009207054-Application-Name-and-Description-Policy) | Page dated 2024-03-20; effective 2019-12-11             | Permits accurate integration wording while prohibiting implied affiliation or endorsement.                                                                                             |
| [Collection CSV documentation](https://support.discogs.com/hc/en-us/articles/360007331534-How-Does-The-Collection-Feature-Work)               | Page dated 2026-06-03; checked 2026-07-22               | Documents a user-requested collection CSV export as a possible no-OAuth input.                                                                                                         |

Live first-party checks on 2026-07-22 confirmed that an unauthenticated release
request used the current 25-request tier and that a public collection exposed
folder `0`. OAuth endpoint preflights returned an error and did not advertise
the required GET/POST methods. CORS on some public API responses therefore does
not establish browser OAuth support. The official server-side flow and
secret-custody requirements are the controlling architecture evidence.

## Product boundary

`Accountless` means **no Crate Guide account**. OAuth still requires the person
to sign in to and authorise a Discogs account. The library remains in the
browser, but the optional integration is not serverless: Crate Guide's server
would hold provider credentials and observe bounded Discogs request metadata.
It is not a library backup.

Do not describe the mode as anonymous to Crate Guide, as storing a stable device
integration, request metadata, and a provider username is pseudonymous server
processing even without a Supabase user.

## Options considered

| Option                                                               | Provider and security assessment                                                                                                                                                                                                                   | Decision state                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Random device-scoped server credential                               | Fits the documented third-party, server-side OAuth flow without requiring a Crate Guide user row. Consumer and access secrets remain server-side. It adds anonymous-start abuse, XSS/device-proof, callback, orphan, retention, and privacy risks. | Conditional target; STOP pending all gates.                                                |
| Existing account-held connection while Local remains active          | Reuses the implemented identity-bound credential repository and abuse controls. It still requires a Crate Guide account, so it does not meet the product goal.                                                                                     | Operational fallback, not accountless.                                                     |
| Browser-held consumer secret, OAuth access secret, or personal token | Conflicts with the provider instruction not to disclose secrets, exposes a powerful credential to same-origin script/XSS and browser storage, and is not supported by the observed OAuth CORS behaviour.                                           | Rejected.                                                                                  |
| Public-by-username folder-zero import                                | Technically available for a public collection without OAuth, but username and collection remain Restricted Data. It cannot access private collections, custom folders, or private notes.                                                           | Constrained alternative; disabled until provider approval covers materialising membership. |
| User-provided Discogs CSV                                            | Avoids OAuth and is an official user export path. Local parsing can minimise server disclosure, but the CSV is not proof of downstream archive rights and may not contain full track metadata.                                                     | Research fallback; requires the portability decision.                                      |
| CSV plus CC0 monthly data-dump index                                 | Could separate user-selected membership from catalogue metadata obtained from an expressly CC0 dump. A server lookup could still reveal collection membership, and dump/API contract boundaries remain unresolved.                                 | Research spike only after written classification.                                          |
| Manual record entry                                                  | Does not use Discogs provider data unless the user copies it manually.                                                                                                                                                                             | Provider-independent Local fallback.                                                       |

## Conditional target architecture

If and only if the provider, legal, privacy, abuse, and maintainer gates are
accepted, the first accountless version should have these boundaries:

1. On explicit connect, create a random, high-entropy integration ID and device
   proof. Store only a keyed verifier digest server-side and compare proofs in
   constant time. Never put the proof in a URL, log, archive, library database,
   diagnostic bundle, or provider request.
2. Keep the Discogs consumer secret, OAuth request secret, access token, and
   access secret server-side. Credential-at-rest treatment must be separately
   accepted; the provider instruction to keep secrets private does not by itself
   approve the repository's storage mechanism.
3. Keep the browser proof in a separate same-origin integration database, not
   the Local library or audio cache. It remains accessible to same-origin
   JavaScript and must not be described as encrypted or XSS-proof.
4. Bind the pending OAuth request token, one-time transaction, callback token,
   verifier exchange, and final credential to the exact device integration.
   Completion must require both the matching pending token and device proof.
   Do not rely on undocumented preservation of an OAuth `state` parameter.
5. Set the pending transaction to a maximum 10-minute lease, below the
   provider's documented 15-minute request-token/verifier expiry.
6. Allow one explicitly named Discogs identity per browser integration. Replacing
   it requires explicit disconnect before reconnect; a workspace switch never
   silently retargets the provider credential.
7. Expose only fixed operations such as identity, folders, folder releases, and
   release details. Construct upstream URLs server-side. Never accept an
   arbitrary host, URL, path, query object, HTTP method, or request body.
8. Enforce source-IP, device, and global quotas before any provider dispatch.
   The global limit must protect the shared server egress IP and follow the
   provider response headers/backoff; 60 authenticated requests per minute is
   not a per-device allowance.
9. Record only bounded correlation and operation classifications. Redact
   usernames, release lists, provider URLs containing identity, device proofs,
   OAuth tokens, verifiers, signatures, and authorization headers from logs.
10. Define inactivity and absolute expiry, bounded pruning, explicit disconnect,
    device-proof rotation, and lost-proof recovery before implementation. A
    proposed 90-day inactivity period is a Crate Guide policy requiring
    acceptance, not a provider-approved value.

## Threat model

### Assets

- Discogs consumer secret and registered application reputation
- per-user OAuth request/access tokens and secrets
- device integration proof and verifier digest
- Discogs username, collection membership, private folders, and notes
- shared provider quota and Crate Guide Edge/database capacity
- Local library integrity and exact destination workspace

### Actors and abuse paths

- An unauthenticated client can create integrations or repeatedly start OAuth to
  exhaust Crate Guide or Discogs quota.
- An attacker can enumerate integration IDs, replay callbacks, substitute a
  request token, or try to bind the attacker's Discogs identity to a victim
  browser.
- Same-origin XSS can read or use a browser-held device proof and then request
  the victim's provider data. A non-extractable key would still be usable by
  compromised same-origin script and is not a complete control.
- A leaked device proof can become a collection-reading bearer capability if
  the endpoint allowlist or response minimisation is too broad.
- An arbitrary upstream path creates an open proxy, SSRF, scraping, and quota
  amplification risk.
- Clearing site data can destroy the only browser proof while a non-expiring
  provider credential remains server-side, creating an orphan.
- Logs, error bodies, callback URLs, analytics, or diagnostics can leak OAuth
  tokens, verifiers, usernames, collection membership, or device identifiers.
- A user signed into multiple Discogs identities can authorise the wrong account;
  the callback must show and require confirmation of the resulting username.
- A stale transfer from one Local workspace can write into another workspace
  after a switch unless the destination and operation generation remain bound.

### Required controls and tests

- high-entropy unguessable proof, keyed server digest, constant-time comparison,
  rotation, revocation, and cross-device rejection;
- one-time OAuth request token and verifier use, exact callback binding,
  replay/mix-up/substitution tests, and finite pending expiry;
- endpoint allowlist with fixed request schemas and negative SSRF/open-proxy
  tests;
- IP/device/global rate limits, concurrency limits, provider-header telemetry,
  bounded retry, and anonymous-start exhaustion tests;
- XSS-aware scope minimisation, restrictive application CSP, no provider secret
  in browser state, and no claims that the browser proof is inaccessible;
- redacted logs/errors and forbidden-secret scans of archives and diagnostics;
- inactivity/absolute expiry, bounded orphan pruning, disconnect idempotency, and
  lost-proof recovery tests; and
- immutable Local workspace ownership through fetch, transform, save, retry,
  cancellation, and workspace switch.

## Credential lifecycle

The provider says access credentials do not expire unless the user revokes
access. Crate Guide must therefore impose and disclose its own finite lifecycle:

1. `pending`: one device-bound OAuth request, at most 10 minutes;
2. `active`: one confirmed provider identity with accepted inactivity and
   absolute expiries;
3. `rotating`: old device proof invalidated atomically when a new proof is
   issued;
4. `disconnecting`: credential made unusable before deletion is acknowledged;
5. `expired` or `revoked`: provider secrets deleted and reads rejected; and
6. `orphaned`: browser proof lost, server row available only to bounded expiry
   pruning.

Application disconnect can delete Crate Guide's stored token but must not claim
to revoke the provider-side application grant. If proof is lost, direct the
person to Discogs Applications settings for immediate provider-side control and
let bounded server expiry remove the orphan. The exact live revoke UX must be
verified before release; no API revocation endpoint is assumed here.

## Eligibility, attribution, and privacy UX

No API request should occur before the accepted eligibility and terms surface.
The conservative wording must let the person confirm they can enter the
agreement where they live and, if in the United States, are at least 18. Do not
collect a birth date or infer jurisdiction merely to satisfy this gate. If the
server must enforce the acknowledgement, retain only the accepted policy
version and timestamp unless a legal decision requires more.

The connect surface must distinguish:

- `Local library`: stored in this browser and not backed up by Crate Guide;
- `Discogs connection`: optional, device-scoped, and temporarily server-held;
- `Discogs account`: still required for OAuth even though no Crate Guide account
  is required; and
- `server-visible traffic`: bounded connection identifiers and Discogs requests
  pass through Crate Guide's server even though library persistence remains
  local.

Every API-derived visible group must put `Data provided by Discogs.` directly
next to the data and link to the exact Discogs page containing it without
`nofollow`. A generic legal-page link is insufficient. The separate existing
non-affiliation notice remains required and is not replaced by this attribution.

Connection UI must show the confirmed Discogs username, last use, expiry,
disconnect action, provider-revocation route, and a truthful lost-site-data
explanation. It must never describe connection state as a backup.

## Constrained fallback while stopped

Until all gates are accepted:

- keep the implemented account-held OAuth architecture for users who choose a
  Crate Guide account;
- allow Local/manual library functionality without Discogs;
- do not ship browser-held provider tokens;
- do not enable public-by-username import merely because the endpoint responds;
- consider a user-provided CSV flow only as a separately reviewed Local import;
- do not implement accountless OAuth schema, endpoints, or credential storage;
  and
- do not change privacy or terms copy to promise a device connection that does
  not exist.

## Unresolved questions and STOP gate

The copy-ready provider request and response record are in
[`discogs-provider-inquiry.md`](./discogs-provider-inquiry.md). Sending it still
requires owner review and authorization.

Before implementation, obtain and record:

1. written provider acceptance that one registered application may hold OAuth
   credentials keyed to a pseudonymous browser integration rather than a Crate
   Guide account;
2. the accepted data field, freshness, retention, archive, reimport, image, and
   attribution decision in `discogs-data-portability.md`;
3. the accepted end-user eligibility/terms acknowledgement and minimum data
   retained as evidence;
4. maintainer acceptance of device-proof XSS risk, provider credentials at
   rest, request metadata, finite expiries, orphan pruning, and lost-proof UX;
5. deployable IP/device/global anonymous-start controls that protect the shared
   provider quota before dispatch; and
6. exact callback binding and endpoint allowlist designs with negative tests.

Until the record names the decision owner, written evidence, effective date,
and accepted constraints:

- **Provider approval:** unresolved
- **Legal approval:** unresolved
- **Maintainer acceptance:** unresolved
- **Accountless schema/code:** STOP
- **Production enablement:** STOP

## Drift control

Run:

```bash
node --test scripts/check-discogs-doc-contract.test.mjs
npm run check:discogs-docs
```

The checker protects the dated sources, unresolved state, target secret custody,
threat model, alternatives, eligibility, attribution, retention, and STOP
conditions. Passing it is documentation consistency, not provider or legal
approval.
