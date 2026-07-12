# Plan 003: Restore the browser E2E baseline without changing production output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report; do not improvise. When complete,
> update this plan's row in `plans/README.md` unless the reviewer says they own
> the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   test/e2e/login-redirect.e2e.test.ts \
>   package.json \
>   package-lock.json
> ```
>
> Also run `git status --short`. Work from a clean branch or isolated worktree.
> If an in-scope file has materially changed, compare the excerpts below with
> live code and stop if the stated failure mechanism no longer applies.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

`npm run test:e2e` currently fails before either browser assertion runs. The
test harness builds the application with its production Cloudflare Pages Nitro
preset, but Nuxt Test Utils starts a Node entry that Cloudflare output does not
contain. This plan makes the test-only build use `node-server` while proving
the normal production build remains Cloudflare Pages output. Once the
`node-server` override first let the runner reach the browser, execution
revealed that the Nuxt Supabase module also required test-only public
configuration; the fixture now supplies the reserved invalid URL
`https://e2e.invalid` and dummy key `e2e-public-key` without permitting a
network request.

## Current state

- `nuxt.config.ts:13-16` intentionally configures the deployed SPA:

  <!-- prettier-ignore -->
  ```ts
  ssr: false,
  nitro: {
    preset: 'cloudflare-pages'
  },
  ```

  This production setting is correct and is explicitly out of scope.

- `test/e2e/login-redirect.e2e.test.ts:5-7` currently starts the browser suite
  without a test-only Nuxt override:

  <!-- prettier-ignore -->
  ```ts
  await setup({
    browser: true
  })
  ```

- `@nuxt/test-utils` accepts `nuxtConfig` in `setup()` and, for a production
  test server, launches `<nitro.output.dir>/server/index.mjs`. A `node-server`
  test preset produces that entry; `cloudflare-pages` produces a worker entry.
- Once the runner first reached the browser during execution, the Nuxt Supabase
  module required public URL/key values. The test-only `nuxtConfig.supabase`
  values are `https://e2e.invalid` and `e2e-public-key`; authentication remains
  locally mocked and must never request the reserved invalid URL.
- The fixture previously assigned claims directly to
  `nuxtApp.payload.state.supabase_user`. That mutation was ineffective; the
  mocked Supabase auth methods provide the behavior the tests exercise, so the
  direct payload-state mutation is removed.
- `package.json:19` defines `test:e2e` as the Vitest `e2e` project.
- `@playwright/test` is a direct dev dependency but has no repository import.
  `playwright-core` is imported for the `Page` type and must remain.

Repository conventions: npm is the package manager; commits use Conventional
Commits; run `npm run format` after changes. Do not add a second E2E runner.

## Commands you will need

| Purpose                 | Command                                | Expected on success                                 |
| ----------------------- | -------------------------------------- | --------------------------------------------------- |
| Browser prerequisite    | `npx playwright-core install chromium` | exit 0; compatible Chromium is installed            |
| E2E                     | `npm run test:e2e`                     | exit 0; both login redirect tests run and pass      |
| Production build        | `npm run build`                        | exit 0; Cloudflare Pages worker output is generated |
| Unit/store/server tests | `npm run test:run`                     | exit 0; all existing tests pass                     |
| Lint                    | `npm run lint`                         | exit 0                                              |
| Typecheck               | `npm run typecheck`                    | exit 0                                              |
| Format                  | `npm run format`                       | exit 0; only intended files change                  |

## Scope

**In scope**:

- `test/e2e/login-redirect.e2e.test.ts`
- `package.json`
- `package-lock.json`
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- `nuxt.config.ts`; do not weaken or conditionalize the production preset.
- Application auth, middleware, login behavior, or Supabase mocks.
- Adding Playwright Test configuration or moving the suite to another runner.
- Component/runtime tests; Plan 006 establishes that separate layer.
- Any credentials, `.env` content, or live authenticated account.

## Git workflow

- Branch: `codex/003-restore-browser-e2e-baseline`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Preserve unrelated changes; do not reset or clean the worktree.
- One logical commit is sufficient:
  `fix(test): restore browser e2e baseline`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Override Nitro only inside the E2E fixture

In `test/e2e/login-redirect.e2e.test.ts`, extend the existing `setup()` call:

