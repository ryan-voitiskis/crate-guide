# Plan 005: Make maintenance tooling safe, complete, and composable

> **Executor instructions**: Execute each step and gate in order. Stop on the
> conditions below instead of broadening scope. Update this plan's tracker row
> when complete unless the reviewer owns `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   package.json \
>   README.md \
>   eslint.config.mjs \
>   scripts/generate-database-types.mjs \
>   scripts/generate-database-types.test.mjs \
>   shared/types/database.ts \
>   supabase/functions/_shared/types/database.ts
> cmp -s shared/types/database.ts \
>   supabase/functions/_shared/types/database.ts
> ```
>
> Run `git status --short`. This plan assumes Plans 003 and 004 are DONE. If
> their scripts are absent or failing, stop and execute/reconcile them first.
> If `cmp` exits non-zero, stop: the generated copies are already
> desynchronized and must be reconciled separately before rollback behavior can
> be tested.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: Plan 003 and Plan 004
- **Category**: dx
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

The documented database-type refresh redirects directly into the tracked
canonical type file before the Supabase command succeeds. A failed local CLI
can therefore truncate one generated copy while leaving the Edge copy stale.
The format command also omits first-party `.mjs`/`.cjs` files, and there is no
single read-only command covering all now-working runtime gates. This plan
makes the destructive operation transactional enough to fail safely and gives
maintainers one trustworthy verification entry point.

## Current state

- `package.json:29` formats only `ts,js,vue,scss,css,md,json`; the tracked
  `eslint.config.mjs` and `scripts/benchmark-local-audio.cjs` are outside the
  contract. A direct Prettier check currently reports `eslint.config.mjs` as
  unformatted.
- `package.json:36` currently runs:

  ```json
  "genTypes": "supabase gen types --lang=typescript --local > shared/types/database.ts && cp shared/types/database.ts supabase/functions/_shared/types/database.ts"
  ```

  Shell redirection truncates `shared/types/database.ts` before command
  success is known.

- The two generated files are intentionally duplicated because Supabase Edge
  deployment needs a copy under `supabase/functions`. Do not replace that
  deployment boundary in this plan.
- `README.md:151-158` documents `npm run genTypes` as the canonical refresh.
- After Plans 003 and 004, `test:e2e`, `check:edge`, `lint:edge`, and
  `test:edge` are expected to be green.

Repository style is tab-indented, single-quoted, semicolon-free. Use Node's
built-in test runner for the maintenance script so it does not alter Vitest
discovery.

## Commands you will need

| Purpose           | Command                       | Expected on success                                      |
| ----------------- | ----------------------------- | -------------------------------------------------------- |
| Script tests      | `npm run test:typegen-script` | exit 0; success/failure/rollback cases pass              |
| Format check      | `npm run format:check`        | exit 0; all configured file types checked                |
| Full verification | `npm run verify`              | exit 0; every application, browser, and Edge gate passes |
| Format write      | `npm run format`              | exit 0; only in-scope formatting changes                 |

`npm run genTypes` itself requires a running local Supabase stack. The plan
must test the script without requiring that stack; a real refresh is an
optional final integration check only when the environment is already ready.

## Scope

**In scope**:

- `package.json`
- `README.md`
- `eslint.config.mjs`
- `scripts/generate-database-types.mjs` (create)
- `scripts/generate-database-types.test.mjs` (create)
- `plans/README.md` — status-only update after implementation

**Conditionally in scope only during an intentional real refresh**:

- `shared/types/database.ts`
- `supabase/functions/_shared/types/database.ts`

Those generated files must either both change to identical content or neither
change. Do not commit a schema refresh merely to test this plan.

**Out of scope**:

- Database schema, migrations, Supabase configuration, or generated type shape.
- Changing the intentional two-copy Edge deployment layout.
- Formatting generated database types with Deno.
- Adding packages; Node 24 APIs are sufficient.
- Refactoring `scripts/benchmark-local-audio.cjs`; Plan 014 owns its behavior.
- CI workflow creation; this repository currently has no checked-in workflow.

## Git workflow

- Branch: `codex/005-make-maintenance-tooling-trustworthy`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `chore(dx): harden repository verification`.
- Do not push or open a PR unless instructed.

## Target type-generation contract

The new module must export a testable function and run it only when invoked as
the CLI entry. It should accept injectable paths and a command runner for tests,
while production defaults target the repository paths.

The operation must:

1. Capture the original content/existence of both destination files.
2. Run `supabase gen types --lang=typescript --local` without shell redirection.
3. Require exit status 0, non-empty stdout, and the marker
   `export type Database`.
