# Plan 073: Enable Discogs for Local libraries without a user account

> **Executor instructions**: Begin with current official Discogs API/OAuth terms
> and a written threat/privacy decision. The target is a device-scoped server
> integration while the library remains in IndexedDB. Never expose Discogs
> consumer/access secrets to browser storage, exports, URLs, or logs. STOP if the
> provider or abuse model cannot support this safely.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- docs/discogs-integration.md docs/decisions/accountless-discogs.md scripts/check-discogs-doc-contract.mjs scripts/check-discogs-doc-contract.test.mjs package.json app/repositories/integrations app/stores/discogsAuthStore.ts app/composables/useDiscogsApi.ts app/stores/discogsStore.ts app/utils/discogs-import.ts shared/types/database.ts supabase/functions/_shared/types/database.ts supabase/functions supabase/migrations supabase/tests`

## Status

- **Priority**: P2
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 049, 059, 062, 067, and 071
- **Category**: direction / integration / security
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DEFERRED
- **Deferred at**: 2026-07-28
- **Resume ref**: `codex/accountless-mode-foundation` at `3253e15`
- **Product decision**: Discogs acquisition remains core, but accountless mode is
  outside the current delivery scope. The provider/legal/security STOPs remain
  intact for any later resumption.

## Why this matters

Discogs import is prominent acquisition functionality, but current OAuth binds
server-held credentials and every request to a Supabase user. Requiring an
account only for credential custody weakens the Local library promise. A true
accountless integration can keep library data local while the server holds an
optional, revocable Discogs connection keyed to this browser—not a fake user.

## Current state

- `docs/discogs-integration.md:11-68` describes authenticated server-held OAuth
  credentials.
- `discogsAuthStore.ts:25-63` and `useDiscogsApi.ts:93-117` invoke authenticated
  Edge Functions for connection and reads.
- acquisition/transformation/persistence are coupled; `discogs-data.ts` requires
  a cloud `userId` even for otherwise pure transformation.
- Browser-held provider secrets are not an acceptable shortcut. The Local
  library archive must exclude all integration credentials.

Official provider research must start at [Discogs Developers](https://www.discogs.com/developers/)
and current linked terms/rate-limit/OAuth documentation; save dated links and
decisions in `docs/decisions/accountless-discogs.md`.

## Commands you will need

| Purpose     | Command                                                                                 | Expected on success                       |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Edge        | `npm run check:edge && npm run lint:edge && npm run test:edge`                          | all pass                                  |
| Database    | `npm run test:db`                                                                       | integration security/retention tests pass |
| Types       | `npm run genTypes && npm run check:database-types`                                      | both generated copies match               |
| Docs        | `node --test scripts/check-discogs-doc-contract.test.mjs && npm run check:discogs-docs` | positive/negative contract tests pass     |
| Browser/E2E | `npm run test:e2e && npm run test:browser`                                              | OAuth/local import flows pass             |
| Full gate   | `npm run verify:full`                                                                   | exit 0                                    |

## Scope

**In scope**: provider/terms verification, threat model/ADR, decoupled Discogs
source from target repository, device-scoped integration secret/proof, Edge and
DB credential lifecycle, OAuth callback binding, quotas/retention/disconnect,
separate browser integration database, both generated database type copies,
positive docs checker/tests, Local import UX, privacy/docs/tests.

**Out of scope**: storing provider secrets in IndexedDB/export, public open
proxying, anonymous Supabase Auth users, uploading the Local library, scraping,
multiple simultaneous device-scoped Discogs identities, or silently falling
back to an account requirement.

## Git workflow

- Branch: `codex/073-enable-accountless-discogs-connection`
- Commit: `feat(discogs): add device-scoped local integration`

## Steps

### Step 1: Resolve provider and threat-model gates

Verify current OAuth flow, callback rules, credential custody, CORS, rate limits,
public collection alternatives, terms, and retention expectations from official
sources. Revalidate and extend Plan 070's field matrix. The current official
[Discogs API Terms](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use)
(last updated 2025-05-27 at planning time) distinguish CC0 from Restricted Data,
constrain stale display/storage, require adjacent `Data provided by Discogs`
attribution with a source link, and impose jurisdictional age-of-consent/US 18+
eligibility. Obtain a written provider/legal/maintainer decision on persistent
Local/cloud storage, archive export/reimport, image/collection/user Restricted
Data, six-hour freshness where applicable, direct attribution placement, and
signed-out age/terms consent. A generic privacy-page notice is insufficient.

Compare:

1. random device-scoped server credential lease (target);
2. account-held connection while Local remains active (fallback, not accountless);
3. browser-held token/secret (reject unless provider/security evidence reverses
   the current conclusion);
4. public-by-username reduced import.

Document assets, actors, abuse paths, XSS/device-secret theft, callback
substitution, enumeration, quotas, revocation, expiry, deletion, logs, and
privacy. Obtain maintainer acceptance of the device model before schema/code.

**Verify**: ADR contains dated primary sources, field classification, chosen
model, rejected options, eligibility/attribution UX, retention, and explicit
STOP/constrained decision. If persistent import/export cannot be defended,
constrain the data model/refresh behavior or stop; do not implement accountless
OAuth on an incompatible storage promise.

### Step 2: Decouple metadata source from library destination

Make Discogs fetch/transform produce account-neutral domain records/tracks and
send them to the active Plan 068 repository. Cloud and browser imports use the
same transformation/transfer runner; cloud ownership is adapter-derived and
local IDs are generated by the browser repository. Preserve provider pacing,
duplicate rules, cancellation, retry, and selected-folder ownership.

**Verify**: pure transformation and cloud parity tests pass before new auth.

### Step 3: Add a device-scoped server integration

On explicit connect, generate a high-entropy browser integration ID and secret.
Store only a keyed verifier digest server-side; keep provider request/
access credentials server-side encrypted/secret-managed as current architecture
permits. Bind OAuth request token, verifier completion, callback nonce/state,
and final credentials to the exact device integration. The browser retains only
the random device authorization secret in a separate same-origin
`crate-guide-integrations` IndexedDB database owned by a narrow integration
repository—not the Local library or audio-cache databases. It is excluded from
portable snapshots, library clear/restore, and diagnostics; clearing all site
data still removes it. Do not describe it as encrypted or inaccessible to
same-origin script.

The first version supports one explicitly named Discogs identity per browser
device connection, shared across that browser's Local workspaces. Replacing it
requires Disconnect/revocation first; never silently retarget credentials when
the active Local workspace changes.

Every Edge read requires proof of that secret, a narrow endpoint allowlist,
device/global quotas, expiry, and safe correlation IDs. Initial unauthenticated
OAuth-start abuse must have a source-controlled IP/device/global bound; STOP if
the deployment cannot enforce one. Never accept arbitrary upstream URLs.

**Verify**: replay/substitution/enumeration/cross-device/expired/revoked/abuse
tests and function privilege tests pass.

### Step 4: Define retention, recovery, and disconnect

Use a maximum 10-minute pending OAuth lease and a separately documented active
inactivity expiry (initially 90 days only if official terms/ADR permit it),
bounded pruning, explicit Disconnect, and device-secret rotation. Clearing site
data loses the only device proof, so the app cannot claim it disconnected the
server credential. In first-run/connect recovery copy, direct the user to the
official Discogs
[Applications settings](https://support.discogs.com/hc/en-us/articles/360007423833-How-Do-I-Change-My-Account-Settings)
to revoke Crate Guide access, then reconnect; orphaned server credentials also
retire at expiry. Local library deletion, integration disconnect, provider-side
revocation, and cloud account deletion remain separately scoped.

**Verify**: time-travel pgTAP/Edge tests prove exact retirement and no global-row
damage.

### Step 5: Ship transparent Local UX and privacy

Explain: library metadata remains in this browser; connecting Discogs sends API
requests and temporarily stores a device-scoped connection on Crate Guide's
server; it is not a library backup. Before connect, present the approved
age/terms eligibility and data-retention/export explanation. Put required
Discogs attribution beside every API-derived surface, not only in legal pages.
Show connection/expiry/disconnect state and lost-site-data provider revocation
recovery. Exclude device/provider secrets from archives, diagnostics, URLs, and
logs. External cover requests remain disclosed.

Every import confirmation names the destination Local workspace. A workspace
switch must cancel/settle the owned transfer before activation, and stale device
responses cannot write the new workspace. When signed in, label the device
connection used by Local libraries separately from any account-owned Discogs
connection used by the cloud library.

**Verify**: complete browser OAuth/import/readback/disconnect flow, docs contract,
SQL/Edge, accessibility, and full gates pass.

## Test plan

Official-contract fixture; OAuth start/callback replay and mix-up; device proof
rotation/theft boundary; rate-limit exhaustion; cross-device/account; malformed
upstream path; local versus cloud destination; reload/clear/expiry/disconnect;
snapshot/import retry; archive forbidden-secret scan; redacted logs.

## Done criteria

- [ ] A signed-out Local library can connect/import without creating a Supabase user.
- [ ] Library data remains local; only the disclosed optional integration state is server-held.
- [ ] Provider secrets never reach portable/browser application data.
- [ ] Device proof lives only in the separate integration database and lost-proof revocation is truthful.
- [ ] OAuth, quotas, eligibility, attribution, retention/export, disconnect, source/destination separation, and privacy gates pass.

## STOP conditions

Stop if official terms prohibit the model, if anonymous OAuth start cannot be
abuse-bounded, if the device secret would grant a general proxy, if credential
at-rest handling is unacceptable, if required attribution/eligibility cannot be
presented, if retained/exported fields cannot be classified, or if callbacks
cannot bind to one device.

## Maintenance notes

Review official provider requirements at every integration change. Device-scoped
does not mean serverless; keep that distinction visible to users and reviewers.
