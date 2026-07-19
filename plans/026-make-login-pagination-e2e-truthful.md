# Plan 026: Make the login pagination E2E contract truthful

> **Executor instructions**: Start from the final integrated Plan 010 and Plan
> 024 code. Follow this scope exactly; root owns `plans/README.md`. Stop if the
> real Supabase query shape has changed again rather than expanding a stale mock
> by guesswork.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/010-page-full-library-queries.md`,
  `plans/024-stabilize-workbench-e2e-readiness.md`
- **Category**: test correctness
- **Discovered at**: integration review of commit `f0443af`, 2026-07-19
- **Completed by**: commit `de1c4b4` (integrated as `6369c1a`), 2026-07-19

## Why this matters

All three library stores now finish their Supabase select/order chain with
`.range(from, to)`. The login E2E's injected QueryBuilder lacks `range()`, but
its assertion observes `from(table)` calls before that missing method throws.
The test therefore reports that account data loaded even though each paginated
fetch fell into its error path.

## Scope

Modify only:

- `test/e2e/login-redirect.e2e.test.ts`

Do not change application pagination, auth behavior, navigation, or other E2E
fixtures.

## Steps

1. Extend the injected QueryBuilder type and implementation with the exact
   `.range(from, to)` contract used by `fetchAllSupabasePages`.
2. Record structured range observations containing table, lower bound, and
   upper bound. Do not count the initial `from(table)` call as load completion.
3. Make the account-data test wait for successful first-page range calls for
   `records`, `tracks`, and `crates`, each using the expected inclusive
   `0..999` page.
4. Assert each expected library range completed exactly once for the empty
   fixture and that the profile still completed through `.single()`.
5. Capture browser page errors for this flow and fail if the mocked chain or
   account-data load throws. Keep the assertion scoped so intentional console
   messages from unrelated tests do not create noise.

## Verification

Run:

```bash
npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts
npm run format
npm run check:conventions
npm run test:e2e
npm run verify
git diff --check
```

## Done criteria

- [ ] The mock implements the real paginated query surface.
- [ ] Load completion is observed after `.range()`, not at `.from()`.
- [ ] Records, tracks, and crates prove exact first-page bounds.
- [ ] A missing/broken range chain makes the E2E fail.
- [ ] Only the login E2E file changed and all gates pass.

## STOP conditions

Stop and report if:

- the stores no longer share the same pagination helper/query shape;
- the successful flow requires production credentials or network access;
- truthful completion cannot be observed without adding application-only test
  hooks;
- verification fails twice after one reasonable in-scope correction.

## Git workflow

Use branch `codex/026-login-pagination-e2e` and commit
`test(e2e): prove paginated account loading`. Do not push or merge.
