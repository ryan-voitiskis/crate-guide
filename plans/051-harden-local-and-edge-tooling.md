# Plan 051: Harden local and Edge tooling

> **Executor instructions**: Treat script names and health output as safety
> contracts. Test process errors through injected boundaries, pin the exact Edge
> dependency used by the root lockfile, and require an explicit staging target
> before any remote mutation. Do not contact a remote project during tests.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 059 (historical Plan 029 has landed)
- **Category**: developer tooling / deployment safety / reproducibility
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

The local supervisor accepts any HTTP status below 500 as a healthy Edge
function, including a missing function's 404. Child spawn errors are logged but
the lifecycle promise waits only for `exit`, so a missing Nuxt executable can
leave its sibling and monitor alive indefinitely. The `setStagingSecrets`
command accepts any `SUPABASE_PROJECT_REF` under a staging-labelled name, and
uses implicit `npx`. Function-local Deno configs float on `@2` while the tested
root import and lockfile pin `2.110.7`.

A fresh clone is also not bootstrapped into a runnable configuration. The root
example leaves `SUPABASE_ANON_KEY` blank, setup never shows how to obtain the
local value or create the function env file, Nuxt accepts missing public
runtime values, and CI builds without exercising a deployable configuration.

## Scope

Modify or create:

- `scripts/dev-start.mjs`
- `scripts/dev-start.test.mjs`
- a small remote-secret wrapper and focused test
- `package.json`
- all six `supabase/functions/*/deno.json` files
- `.github/workflows/verify.yml`
- `.env.example`
- `CONTRIBUTING.md`
- `nuxt.config.ts`
- a small public-runtime configuration validator and focused test
- relevant README/local-development documentation

Do not run a real secret upload, change local Supabase ports, loosen JWT
deployment verification, or introduce an unpinned CLI download.

## Drift check

```bash
git status --short
rg -n "isHealthyFunctionStatus|spawnService|waitForExit|setStagingSecrets|SUPABASE_PROJECT_REF|supabase-js@|SUPABASE_ANON_KEY|SUPABASE_URL" scripts package.json nuxt.config.ts .env.example README.md CONTRIBUTING.md supabase/deno.json supabase/functions/*/deno.json
```

STOP the affected implementation step if no stable function-specific OPTIONS
response can distinguish a running worker from a router-level 404. The repository
currently has no authoritative staging project ref: in that case leave the
remote secret command absent/disabled, document the exact maintainer input
needed, and continue the independent lifecycle, pinning, runtime-config, and
local-bootstrap work. Never infer a ref from an arbitrary environment value.

## Required implementation

1. Make health checks function-specific.
   - Accept only the expected OPTIONS status/header contract from
     `authenticated-discogs-request`; reject 404, 405, 499, and malformed
     responses.
   - Use the same predicate for startup and ongoing monitoring and retain
     bounded timeouts/retries.

2. Unify child lifecycle settlement.
   - One promise settles once on `error`, `exit`, or `close` with a normalized
     cause.
   - A spawn failure marks the supervisor failed, terminates live siblings, and
     cannot leave the health monitor pending.
   - Signal shutdown remains idempotent and does not misreport an expected exit.

3. Make remote secret targeting explicit.
   - Replace the camelCase command with a conventional target-specific script.
   - The wrapper requires an authoritative staging ref and rejects a missing or
     different target before spawning the locked local Supabase CLI.
   - Validate the env-file path/readability without printing contents. Support a
     no-network dry-run that returns the exact argument array for tests.
   - The source of truth must be a maintainer-supplied, source-controlled
     staging deployment record. If it is still unavailable, land the tested
     disabled command/error contract and mark only this remote-mutation step
     blocked; it must not block Plans 052 or 068.

4. Pin and freeze Edge imports.
   - Make every function-local config use the exact root Supabase JS version.
   - Add a CI/test command that resolves each local config against the checked-
     in lockfile in frozen mode.

5. Make runtime configuration explicit and fail fast by execution mode.
   - Add one pure validator for `SUPABASE_URL` and `SUPABASE_ANON_KEY`, with
     redacted errors. Cloud-library builds/startup require both; the later
     browser-library mode may deliberately select a local-only capability set
     without constructing a Supabase client.
   - Add a local bootstrap command that reads the running local Supabase status
     through the locked CLI and prints/writes only the expected public values.
     It must not expose service-role keys or overwrite an existing `.env`
     without an explicit flag.
   - Update README and CONTRIBUTING with the root and function env-file steps,
     the reserved ports, and the distinction between public client keys and
     secrets. Never commit a real key.
   - Build CI once with deterministic non-secret placeholders and add a
     negative test proving a cloud-capable production build/startup rejects a
     missing or malformed value. Keep local-only unit tests able to run without
     contacting Supabase.

## Test plan

```bash
npm run format
npm run test:dev-start-script
node --test scripts/set-staging-secrets.test.mjs
npm run test:runtime-config
SUPABASE_URL=https://config.test.invalid SUPABASE_ANON_KEY=test-public-anon-key npm run build
npm run check:edge
npm run lint:edge
npm run test:edge
npm run check:conventions
npm run verify
git diff --check
```

Tests must cover router 404, expected OPTIONS response, timeout, Edge spawn
error, Nuxt spawn error, sibling termination, repeated signals, wrong project
ref, missing env file, dry-run arguments, and frozen resolution of every local
config.

## Done criteria

- [ ] A missing Edge function is never reported healthy.
- [ ] Every child spawn/exit path settles and shuts down siblings deterministically.
- [ ] A staging-labelled command cannot target an arbitrary Supabase project.
- [ ] Every deployed function resolves the exact tested Supabase SDK under frozen mode.
- [ ] Fresh-clone setup produces a runnable local public configuration, while a cloud-capable build/startup fails clearly on missing values.
- [ ] Tooling, Edge, convention, and full gates pass without a remote mutation.

## STOP conditions

Stop if tests would require real secrets or network mutation, if health cannot
distinguish worker readiness from gateway availability, or if deployment uses
a different config resolution rule than the proposed frozen check. Missing
staging-ref authority blocks only the remote-secret wrapper; do not invent a
target and do not abandon the independent gates.

## Git workflow

- Branch: `codex/051-harden-local-and-edge-tooling`
- Commit: `fix(tooling): harden local and edge workflows`
