# Maintenance Handover (2026-02-20)

## Scope Completed

Recent maintenance work is split across these commits:

1. `a21f593` - `chore: refresh tests docs and session track card`
2. `1dba199` - `chore: bump safe npm deps and keep nuxt typecheck green`
3. `28fd0fa` - `test: clear lint baseline in store/composable tests`

## Current Health

As of this handover, local verification passes:

- `npm run lint` ✅
- `npm run test:run` ✅ (815 tests)
- `npm run typecheck` ✅
- `npm run build` ✅

## Important Context

- NPM cache on this machine can fail with `EPERM` if using the default global cache path.
- Use a temporary/project-local cache for npm commands, e.g.:
  - `npm_config_cache=/tmp/npm-cache-crate-guide npm outdated`
  - `npm_config_cache=/tmp/npm-cache-crate-guide npm install ...`
- `nuxt.config.ts` currently contains a scoped `@ts-expect-error` for `@tailwindcss/vite` plugin typing mismatch with Nuxt/Vite internal types. This is intentional and keeps `nuxt typecheck` green.

## Dependency State (Still Outdated)

`npm outdated` currently reports only out-of-range upgrades:

- `@nuxt/test-utils` `3.23.0` -> `4.0.0`
- `@nuxtjs/supabase` `1.6.2` -> `2.0.4`
- `eslint` `9.39.2` -> `10.0.0`
- `jsdom` `27.4.0` -> `28.1.0`
- `lucide-vue-next` `0.563.0` -> `0.575.0`
- `vitest` `3.2.4` -> `4.0.18`
- `zod` `3.25.76` -> `4.3.6`

## Explicit Deferral

- `zod` 4.x is intentionally deferred for now due compatibility risk with current `vee-validate` usage.

## Recommended Next Pass (Major Upgrades)

Perform this in small commits, one subsystem at a time:

1. Testing stack:
   - Upgrade `vitest` + `jsdom` (+ related typings if needed).
   - Re-run `npm run test:run`, `npm run lint`, `npm run typecheck`.
2. Nuxt ecosystem:
   - Upgrade `@nuxtjs/supabase` and `@nuxt/test-utils`.
   - Validate runtime behavior and auth/discogs flows.
3. Lint stack:
   - Upgrade `eslint` to 10.x only after plugin compatibility check.
4. UI icon package:
   - Upgrade `lucide-vue-next` (0.x minor can contain breaking changes; treat as cautious change).

## Guardrails for Next Agent

- Keep each major upgrade in its own commit for easier rollback.
- Do not combine `zod` upgrade in this pass.
- After each upgrade step, run:
  - `npm run lint`
  - `npm run test:run`
  - `npm run typecheck`
  - `npm run build`
- If introducing temporary compatibility annotations (like `@ts-expect-error`), document why inline.
