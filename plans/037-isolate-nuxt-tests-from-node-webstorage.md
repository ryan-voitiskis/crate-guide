# Plan 037: Isolate Nuxt tests from Node WebStorage globals

> **Executor instructions**: Execute in an isolated worktree from the current
> integration commit. Reproduce this under an unmodified Node 26 process before
> editing. Fix the Nuxt test environment boundary, not application storage code
> or package scripts, and commit conventionally. The reviewer owns the tracker.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: Plan 029
- **Category**: test infrastructure / runtime compatibility
- **Planned at**: commit `c2da28c`, 2026-07-19
- **Completed by**: commit `0fd31b0` (integrated as `3b13ddf`), 2026-07-19
- **Independent review**: no actionable findings; Node 26 fork/thread and
  setup/teardown descriptor restoration diagnostics passed, 2026-07-19

## Why this matters

The package contract accepts Node `>=24.12.0`, but Node 26.5 exposes
experimental `globalThis.localStorage` and `globalThis.sessionStorage`
accessors. In the Nuxt/Happy DOM project those process globals shadow the DOM
environment's Storage objects: 27 tests fail with `window.localStorage` absent
and Node emits experimental WebStorage warnings. Disabling Node WebStorage with
`NODE_OPTIONS=--no-experimental-webstorage` makes all 28 Nuxt files and 154
tests pass, proving that application behavior is not the defect.

A developer using a declared-supported Node release must get the same DOM
semantics and green test gate as CI's pinned Node 24 runtime without a private
shell flag.

## Scope

Modify only:

- `vitest.config.ts`
- one Nuxt-only environment/setup helper under `test/`, if needed
- one focused Nuxt environment regression test under `test/nuxt/`

Do not alter application storage calls, provide a fake or reduced Storage
implementation, add `NODE_OPTIONS` to package scripts, narrow the package Node
engine, or affect unit/store/server/E2E workers.

## Required implementation

1. Establish the ownership boundary before changing globals.
   - Reproduce the plain Node 26 failure and record the own-property
     descriptors for both globals before the Nuxt DOM environment owns them.
   - Identify only Node's configurable experimental accessors; do not delete a
     Happy DOM-created value or an application-installed test double.
   - Confirm the adjustment runs early enough that Nuxt initialization and
     every Nuxt test sees the DOM environment's native Storage objects.

2. Keep the correction Nuxt-project-local.
   - Configure the Nuxt Vitest project with the smallest setup/environment hook
     that removes the shadowing Node accessors and leaves Happy DOM responsible
     for `window`, `localStorage`, and `sessionStorage`.
   - Make the hook idempotent and safe when Node does not expose either accessor
     (including the CI-pinned Node 24 runtime).
   - Fail loudly if a matching Node-owned configurable accessor cannot be
     removed; do not silently substitute an in-memory mock.

3. Preserve real DOM Storage semantics.
   - The regression test must prove local and session storage are distinct,
     support `setItem`/`getItem`/`removeItem`/`clear`, update `length`, and are
     reachable through both `window` and the corresponding global binding.
   - Clean test keys so the new test cannot leak state to unrelated Nuxt tests.

## Tests

Run the Nuxt project in fresh processes and prove:

- plain Node 26, with no `NODE_OPTIONS`, runs the full Nuxt suite without the
  WebStorage experimental warning or a storage-access failure;
- Node 24.12/npm 11.6.2 runs the same focused regression and full Nuxt suite;
- the setup does not install its own Storage class/object and does not execute
  for non-Nuxt Vitest projects;
- the complete pinned-runtime repository gate remains green.

## Verification

```bash
env -u NODE_OPTIONS npm run test:nuxt
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'env -u NODE_OPTIONS npm run test:nuxt'
npm run format
npm run check:conventions
npx --yes --package=node@24.12.0 --package=npm@11.6.2 -c \
  'node --version && npm --version && npm run verify'
git diff --check
```

All commands exit 0. The first command must run under the host's Node 26
runtime, not inherit the workaround used to characterize the failure.

## Done criteria

- [ ] Declared-supported Node 26 runs Nuxt tests without shell flags.
- [ ] Happy DOM, not a repository mock, owns both Storage implementations.
- [ ] Node 24 behavior remains unchanged and green.
- [ ] The correction is scoped to the Nuxt Vitest project.
- [ ] Full pinned-runtime verification and diff checks pass.

## STOP conditions

Stop if Node's accessors cannot be distinguished safely from the DOM
environment, if the only correction needs application fallback behavior or a
fake Storage implementation, if the hook leaks into other Vitest projects, or
if a required gate fails twice after one scoped correction.

## Maintenance notes

The Node engine range is a product contract, so local verification must cover
its evolving globals as well as CI's minimum. Remove this compatibility hook
only after fresh-process evidence shows the Nuxt DOM environment wins ownership
without it on every supported runtime.
