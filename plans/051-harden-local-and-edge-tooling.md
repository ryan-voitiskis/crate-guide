# Plan 051: Harden local and Edge tooling

> **Executor instructions**: Treat script names and health output as safety
> contracts. Test process errors through injected boundaries, pin the exact Edge
> dependency used by the root lockfile, and require an explicit staging target
> before any remote mutation. Do not contact a remote project during tests.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 029
- **Category**: developer tooling / deployment safety / reproducibility
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

The local supervisor accepts any HTTP status below 500 as a healthy Edge
function, including a missing function's 404. Child spawn errors are logged but
the lifecycle promise waits only for `exit`, so a missing Nuxt executable can
leave its sibling and monitor alive indefinitely. The `setStagingSecrets`
command accepts any `SUPABASE_PROJECT_REF` under a staging-labelled name, and
uses implicit `npx`. Function-local Deno configs float on `@2` while the tested
root import and lockfile pin `2.110.7`.

## Scope

Modify or create:

- `scripts/dev-start.mjs`
- `scripts/dev-start.test.mjs`
- a small remote-secret wrapper and focused test
- `package.json`
- all six `supabase/functions/*/deno.json` files
- `.github/workflows/verify.yml`
- relevant README/local-development documentation

Do not run a real secret upload, change local Supabase ports, loosen JWT
deployment verification, or introduce an unpinned CLI download.

## Drift check

```bash
git status --short
rg -n "isHealthyFunctionStatus|spawnService|waitForExit|setStagingSecrets|SUPABASE_PROJECT_REF|supabase-js@" scripts package.json supabase/deno.json supabase/functions/*/deno.json
```

STOP if no stable function-specific OPTIONS response can distinguish a running
worker from a router-level 404, or if the repository has no authoritative way
to identify its staging project ref.

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

4. Pin and freeze Edge imports.
   - Make every function-local config use the exact root Supabase JS version.
   - Add a CI/test command that resolves each local config against the checked-
     in lockfile in frozen mode.

## Test plan

```bash
npm run format
npm run test:dev-start-script
node --test scripts/set-staging-secrets.test.mjs
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
- [ ] Tooling, Edge, convention, and full gates pass without a remote mutation.

## STOP conditions

Stop if tests would require real secrets or network mutation, if health cannot
distinguish worker readiness from gateway availability, or if deployment uses
a different config resolution rule than the proposed frozen check.

## Git workflow

- Branch: `codex/051-harden-local-and-edge-tooling`
- Commit: `fix(tooling): harden local and edge workflows`
