# Plan 004: Integrate the Deno Edge runtime into repository verification

> **Executor instructions**: Follow this plan in order and run every gate. Stop
> rather than widening scope when a STOP condition occurs. When complete,
> update the row in `plans/README.md` unless the reviewer owns the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   package.json \
>   supabase/deno.json \
>   supabase/deno.lock \
>   supabase/functions/get-discogs-access-token/index.ts \
>   supabase/functions/get-discogs-access-token/validateCredentials.ts \
>   supabase/functions/get-discogs-access-token/validateCredentials.test.ts
> ```
>
> Run `git status --short` as well. Stop if the OAuth credential-validation
> path has materially changed from the excerpts below.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The advertised npm gates currently ignore deployed Supabase Edge Function
code. The separate Deno checker already finds a nullable-credential error, its
configuration uses removed Deno 1 keys while the repository targets Deno 2,
and the test task finds no tests. This plan makes Edge check/lint/test commands
real and fixes the proven defect with a small pure helper rather than turning
this tooling repair into a broad handler rewrite.

## Current state

- `package.json:15-36` exposes no Edge verification command.
- `supabase/deno.json:17-25` declares `check`, `lint`, `fmt`, `test`, and a
  `start` task targeting nonexistent `functions/serve.ts`.
- `supabase/deno.json:27-55` nests `files` and `options` using Deno 1 syntax.
  Deno 2 emits removal warnings. Root Prettier already owns TypeScript
  formatting; `deno fmt` conflicts with 10 of the 14 function files.
- `supabase/functions/get-discogs-access-token/index.ts:46-62` currently does:

  <!-- prettier-ignore -->
  ```ts
  const creds = credsData as DiscogsCredentialsRow | null
  if (creds?.request_token !== oauth_token) {
    throw new PublicOAuthError(/* public mismatch message */)
  }
  if (!creds.request_secret) {
    throw new PublicOAuthError(/* public missing-state message */)
  }
  ```

  The optional comparison does not narrow `creds`; `deno task check` reports
  `TS18047` at both dereferences.

- `supabase/config.toml:184-191` explicitly targets Deno 2.
- The root Deno imports for `cors`, `std/`, and `oak` have no Edge source
  consumer. The three per-function `deno.json` files provide the only required
  `@supabase/supabase-js` mapping.

Do not inspect or reproduce values from `supabase/functions/.env`. Use dummy
strings only in tests. Match the root tab-indented, single-quoted,
semicolon-free Prettier style.

## Commands you will need

| Purpose           | Command              | Expected on success                    |
| ----------------- | -------------------- | -------------------------------------- |
| Edge typecheck    | `npm run check:edge` | exit 0; no Deno diagnostics            |
| Edge lint         | `npm run lint:edge`  | exit 0; no obsolete-config warnings    |
| Edge tests        | `npm run test:edge`  | exit 0; four credential tests pass     |
| Application tests | `npm run test:run`   | exit 0                                 |
| Nuxt typecheck    | `npm run typecheck`  | exit 0                                 |
| Lint              | `npm run lint`       | exit 0                                 |
| Format            | `npm run format`     | exit 0; Prettier remains authoritative |

## Scope

**In scope**:

- `package.json`
- `supabase/deno.json`
- `supabase/deno.lock`
- `supabase/functions/get-discogs-access-token/index.ts`
- `supabase/functions/get-discogs-access-token/validateCredentials.ts` (create)
- `supabase/functions/get-discogs-access-token/validateCredentials.test.ts`
  (create)
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Any `.env` file, credential value, or live network request.
- Public OAuth response bodies/statuses or callback payload shape.
- `authenticated-discogs-request` message-prefix error classification; keep it
  as a separately reviewable follow-up rather than widening this baseline plan.
- Extracting full `Deno.serve` handlers or adding integration tests that need
  Supabase/Discogs.
- Supabase migrations, grants, policies, generated database types, deployment,
  or local database resets.
- Nested function `deno.json` files.
- Reformatting Edge TypeScript with Deno.

## Git workflow

- Branch: `codex/004-integrate-edge-runtime-verification`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `test(edge): add runtime verification`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Modernize Deno 2 configuration and select one formatter

In `supabase/deno.json`:

- Remove ignored `compilerOptions.allowJs`.
- Remove unused root imports (`cors`, `std/`, and `oak`) after one final search.
- Remove the dead `start` task targeting `functions/serve.ts`.
- Remove the `fmt` task and all `fmt` configuration; Prettier is formatter of
  record for Edge TypeScript and generated copies.
- Convert lint/test inclusion and exclusion to current Deno 2 top-level
  `include`/`exclude` shapes.
- Keep strict compiler options and the `check`, `lint`, `test`, `dev`, and
  deployment tasks.
- Keep tests permissionless; the helper tests must not need `--allow-all`.

**Verify**:

```bash
(cd supabase && deno task lint)
rg -n '"files"|"options"|"allowJs"|"fmt"|functions/serve.ts' supabase/deno.json
```

Expected: lint exits 0 without removed/deprecated/ignored configuration
warnings; `rg` returns no matches.

### Step 2: Extract pure credential validation and fix null narrowing

Create `validateCredentials.ts` exporting:

- `DiscogsCredentialsRow`;
- `validateDiscogsCallbackCredentials(creds, callbackToken): string`.

The helper must throw the existing `PublicOAuthError` mismatch message for a
null row or mismatched request token, throw the existing missing-state message
for a missing request secret, and otherwise return the validated request
secret. It must not return/log the whole credential row.

Replace inline credential checks in `index.ts` with the helper and use its
returned request secret when building the OAuth signature. Do not change the
order of authentication, RPC access, exchange, persistence, and identity
refresh.

**Verify**: `cd supabase && deno task check` → exit 0 with no nullable errors.

### Step 3: Add permissionless Deno tests

Create `validateCredentials.test.ts` with `Deno.test` cases for:

1. matching callback token and present request secret returns the secret;
2. null credential row throws the public mismatch error;
3. mismatched request token throws the public mismatch error;
4. missing request secret throws the public missing-state error.

Use dummy values only. Assert error class/message without importing `index.ts`,
which reads environment variables and registers `Deno.serve`.

**Verify**: `cd supabase && deno task test` → exit 0 with four passing tests and
no permission prompts/network calls.

### Step 4: Expose separate root Edge gates

Add root scripts:

```json
"check:edge": "cd supabase && deno task check",
"lint:edge": "cd supabase && deno task lint",
"test:edge": "cd supabase && deno task test"
```

Do not add the aggregate repository `verify` command here; Plan 005 composes
these gates after fixing formatter coverage and type-generation tooling.

**Verify**: run all three npm scripts from the root; each exits 0.

### Step 5: Run cross-runtime regressions

Run:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:run
npm run check:edge
npm run lint:edge
npm run test:edge
```

