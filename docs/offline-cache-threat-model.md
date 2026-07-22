# Offline cache threat model

## Status and invariant

This document defines the request-classification boundary for a future Local
app shell. It does not register a service worker, enable runtime caching, make
the application installable, or claim that offline reopening works.

Only explicitly inventoried, immutable, first-party static assets may become
cache candidates. Every authenticated, provider, signed, downloadable,
user-specific, dynamic, external, or unknown request is denied. A later
generated-artifact audit must reject the complete precache manifest if any entry
does not receive an `allow` decision.

Cache Storage is application delivery. Local library entities, preferences,
managed cover Blobs, drafts, revisions, and recovery metadata remain in the
versioned IndexedDB repository and must never enter Cache Storage.

## Request inventory

| Request class                        | Current examples                                                                   | Cache classification                                         | Reason                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Hashed Nuxt assets                   | `/_nuxt/<hash>.js`, route CSS                                                      | Allow candidate                                              | Immutable first-party build output                                        |
| Local Workers and WASM               | Rekordbox Worker, local-audio Worker, Essentia WASM                                | Allow candidate only when emitted as hashed `/_nuxt/` assets | Required static application code, still subject to bundle/storage budgets |
| Public fonts, icon, and textures     | Exact paths listed in `offlineCachePolicy.json`                                    | Allow candidate                                              | Source-controlled first-party assets                                      |
| HTML and navigation                  | `/`, Local routes, error pages                                                     | Deny for now                                                 | Navigation fallback and update compatibility require later Plan 076 work  |
| Non-success responses                | Error bodies and request identifiers                                               | Never cache                                                  | May expose dynamic diagnostics and cannot establish a usable asset        |
| Supabase REST/Auth/Storage/Functions | `*/rest/v1/*`, `*/auth/v1/*`, `*/storage/v1/*`, `*/functions/v1/*`                 | Never cache                                                  | Authenticated or user-specific cloud traffic                              |
| OAuth and auth routes                | `/auth/finalising`, `/auth/*`, callback URLs and token/code/state query parameters | Never cache                                                  | May contain credentials or identity-bound state                           |
| Discogs and other providers          | Discogs API, Discogs artwork, any provider subdomain                               | Never cache                                                  | External/provider content with separate freshness and rights constraints  |
| External images                      | Provider covers, avatars, signed remote covers                                     | Never cache                                                  | May be private, signed, mutable, or outside the application origin        |
| Archives and downloads               | `.crate-guide`, ZIP, XML, CSV, NDJSON, attachment responses                        | Never cache                                                  | User-controlled data and explicit file-transfer boundary                  |
| Signed URLs                          | Supabase Storage or any URL with token/signature/expiry parameters                 | Never cache                                                  | Bearer capability and private object access                               |
| Application/user data                | records, tracks, crates, sets, preferences, managed covers, drafts                 | Never cache                                                  | IndexedDB or authenticated repository ownership, not app-shell delivery   |
| Unknown first-party URLs             | New paths not added to the explicit inventory                                      | Never cache                                                  | Fail-closed default                                                       |

The application origin is supplied to the classifier so production, previews,
and local test origins use the same policy. Same-origin status alone never makes
a request cacheable. Only `GET` requests for exact public assets or supported,
hash-shaped files directly under `/_nuxt/` can be allowed. The filename check is
only a conservative shape gate; the later artifact auditor must prove that each
entry came from the semantic build manifest.

## Classifier contract

`scripts/offline-cache-policy.mjs` is pure and performs no network, filesystem,
Cache Storage, or service-worker work. It accepts a URL plus request/response
metadata and returns one of:

- `{ cache: "allow", reason: ... }` for an explicitly inventoried static asset;
- `{ cache: "deny", reason: ... }` for every other input, including malformed
  and unknown inputs.

Authorization headers, URL credentials, user-data markers,
attachment/`Set-Cookie` responses, and `private` or `no-store` cache-control
directives override a static-looking URL. Percent-encoded paths, query strings,
and fragments are denied because generated immutable assets do not need them and
they can carry structural ambiguity, signed capabilities, or OAuth material.

The adversarial fixtures cover path normalization, origin confusion, provider
lookalikes, custom-domain Supabase service paths, source maps, unhashed build
files, private response metadata, downloads, and object URLs. Add a failing
fixture before widening either allowlist.

## Later generated-artifact audit

A later Plan 076 slice may read the actual Cloudflare Pages service worker and
precache manifest. That auditor must:

1. pass every candidate URL through this classifier and fail on every denial;
2. separately prove root scope, hashed output, content type, response cache
   headers, and the intended navigation fallback;
3. inspect the final manifest for authenticated/provider/signed/archive/user
   data rather than trusting PWA-tool configuration; and
4. keep service-worker registration and hosted offline claims blocked until the
   Local repository, archive recovery, update coordination, browser matrix, and
   separately authorized deployed smoke all pass.

The current classifier does not authorize a navigation fallback, install a PWA
dependency, or change `nuxt.config.ts`.
