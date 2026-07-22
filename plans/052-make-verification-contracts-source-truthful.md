# Plan 052: Make verification contracts source-truthful

> **Executor instructions**: Execute after Plan 051 so Edge resolution has one
> reproducible baseline. Each gate must fail on the defect it claims to prevent,
> not merely compare two repository artifacts or scan for obsolete strings.
> Add negative fixtures first and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 051 (historical Plans 003, 024, 026, and 029 have landed)
- **Category**: CI / test truthfulness / conventions
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

CI proves the two generated database type copies agree but does not regenerate
from the migrated local schema, so both can be identically stale. Most E2E flows
do not fail on uncaught page errors or console errors. The type-first component
gate recognizes only eight type words and omits the documented `Dialog` example
plus common `Form`, `Button`, `Table`, `Input`, and `Alert` prefixes. The Discogs
documentation contract rejects a few obsolete strings but empty documentation
would pass.

Supply-chain verification is also incomplete: npm audits cannot see the Deno
lockfile, GitHub Actions run mutable major tags, and CI installs Chromium via a
ranged direct `playwright-core` dependency while `playwright` itself is exact.
The README also says deploy tasks retain gateway JWT verification although
`supabase/config.toml` deliberately sets `verify_jwt = false`; handlers perform
their own authentication, so this is a documentation truth defect rather than
an authentication bypass.

## Scope

Modify:

- `scripts/check-database-type-parity.mjs` and tests, or add a distinct
  schema-generation comparison script
- `.github/workflows/verify.yml`
- `test/e2e/login-redirect.e2e.test.ts` and/or shared E2E fixtures
- `scripts/check-conventions.mjs` and tests
- `scripts/check-discogs-doc-contract.mjs` and focused tests
- `README.md` and `docs/discogs-integration.md` only where the positive contract
  reveals actual drift
- `package.json`
- `package-lock.json`
- `.github/dependabot.yml` (create if absent)
- `supabase/config.toml`
- `supabase/deno.lock`

Do not make the normal no-database `npm run verify` start or stop a local
Supabase stack. Put live-schema comparison in the existing database CI/job and
`verify:full` boundary.

## Drift check

```bash
git status --short
sed -n '1,120p' scripts/check-database-type-parity.mjs
sed -n '1,120p' scripts/check-conventions.mjs
sed -n '1,100p' scripts/check-discogs-doc-contract.mjs
rg -n "pageerror|console|requestfailed|createPage" test/e2e/login-redirect.e2e.test.ts
rg -n "uses:|playwright-core|playwright\"|audit|verify_jwt|gateway JWT" .github package.json README.md supabase/config.toml
sed -n '45,90p' .github/workflows/verify.yml
```

STOP if deterministic local type generation produces environment-specific
bytes after repository formatting, or if an E2E error class cannot be filtered
without hiding a known application failure.

## Required implementation

1. Compare types to the migrated schema.
   - In the database job, generate TypeScript types from the running local
     stack into a temporary file, apply the repository's deterministic
     formatting, and byte-compare against the canonical tracked copy.
   - Continue comparing the canonical and Edge copies. Never rewrite the CI
     worktree to make the check pass.
   - Add a fixture proving two identical stale copies fail against generated
     schema output.

2. Give every E2E flow one error-aware page fixture.
   - Capture `pageerror`, unexpected `console.error`, and relevant failed
     application requests from page creation through teardown.
   - Fail in teardown with aggregated, redacted diagnostics. Allowlist only
     narrowly documented browser/platform noise.
   - Close pages in `finally` so one assertion cannot leak state into another
     flow.

3. Make type-first naming enforce the actual vocabulary.
   - Define one documented first-party component-kind list including every
     currently supported type. Generated `app/components/ui` remains exempt.
   - Test valid and inverted names for each kind, including `DialogRecordDetails`
     versus `RecordDetailsDialog`.

4. Assert positive Discogs documentation contracts.
   - Require current function names, credential ownership, header transport,
     quota behavior, OAuth recovery, cleanup ownership, and deployment
     verification statements.
   - Keep obsolete-contract rejection. Empty, missing, or partial documents
     must fail with actionable diagnostics.
   - Correct the deploy statement: source-controlled function configuration
     disables gateway verification and each handler authenticates internally.
     Make the convention/docs gate assert both halves without implying this is
     an auth bypass or permission to weaken handler checks.

5. Close supply-chain drift gaps.
   - Add frozen high-severity Deno dependency auditing against the checked-in
     lockfile. If the runtime audit cannot express reachability, fail on
     high/critical findings unless a narrow, documented, owner/date/expiry
     suppression is checked in and tested.
   - Pin every third-party GitHub Action to a reviewed full commit SHA with a
     release comment. Configure Dependabot for GitHub Actions so updates remain
     reviewable rather than frozen forever.
   - Install Chromium through the exact `playwright` CLI used by tests. Remove
     the direct `playwright-core` dependency if no source imports it; otherwise
     exact-pin both and make the dependency-topology gate fail when versions
     differ.
   - Add negative fixtures for an unpinned action, a Playwright mismatch, and a
     simulated high Deno advisory/suppression expiry.

## Test plan

```bash
npm run format
npm run test:typegen-script
npm run test:database-type-parity
npm run test:conventions
npm run check:conventions
npm run check:discogs-docs
npm run audit:edge
npm run test:dependency-topology
npm run check:dependency-topology
npm run test:e2e
npm run test:db
npm run genTypes
npm run check:database-types
npm run verify:full
git diff --check
```

Run the schema comparison exactly as CI will, using a temporary directory, and
prove the worktree remains clean afterward.

## Done criteria

- [ ] Identical but stale generated type copies fail against the migrated schema.
- [ ] Every E2E flow fails on uncaught application errors and closes its page reliably.
- [ ] Type-first conventions cover the repository's actual component vocabulary.
- [ ] Empty or materially stale Discogs documentation fails its contract gate.
- [ ] README and `config.toml` describe gateway-versus-handler authentication consistently.
- [ ] Deno dependencies, action references, and Playwright browser/runtime parity have deterministic CI gates.
- [ ] CI, SQL, E2E, convention, docs, and full gates pass.

## STOP conditions

Stop if generated type comparison is nondeterministic, if the shared E2E guard
suppresses a real current error, if component kinds cannot be defined without
flagging intentional domain nouns, or if documentation assertions encode
implementation details that are not public contracts.

## Git workflow

- Branch: `codex/052-make-verification-contracts-source-truthful`
- Commit: `test: make verification contracts source-truthful`