Expected: all exit 0 and
`git diff --name-only <implementation-start SHA>..HEAD` lists only the
in-scope files and tracker status if owned by the executor.

## Test plan

- Tests import only the pure validation helper; environment-dependent
  `index.ts` remains runtime-only.
- The null-row case is the direct regression test for the current Deno error.
- Existing OAuth public messages are assertions because they are intentionally
  preserved, not redesigned.
- Root scripts prove the correct working directory and Deno task discovery.

## Done criteria

- [ ] Nuxt and Deno typechecks both exit 0.
- [ ] Deno lint exits 0 without obsolete configuration warnings.
- [ ] Deno test discovers exactly the new credential-validation suite and all
      four cases pass without permissions.
- [ ] Root `check:edge`, `lint:edge`, and `test:edge` work.
- [ ] Prettier is the only Edge formatter; dead/unused Deno entries are gone.
- [ ] The deterministic Deno 2 lock graph for the already-imported
      `oauth-signature` dependency is committed, and a second Edge check leaves
      `supabase/deno.lock` byte-stable.
- [ ] OAuth behavior and public response contracts are unchanged.
- [ ] No secrets, migrations, generated types, or out-of-scope files changed.

## STOP conditions

Stop and report if:

- Current Edge code uses a root import or task marked for removal.
- The installed Deno runtime requires Deno 1 syntax despite the configured
  Deno 2 runtime.
- Fixing nullability requires changing OAuth state-binding behavior.
- Tests require environment permissions, network access, or real credentials.
- Root Prettier and Deno check cannot both pass without conflicting rewrites.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Every new Edge behavior should receive a pure helper or injected handler test
  rather than importing a module that immediately calls `Deno.serve`.
- A later handler-architecture plan can address message-prefix HTTP error
  classification; do not hide it inside unrelated maintenance.
- Reviewers should verify no credential-bearing object is logged by the helper.
- Keep the deterministic Deno 2 lock graph committed for the already-imported
  `oauth-signature` dependency. After dependency changes, run the Edge check
  twice and verify the second run leaves `supabase/deno.lock` byte-stable.
