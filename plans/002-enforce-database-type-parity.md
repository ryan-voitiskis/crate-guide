# Plan 002: Enforce byte-identical generated database type copies

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- package.json README.md scripts/generate-database-types.mjs scripts/generate-database-types.test.mjs shared/types/database.ts supabase/functions/_shared/types/database.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `23b43d5` (integrated as `87d8b79`), 2026-07-19

## Why this matters

Nuxt and Deno consume separate generated copies of the same Supabase schema.
The generator writes them atomically and verifies parity while it runs, but
nothing detects a later one-sided manual edit. A fast, database-free check in
`npm run verify` will prevent type drift from reaching application or Edge code.

## Current state

`scripts/generate-database-types.mjs:8-13` defines the two destinations:

```js
const defaultCanonicalPath = resolve(repositoryRoot, 'shared/types/database.ts')
const defaultEdgePath = resolve(
	repositoryRoot,
	'supabase/functions/_shared/types/database.ts'
)
```

- `scripts/generate-database-types.mjs:207-214` reads both generated outputs and
  throws when their buffers differ, but only during `npm run genTypes`.
- `scripts/generate-database-types.test.mjs:27-63` is the repository exemplar for
  Node tests that create isolated temporary file trees and inject paths.
- At planning time, `cmp -s shared/types/database.ts supabase/functions/_shared/types/database.ts`
  exits 0; both files have 442 lines.
- `package.json:24-25,40,48` has `test:typegen-script`, `check:conventions`,
  `verify`, and `genTypes`, but no read-only parity command.
- Prettier owns JavaScript formatting. Do not run `deno fmt`.

## Commands you will need

| Purpose           | Command                                                   | Expected on success                      |
| ----------------- | --------------------------------------------------------- | ---------------------------------------- |
| Focused tests     | `node --test scripts/check-database-type-parity.test.mjs` | all tests pass                           |
| Parity check      | `npm run check:database-types`                            | exit 0; prints a concise success message |
| Generator tests   | `npm run test:typegen-script`                             | all tests pass                           |
| Full verification | `npm run verify`                                          | exit 0                                   |

## Scope

**In scope** (the only files you should modify):

- `scripts/check-database-type-parity.mjs` (create)
- `scripts/check-database-type-parity.test.mjs` (create)
- `package.json`
- `README.md`
- `plans/README.md` status row

**Read only; do not modify**:

- `scripts/generate-database-types.mjs`
- `scripts/generate-database-types.test.mjs`
- `shared/types/database.ts`
- `supabase/functions/_shared/types/database.ts`

**Out of scope**:

- Regenerating types or starting Supabase
- Changing the schema, migrations, or generated output format
- Replacing the two-copy design

## Git workflow

- Branch: `codex/002-database-type-parity`
- Use one Conventional Commit, for example
  `chore(types): enforce generated database parity`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a pure, injectable parity checker

Create `scripts/check-database-type-parity.mjs`. Export
`checkDatabaseTypeParity({ canonicalPath, edgePath } = {})`. Read both paths as
buffers with `node:fs/promises`, compare with `Buffer.equals`, and throw messages
that name both repository-relative paths for these cases:

- either file is missing;
- files differ;
- either file is empty.

The direct-run path must set `process.exitCode = 1` and print only the safe error
message. On success, print `Generated database type copies are identical.`.

**Verify**: `node scripts/check-database-type-parity.mjs` -> exit 0 and prints
the success message.

### Step 2: Add isolated Node tests

Create `scripts/check-database-type-parity.test.mjs`, following the temporary
directory cleanup pattern in `scripts/generate-database-types.test.mjs`. Cover:

1. identical non-empty files pass;
2. one-byte drift rejects and names both paths;
3. missing canonical file rejects;
4. missing Edge file rejects;
5. two empty files reject.

Do not import or alter the real generated files in the test.

**Verify**: `node --test scripts/check-database-type-parity.test.mjs` -> 5 tests
pass.

### Step 3: Wire the checker into package verification

Add scripts:

```json
"test:database-type-parity": "node --test scripts/check-database-type-parity.test.mjs",
"check:database-types": "node scripts/check-database-type-parity.mjs"
```

Append both to `verify` after `test:typegen-script`. Do not put `genTypes` in
`verify`; verification must remain read-only and database-free.

**Verify**: `npm run test:database-type-parity && npm run check:database-types`
-> exit 0.

### Step 4: Document the invariant

In the README Database and Code Quality sections, state that `genTypes` writes
both copies and `check:database-types`/`verify` rejects one-sided drift.

**Verify**: `rg -n "check:database-types|byte-identical|one-sided" README.md`
-> the command and invariant are documented.

### Step 5: Format and run the full gate

**Verify**: `npm run format && npm run check:conventions && npm run verify` ->
exit 0.

## Test plan

- New tests live in `scripts/check-database-type-parity.test.mjs` and use only
  temporary files.
- Model test lifecycle and injected destination paths after
  `scripts/generate-database-types.test.mjs:27-63`.
- Do not simulate drift by editing either tracked generated file.

## Done criteria

- [ ] Five focused checker cases pass.
- [ ] `npm run check:database-types` exits 0 on the tracked files.
- [ ] `npm run verify` includes both checker tests and the live parity check.
- [ ] `cmp -s shared/types/database.ts supabase/functions/_shared/types/database.ts`
      exits 0.
- [ ] Neither generated file changed.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- The destination paths no longer match the excerpts.
- The tracked generated files differ before implementation.
- Fixing parity appears to require generating against an unknown or hosted
  database.
- A path is a symlink or resolves outside the repository.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- The checker intentionally compares bytes, not parsed TypeScript; formatting
  drift is still drift.
- If the project later replaces the two-copy design with a shared package,
  remove the checker and its tests in the same change.
- Plan 003 depends on this plan so CI rejects type drift.
