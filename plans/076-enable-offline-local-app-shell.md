# Plan 076: Enable fresh offline reopening for Local libraries

> **Executor instructions**: Add app-shell caching only after Local storage is
> stable. Cache versioned first-party static assets, Workers, and required WASM;
> never cache authenticated APIs, OAuth callbacks, private signed cover URLs,
> exports, or user library data in Cache Storage. Coordinate updates with open
> IndexedDB workspaces.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- nuxt.config.ts package.json package-lock.json app/components/layout/StatusWorkbench.vue app/repositories app/workers public scripts test`

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 053, 058, 062, 065, 066, and 071
- **Category**: direction / offline / PWA
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DEFERRED
- **Deferred at**: 2026-07-28
- **Resume ref**: `codex/accountless-mode-foundation` at `3253e15`
- **Product decision**: Defer with the signed-out Local launch. The checked-in
  cache threat model and policy remain reusable foundations.

## Why this matters

A Local library continues working when connectivity drops after the app loads,
but no service worker exists, so refresh/fresh launch offline can fail. The UI
must not say `Offline mode` as if reopening is guaranteed. A deliberately scoped
app shell can make Local work reliable offline without pretending cloud or
Discogs writes are queued.

## Current state

- Nuxt has no PWA/service-worker module or cache policy.
- Workbench assets include code-split chunks, local-audio Worker, and Essentia
  WASM; global KeepAlive is unrelated to fresh loading.
- Local library data belongs in IndexedDB; private covers may be local Blobs or
  remote/signed URLs.

Primary reference: [MDN PWA caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching).

## Commands you will need

| Purpose       | Command                                                                              | Expected on success                               |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Build/audit   | `npm run build && npm run check:pwa-artifacts && npm run check:client-bundle-budget` | Cloudflare artifacts/policies and budget pass     |
| E2E/browser   | `npm run test:e2e && npm run test:browser`                                           | production-shell and component flows pass         |
| Engine matrix | `npm run test:offline:matrix`                                                        | Chromium/Firefox/WebKit offline/update flows pass |
| Hosted smoke  | `npm run smoke:pwa -- --base-url "$CRATE_GUIDE_STAGING_URL"`                         | authorization-gated Pages proof passes            |
| Full gate     | `npm run verify`                                                                     | exit 0                                            |

## Scope

**In scope**: exact-pinned Nuxt/Vite PWA tooling and `package-lock.json` after licence/maintenance spike,
versioned precache/runtime policy, Local navigation fallback, update UX,
offline asset/Worker/WASM tests, generated Cloudflare artifact audit,
Chromium/Firefox/WebKit matrix, authorization-gated deployed smoke,
status/docs/privacy.

**Out of scope**: offline cloud write queue, caching Supabase/Discogs responses,
background sync, caching external/private cover URLs, automatic installation,
or moving library data out of IndexedDB.

## Git workflow

- Branch: `codex/076-enable-offline-local-app-shell`
- Commit: `feat(offline): cache the local workbench shell`

## Steps

### Step 1: Inventory and threat-model cacheable requests

Record every first-party static asset needed for records/tracks/crates/sessions,
archive restore, XML parsing, local audio Worker/WASM, fonts/icons, and error
shell. Classify all API/auth/OAuth/signed/external/download requests as network-
only. Evaluate a maintained PWA integration, exact-pin it, record licence/bundle
impact, and reject one that hides routing/cache rules.

**Verify**: a testable allowlist/denylist fails on an unknown sensitive request.

Add `check:pwa-artifacts` against the actual Cloudflare Pages build output. It
must locate the generated service worker/precache manifest, validate root scope,
hashed allowlisted entries, navigation fallback, denylisted URL patterns,
content type, and intended cache headers. `@nuxt/test-utils/e2e` may exercise a
production-built node fixture, but that is not proof of the Cloudflare artifact
or hosted Pages routing/header behavior.

### Step 2: Precache a versioned Local app shell

Precache hashed first-party build assets and a navigation fallback after one
successful online visit. Include lazily loaded Worker/WASM needed for supported
offline analysis, respecting Plan 053 size budgets and explaining initial cache
size. Use cache-first only for immutable hashed assets and network-first/bypass
for HTML updates as appropriate; offline navigation falls back to the last
compatible shell.

**Verify**: after online install, a new page context can reload each Local route
offline and read/write its IDB workspace in Chromium, Firefox, and WebKit.

### Step 3: Exclude sensitive/dynamic traffic by construction

Never cache Supabase REST/Auth/Storage/Functions, Discogs/provider images,
OAuth callback/finalising URLs, signed cover URLs, library archives/downloads,
or error responses containing request IDs. Local cover Blobs continue through
the repository/object URL path, not Cache Storage.

**Verify**: Cache Storage inspection after complete synthetic flows contains no
forbidden URL/body/header and offline cloud/Discogs actions show unavailable.

### Step 4: Coordinate updates and schema compatibility

Do not force `skipWaiting` over an active mutation/import/restore. Show a compact
`Update ready` action; acquire the workspace lock, flush/reject active work,
reload, run Plan 069 schema migration, and retain recovery if another tab blocks.
Old/new tabs must not corrupt one workspace. Remove obsolete versioned caches
only after the new worker activates safely.

**Verify**: two-tab old/new worker, active edit, blocked upgrade, rollback, and
cache cleanup tests pass.

### Step 5: Correct connectivity UX and docs

After successful shell install label offline Local state `This browser · Offline`.
Before install/caching completes, say `Offline reopening not ready`. Cloud
offline remains unavailable with an explicit switch option. Document that first
visit/updates need network and external covers/integrations may be unavailable.

**Verify**: responsive/accessibility, online/offline/update E2E, build, security
header, convention, and full gates pass.

### Step 6: Prove the deployed Cloudflare boundary

With separate staging-deploy authorization, run a read-only Playwright/curl smoke
against the exact deployed commit. Record service-worker script status/MIME/
cache headers/scope, registration and control state, precache contents, hard
offline reload of every Local route, Worker/WASM use, update activation, and the
forbidden-request/cache scan. Exercise the same release in real Safari where
possible; Playwright WebKit is supporting evidence, not Safari proof. Never
call local Node-fixture success hosted proof.

**Verify**: dated URL/commit/browser evidence passes. Without deployment
authorization, report this gate as outstanding rather than weakening it.

## Test plan

First visit offline; install online then hard reload offline; every core route;
Worker/WASM analysis; archive restore; missing cached chunk; cache quota; update
mid-edit/restore; two tabs; schema version mismatch; forbidden request scan;
cloud/Discogs offline; external/local covers; uninstall/site-data clear;
Chromium/Firefox/WebKit capability differences; generated Cloudflare artifact;
authorization-gated hosted Pages scope/header/offline smoke.

## Done criteria

- [ ] A previously loaded compatible Local workbench can reopen and mutate offline.
- [ ] No authenticated/provider/signed/archive/library data enters Cache Storage.
- [ ] Updates coordinate with active work and IndexedDB schema rather than forcing reload.
- [ ] Status copy distinguishes connectivity, shell readiness, and library location.
- [ ] Browser matrix, generated Cloudflare artifact, security, bundle, accessibility, and full gates pass.
- [ ] A deployed release is not called verified until the separately authorized hosted smoke passes.

## STOP conditions

Stop if the cache tooling cannot enforce the denylist, if required WASM breaks
the approved storage/bundle budget, if updates can strand an IDB schema, or if
offline UX implies cloud/Discogs synchronization.

## Maintenance notes

Audit the generated precache manifest and denylist on every major Nuxt/PWA
upgrade. Cache Storage is application delivery, not the user's library backup.
