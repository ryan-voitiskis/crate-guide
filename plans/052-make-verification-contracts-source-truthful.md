# Plan 052: Make verification contracts source-truthful

> **Executor instructions**: Execute after Plan 051 so Edge resolution has one
> reproducible baseline. Each gate must fail on the defect it claims to prevent,
> not merely compare two repository artifacts or scan for obsolete strings.
> Add negative fixtures first and commit conventionally.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plans 003, 024, 026, 029, and 051
- **Category**: CI / test truthfulness / conventions
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: TODO

## Why this matters

CI proves the two generated database type copies agree but does not regenerate
from the migrated local schema, so both can be identically stale. Most E2E flows
do not fail on uncaught page errors or console errors. The type-first component
gate recognizes only eight type words and omits the documented `Dialog` example
plus common `Form`, `Button`, `Table`, `Input`, and `Alert` prefixes. The Discogs
documentation contract rejects a few obsolete strings but empty documentation
would pass.

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

## Test plan

```bash
npm run format
npm run test:typegen-script
npm run test:database-type-parity
npm run test:conventions
npm run check:conventions
npm run check:discogs-docs
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
- [ ] CI, SQL, E2E, convention, docs, and full gates pass.

## STOP conditions

Stop if generated type comparison is nondeterministic, if the shared E2E guard
suppresses a real current error, if component kinds cannot be defined without
flagging intentional domain nouns, or if documentation assertions encode
implementation details that are not public contracts.

## Git workflow

- Branch: `codex/052-make-verification-contracts-source-truthful`
- Commit: `test: make verification contracts source-truthful`