4. Format the validated stdout in memory with the installed Prettier API and
   the repository's resolved configuration; do not invoke a shell formatter.
5. Write the formatted output to temporary files in each destination directory.
6. Replace both destinations; if either replacement fails, restore both prior
   states and remove all temporary files.
7. Assert the final destination contents are byte-identical.
8. Exit non-zero with a concise message on any failure; never print environment
   contents.

## Steps

### Step 1: Implement and test atomic type generation

Create `scripts/generate-database-types.mjs` using Node built-ins plus the
already-installed Prettier API. Avoid `shell: true`. Create
`scripts/generate-database-types.test.mjs` with temporary directories and
injected command-runner/formatter seams.

Test at least:

- successful generation writes identical validated output to both files;
- non-zero generator status preserves both old files;
- empty output and missing `export type Database` preserve both files;
- failure replacing the second destination restores both originals;
- initially absent files remain absent after failure;
- temporary files are removed on success and failure.

**Verify**: `node --test scripts/generate-database-types.test.mjs` → exit 0.

### Step 2: Replace the destructive package script

Change `genTypes` to invoke the new Node module. Add:

```json
"test:typegen-script": "node --test scripts/generate-database-types.test.mjs"
```

Do not invoke the real Supabase generator unless the local stack is already
running and the operator wants a schema refresh.

**Verify**: `npm run test:typegen-script` → exit 0.

### Step 3: Make formatting read-only and complete

Extend both format globs to include `mjs`, `cjs`, `mts`, and `cts`, and add a
matching `format:check` script using `prettier --check`. Run `npm run format` so
`eslint.config.mjs` enters the same contract. Do not change lint rules while
formatting it.

**Verify**:

```bash
npm run format:check
git diff --check
```

Expected: both exit 0. `scripts/benchmark-local-audio.cjs` should remain
behaviorally unchanged.

### Step 4: Compose one full verification command

Add `verify` that runs, in fail-fast order:

1. `format:check`
2. `lint`
3. `typecheck`
4. `test:run`
5. `test:e2e`
6. `check:edge`
7. `lint:edge`
8. `test:edge`
9. `test:typegen-script`

Use npm script composition rather than duplicating underlying command strings.
Do not include `build` or `genTypes`: build remains a release gate, while type
generation requires local infrastructure and changes tracked artifacts.

**Verify**: `npm run verify` → exit 0.

### Step 5: Document failure-safe behavior

Update the database section in `README.md` to state that `genTypes` requires a
running local Supabase stack, validates output before replacing both tracked
copies, and leaves them unchanged on failure. Mention `npm run verify` in the
development command list, but leave the full testing-stack documentation to
Plan 016.

**Verify**:

```bash
rg -n "npm run verify|npm run genTypes" README.md
npm run format:check
```

Expected: both commands exit 0 and the documented behavior matches the script.

## Test plan

- The Node test uses only temporary fixture files; it must not invoke Supabase
  or touch either tracked generated type file.
- Failure cases must compare destination bytes before and after, not merely
  assert that an error was thrown.
- A successful fake generation must prove the two destinations are identical.
- `npm run verify` is the integration test for script composition.

## Done criteria

- [ ] Failed generation cannot truncate or desynchronize tracked type files.
- [ ] `npm run genTypes` invokes the tested Node script without shell
      redirection.
- [ ] `npm run format:check` includes Node module extensions and exits 0.
- [ ] `eslint.config.mjs` is formatted without rule changes.
- [ ] `npm run verify` exits 0 and includes all nine listed gates.
- [ ] README documents the real prerequisites and failure behavior.
- [ ] No dependency, schema, migration, or unrelated source change exists.

## STOP conditions

Stop and report if:

- Plans 003 or 004 are not implemented and their expected scripts are missing.
- Making both generated destinations consistent requires changing Edge import
  paths or deployment packaging.
- The Supabase CLI produces a different stable type marker than
  `export type Database`; report the output shape without replacing files.
- Script tests touch the real generated files or require a running local stack.
- `npm run format` changes files outside the declared scope; revert only the
  formatter's unintended changes with a non-destructive patch and report them.
- A gate fails twice after one reasonable in-scope correction.

## Maintenance notes

- Any new first-party Node extension must be included in both format scripts.
- Keep `verify` read-only. Release builds and schema regeneration are separate
  because they create artifacts or require infrastructure.
- Review rollback paths in the type-generation script as carefully as its
  success path.
