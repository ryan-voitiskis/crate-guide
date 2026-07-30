# Plan 062: Add source-controlled browser security headers

> **Executor instructions**: Set headers in the application response path used
> by the Cloudflare Pages Nitro deployment. Begin with low-risk enforced
> containment and a report-only resource policy. Do not guess a full CSP or
> rely on a dashboard-only setting.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- nuxt.config.ts app/utils/themeBootstrap.ts server .github/workflows/verify.yml package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 052 and 059
- **Category**: security / defense in depth
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

Production HTML is frameable and lacks source-controlled containment headers.
No XSS is currently established, but browser-held local libraries make
clickjacking and same-origin script containment more consequential. The policy
must survive the real Nitro/Cloudflare response path and accommodate the
deterministic inline theme bootstrap deliberately.

## Current state

- `nuxt.config.ts:14-17` uses `nitro.preset = 'cloudflare-pages'` and defines no
  response-header policy.
- `nuxt.config.ts:52-71` injects an inline anonymous-theme bootstrap.
- A 2026-07-21 live GET returned no CSP, HSTS, nosniff, referrer, permissions,
  or frame policy and exposed `x-powered-by: Nuxt`.
- Cloudflare `_headers` alone is not sufficient for Pages Function/advanced
  Worker responses; verify the generated application response.

Reference: [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).

## Commands you will need

| Purpose           | Command                                               | Expected on success             |
| ----------------- | ----------------------------------------------------- | ------------------------------- |
| Header unit tests | `node --test scripts/check-security-headers.test.mjs` | all pass                        |
| Build             | `npm run build`                                       | exit 0                          |
| E2E               | `npm run test:e2e`                                    | all pass, no CSP/browser errors |
| Full gate         | `npm run verify`                                      | exit 0                          |

## Scope

**In scope**:

- `nuxt.config.ts` and/or `server/middleware/security-headers.ts`
- a pure header-policy module and tests
- `scripts/check-security-headers.mjs` plus tests
- `.github/workflows/verify.yml`, `package.json`
- `app/utils/themeBootstrap.ts` only if a deterministic hash/external script is
  needed
- security/deployment documentation

**Out of scope**: Cloudflare dashboard mutation, WAF rules, an analytics/report
collector, third-party script adoption, or claiming an XSS fix.

## Git workflow

- Branch: `codex/062-add-browser-security-headers`
- Commit: `feat(security): add browser response policies`

## Steps

### Step 1: Prove the response boundary

Add a negative test that boots or inspects the same built response path as the
Cloudflare preset and currently fails for missing headers. Assert redirects,
HTML, static assets, and error responses separately; do not add HSTS to local
HTTP test responses.

**Verify**: the negative fixture fails before policy implementation.

### Step 2: Enforce low-risk containment

On production HTTPS responses, set
`Strict-Transport-Security: max-age=86400` without `includeSubDomains` or
`preload`. Treat increasing duration or adding either flag as a separate hosted
verification/domain-ownership decision. On HTML responses set:

- enforced CSP: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- `X-Frame-Options: DENY` as legacy defense
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a least-privilege Permissions-Policy disabling unused camera, microphone,
  geolocation, payment, USB, and browsing-topics capabilities

Remove `x-powered-by`. Do not put private signed URLs, nonces, or secrets in a
header.

**Verify**: header unit/build tests pass and the app remains usable.

### Step 3: Derive a report-only resource policy

Inventory actual connect/image/worker/font/script/style sources from built
output and browser flows. Add `Content-Security-Policy-Report-Only` for the
future full policy. Prefer externalizing or hashing the deterministic theme
bootstrap; do not add broad `unsafe-eval`, `*`, or data allowances without an
observed requirement and test. External Discogs cover origins and Supabase
connect endpoints must be expressed narrowly.

**Verify**: authenticated synthetic E2E, demo, auth callbacks, covers, local
audio Worker/WASM, and legal pages produce no unexpected violation/error.

### Step 4: Gate builds and document release verification

Make CI fail if required directives disappear or become broader. Document a
read-only `curl -I` production check for the post-deploy release; deployment
itself still requires separate authorization.

**Verify**: build, header script, E2E, conventions, and full gate pass.

## Test plan

Test production versus local HTTP, HTML versus asset, duplicate/case-insensitive
headers, error responses, policy token allowlists, inline bootstrap hash drift,
and absence of `x-powered-by`. Browser tests must fail on unexpected console or
page errors via Plan 052's fixture.

## Done criteria

- [x] The built production response carries enforced frame/base/object containment and standard hardening headers.
- [x] A report-only resource policy is derived from observed sources, not guessed.
- [x] CI detects missing or materially broadened headers.
- [x] A post-deploy read-only smoke command is documented; no dashboard-only dependency remains.

## STOP conditions

Stop if the tested header path differs from production Nitro output, if a
directive breaks an unexplained first-party flow, or if HSTS scope/preload is
requested without explicit domain/subdomain approval.

## Maintenance notes

Promoting the full resource CSP from report-only to enforced is a separate,
evidence-led release decision. Every new external origin must update both the
policy and a browser test.