```ts
await setup({
	browser: true,
	nuxtConfig: {
		nitro: { preset: 'node-server' },
		supabase: {
			url: 'https://e2e.invalid',
			key: 'e2e-public-key'
		}
	}
})
```

Do not set `dev: true`; the suite must exercise a built test artifact. Do not
edit `nuxt.config.ts`. The Supabase values are test-only public placeholders
discovered after the runner first reached the browser. Keep Supabase behavior
locally mocked, and remove the ineffective direct assignment to
`nuxtApp.payload.state.supabase_user` rather than treating payload mutation as
authentication state.

Install the compatible browser binary once with
`npx playwright-core install chromium`; the current machine does not have the
default Playwright Chromium binary. This changes the user-level Playwright
cache, not repository files.

**Verify**: `npm run test:e2e` → exit 0 and exactly the two existing redirect
tests execute rather than being skipped during setup.

### Step 2: Remove the unused second test runner dependency

Remove direct dev dependency `@playwright/test` using npm so the lockfile is
updated consistently. Retain `playwright-core`, `@nuxt/test-utils`, the Vitest
project, and the current `Page` type import.

**Verify**:

```bash
rg -n "@playwright/test" package.json test app server shared
npm run test:e2e
```

Expected: `rg` returns no matches and E2E still exits 0.

### Step 3: Prove production output was not changed

Run the production build without any test override.

**Verify**:

```bash
npm run build
test -f dist/_worker.js/index.js
test ! -f dist/server/index.mjs
```

Expected: all commands exit 0. If Nuxt changes the exact Cloudflare output path
but the build succeeds, inspect `dist` and report the new path rather than
changing production configuration to satisfy this assertion.

### Step 4: Run the repository gates and format

Run `npm run format`, then `npm run lint`, `npm run typecheck`,
`npm run test:run`, and `npm run test:e2e`.

**Verify**: every command exits 0 and
`git diff --name-only <implementation-start SHA>..HEAD` lists only the two
package files and the E2E test, plus the tracker status if the executor owns
it.

## Test plan

- Keep the two existing behavioral assertions unchanged: successful email
  login redirects home, and an authenticated user is redirected away from
  `/login`.
- The regression assertion is operational: both tests must actually execute
  under the Node test preset.
- The production build assertion proves the override did not leak into normal
  Nuxt configuration.

## Done criteria

- [ ] `npm run test:e2e` exits 0 with two passing tests.
- [ ] The E2E fixture supplies `nitro.preset = 'node-server'` only via
      `setup({ nuxtConfig })`.
- [ ] The same test-only `nuxtConfig` supplies Supabase URL
      `https://e2e.invalid` and key `e2e-public-key`, while both tests remain
      locally mocked and make no request to the reserved invalid URL.
- [ ] The ineffective direct `nuxtApp.payload.state.supabase_user` mutation is
      removed; the fixture relies on its mocked Supabase auth methods.
- [ ] `nuxt.config.ts` remains unchanged and `npm run build` emits Cloudflare
      worker output.
- [ ] `@playwright/test` is absent; `playwright-core` remains.
- [ ] Lint, typecheck, unit/store/server tests, and formatting pass.
- [ ] No out-of-scope files changed.

## STOP conditions

Stop and report if:

- `setup({ nuxtConfig: { nitro: { preset: 'node-server' } } })` no longer
  produces `server/index.mjs` with the installed Nuxt Test Utils version.
- The tests reach the browser but fail on an application assertion; capture
  that separate failure rather than changing auth behavior in this plan.
- The browser begins requesting `https://e2e.invalid` instead of remaining
  fully contained by the local Supabase mocks.
- Fixing the harness appears to require editing production `nuxt.config.ts`.
- Chromium cannot be installed or launched in the executor environment.
- Removing `@playwright/test` breaks a caller that repository search missed.
- A verification command fails twice after one reasonable in-scope correction.

## Maintenance notes

- Keep deployment preset decisions in production config and runner-specific
  preset decisions in test setup.
- If the E2E suite later migrates to Playwright Test, do so as an explicit
  runner migration; do not mix discovery models in the same script.
- Plan 006 assumes this browser baseline is green before adding rendered
  characterization coverage.
