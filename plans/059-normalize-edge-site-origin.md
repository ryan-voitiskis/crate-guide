# Plan 059: Normalize and validate the Edge site origin

> **Executor instructions**: Centralize `SITE_URL` parsing and make CORS use a
> serialized origin. Test all browser-facing entrypoints. Do not weaken CORS to
> a wildcard or echo arbitrary request origins.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- supabase/functions/_shared/cors.ts supabase/functions/get-discogs-request-token/handler.ts supabase/functions/.env.example README.md supabase/functions/*/index.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / configuration
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: READY

## Why this matters

The function env example allows a trailing slash, but the CORS helper emits the
raw value. Browser origins never include that slash, so an allowed production
configuration makes five function responses unreadable to the SPA.

## Current state

`supabase/functions/_shared/cors.ts:1-11` currently does:

```ts
const siteUrl = Deno.env.get('SITE_URL')?.trim()
export const corsHeaders = { 'Access-Control-Allow-Origin': siteUrl, ... }
```

`get-discogs-request-token/handler.ts:36-51` separately parses the same value
to build a callback. The shared entrypoints are authenticated Discogs request,
both OAuth token functions, cover cleanup, and account deletion.

## Commands you will need

| Purpose       | Command                                   | Expected on success |
| ------------- | ----------------------------------------- | ------------------- |
| Edge tests    | `npm run test:edge`                       | all pass            |
| Edge checks   | `npm run check:edge && npm run lint:edge` | exit 0              |
| Docs contract | `npm run check:discogs-docs`              | exit 0              |
| Full gate     | `npm run verify`                          | exit 0              |

## Scope

**In scope**:

- a shared `SITE_URL` configuration module and tests under `supabase/functions/_shared`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/get-discogs-request-token/handler.ts` and tests
- all browser-facing function `index.ts` integration tests
- `supabase/functions/.env.example`, `.env.example`, README, Discogs docs

**Out of scope**: multiple allowed origins, request-origin reflection, hosted
secret mutation, OAuth state changes, or browser security headers (Plan 062).

## Git workflow

- Branch: `codex/059-normalize-edge-site-origin`
- Commit: `fix(edge): normalize configured site origin`

## Steps

1. Create one pure parser returning `siteOrigin` and `siteBaseUrl`. Require
   absolute HTTP(S), no credentials, query, or fragment. Accept an empty/root
   path with or without trailing slash; STOP if subpath hosting is actually an
   intended deployment contract and specify it explicitly before proceeding.
2. Use `parsed.origin` for `Access-Control-Allow-Origin`; use the normalized
   base URL only for callback construction. Preserve the narrow allowed-header
   list and never emit `*`.
3. Add table-driven tests for localhost, HTTPS, slash/no slash, whitespace,
   credentials, non-HTTP schemes, path, query, fragment, and missing values.
4. Exercise OPTIONS plus one normal response through every shared entrypoint;
   assert the exact normalized ACAO value.
5. Align examples/docs and state that `SITE_URL` is one origin, not a URL path.

**Verify after each step**: focused Edge tests, then the full commands above.

## Test plan

Use injected environment/config rather than mutating process-global state
between concurrent tests. A documented `https://crate.guide/` value must yield
`https://crate.guide` in every CORS response and the correct OAuth callback.

## Done criteria

- [ ] Slash and no-slash root URLs yield the same exact CORS origin.
- [ ] Invalid or ambiguous URLs fail fast with a redacted configuration error.
- [ ] All browser-facing Edge entrypoints share the tested parser.
- [ ] Edge, docs, convention, and full gates pass.

## STOP conditions

Stop if multiple origins or subpath hosting are required, if any function has a
different trust origin, or if a fix would reflect the request origin.

## Maintenance notes

Future functions must import the shared CORS contract and join its entrypoint
test. Hosted env verification remains an operational release step.
