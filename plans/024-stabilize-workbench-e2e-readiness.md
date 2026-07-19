# Plan 024: Wait for the client-rendered workbench before asserting its shell

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- test/e2e/login-redirect.e2e.test.ts`
> If the in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `8b4cf78` (integrated as `ba148d2`), 2026-07-19

## Why this matters

Repository-wide verification intermittently fails after navigation from login
to `/demo`, even though the same assertion passes when run alone and the
untouched baseline can both pass and fail across complete-suite runs. The test
waits for the URL but immediately reads locator counts, which do not wait for
Nuxt's client-rendered workbench shell. This flake blocks unrelated plan
verification and can hide real failures behind retry noise.

## Current state

`test/e2e/login-redirect.e2e.test.ts:124-143` clicks the Demo link, waits only
for `url('/demo')`, then immediately calls `.count()`:

```ts
await page.getByRole('link', { name: 'Demo', exact: true }).click()
await page.waitForURL(url('/demo'))

await expect(
	page.getByRole('link', { name: 'Crate Guide home' }).count()
).resolves.toBeGreaterThan(0)
```

- Playwright locator `.count()` returns the current count; it does not wait for
  the first matching element to appear.
- The same file's legal-page return test at lines 270-286 repeats the three
  workbench-shell count assertions after a route transition.
- During Plan 004 review, the isolated first test passed twice on both the
  baseline and implementation worktrees, while complete `npm run test:e2e`
  runs intermittently observed a zero home-link count. No OAuth, application,
  or route source was involved in the failure.
- Tests use Vitest plus `@nuxt/test-utils/e2e` and Playwright-core locators.
  Keep this stack; do not introduce Playwright Test assertions or timers.

## Commands you will need

| Purpose      | Command                                                                                               | Expected on success |
| ------------ | ----------------------------------------------------------------------------------------------------- | ------------------- |
| Focused test | `npx vitest run --project e2e test/e2e/login-redirect.e2e.test.ts -t "mounts the complete workbench"` | 1 test passes       |
| Complete E2E | `npm run test:e2e`                                                                                    | 8 tests pass        |
| Full gate    | `npm run verify`                                                                                      | exit 0              |
| Conventions  | `npm run check:conventions`                                                                           | exit 0              |

## Scope

**In scope** (the only source file you should modify):

- `test/e2e/login-redirect.e2e.test.ts`
- `plans/README.md` status row

**Out of scope**:

- Application pages, layouts, components, middleware, stores, or auth logic
- Nuxt/Vitest configuration or dependency changes
- Adding fixed sleeps, retries, or weakened assertions
- Changing the semantic names or count expectations of the workbench shell
- OAuth implementation files from Plan 004

## Git workflow

- Branch: `codex/024-stabilize-workbench-e2e`
- Use one Conventional Commit, for example
  `test(e2e): wait for workbench shell readiness`.
- Do not push, merge, or open a pull request unless instructed.

## Steps

### Step 1: Add one semantic workbench-readiness helper

In `test/e2e/login-redirect.e2e.test.ts`, add a private async helper near
`signInViaForm` that accepts `Page`. It must use Playwright locator `waitFor`
with `{ state: 'visible' }` for these existing semantic locators:

- link named `Crate Guide home` (use `.first()` because desktop/mobile shell
  variants may intentionally provide more than one matching link);
- navigation named `Library navigation`;
- contentinfo named `Workspace status`.

Do not use `waitForTimeout`, polling sleeps, arbitrary retry loops, test retries,
or CSS implementation selectors. The helper establishes readiness; it does not
replace the existing exact count assertions.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Wait before both workbench-shell assertion groups

Call the helper after `waitForURL(url('/demo'))` in the first test and after
`waitForURL(url('/'))` in the legal-page return test. Keep the existing count
assertions for the home link, library navigation, workspace status, and auth
scroll container unchanged so the tests still prove the full shell contract.

**Verify**: the focused first test passes.

### Step 3: Prove the complete suite is stable without retries

Run `npm run test:e2e` three separate times under a Node version satisfying
`package.json` (`>=24.12.0`). Each independent run must report all 8 tests
passing. Do not use Vitest retry flags; a retry would hide the race instead of
proving it is removed.

**Verify**: three consecutive complete runs each report 8 passed, 0 failed.

### Step 4: Run formatting and the full repository gate

Run the repository-owned formatter, conventions, and full verification. Do not
change application code if a different failure appears.

**Verify**: `npm run format && npm run check:conventions && npm run verify` ->
exit 0.

## Test plan

- The existing login-to-demo test is the regression; it must retain all current
  semantic shell assertions after the readiness wait.
- The existing legal-page return test uses the same helper, preventing a second
  copy of the route-render race.
- Three retry-free complete E2E runs prove the fix addresses ordering/timing
  rather than relying on an isolated-test pass.
- Full verification proves the helper does not mask auth, navigation, or shell
  failures elsewhere.

## Done criteria

- [ ] Both workbench route transitions wait for semantic shell visibility.
- [ ] No fixed sleep or test retry is added.
- [ ] Existing shell count assertions remain intact.
- [ ] The focused test passes.
- [ ] Three consecutive `npm run test:e2e` runs each pass 8/8.
- [ ] `npm run verify` exits 0.
- [ ] Only `test/e2e/login-redirect.e2e.test.ts` changed.
- [ ] `plans/README.md` status row is updated by the reviewer.

## STOP conditions

Stop and report back if:

- The app never renders one of the three semantic shell locators on `/demo` or
  after returning from a legal page; that is an application regression, not a
  test-wait issue.
- Stabilization requires changing application or Nuxt/Vitest configuration.
- Any proposed fix needs a fixed sleep, retry option, or weaker assertion.
- A complete E2E run fails on a different assertion twice.
- A verification command fails twice after a reasonable in-scope correction.

## Maintenance notes

- `waitForURL` proves navigation, not client-render completion. Future E2E
  route-transition assertions should wait on the first meaningful semantic
  element before reading counts or DOM state.
- Keep the readiness helper semantic and small. If the shell contract changes,
  update the helper and both count groups in the same review.
- This plan was added during execution because the flake blocked independent
  review of otherwise unrelated plans.
