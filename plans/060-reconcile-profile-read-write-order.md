# Plan 060: Reconcile same-account profile reads and writes

> **Executor instructions**: Reproduce fetch-before-write/resolve-after-write
> ordering with deferred promises. Extend the existing account-generation
> contract; do not solve the bug with timing, refetch loops, or partial profile
> objects.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/stores/userStore.ts app/stores/__tests__/userStore.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 057
- **Category**: bug / concurrency
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: TODO

## Why this matters

Profile reads and settings writes reject replacement-account work, but they do
not order operations within one account. An old SELECT can resolve after a
successful update and replace the full local profile with stale settings.

## Current state

- `fetchProfileForWork` at `userStore.ts:563-582` publishes any response whose
  account generation is current: `profile.value = data as Profile`.
- `updateSettingsWithWork` at `userStore.ts:614-700` queues writes and replaces
  the full profile from the update/upsert response, but advances no read/write
  revision.
- Tests cover fetches and queued writes separately, not their interleaving.

## Commands you will need

| Purpose       | Command                                                                  | Expected on success |
| ------------- | ------------------------------------------------------------------------ | ------------------- |
| Focused tests | `npx vitest run --project stores app/stores/__tests__/userStore.test.ts` | all pass            |
| Full gate     | `npm run verify`                                                         | exit 0              |

## Scope

**In scope**: `app/stores/userStore.ts`, its store tests, and a tiny shared
operation-revision helper only if another store already uses the exact pattern.

**Out of scope**: settings control hydration (Plan 046), database schema,
realtime profile subscriptions, or local-library preferences (Plan 068).

## Git workflow

- Branch: `codex/060-reconcile-profile-read-write-order`
- Commit: `fix(profile): reconcile reads with settings writes`

## Steps

1. Add deferred tests: begin fetch F, commit update U, then resolve F with old
   data; reverse the completion order; cover failed U/refetch, two queued
   updates, account replacement, theme, and key-format derived state.
2. Introduce a monotonic profile operation revision scoped to the current
   identity. A fetch captures its start revision and may publish only if no
   newer successful/optimistic write owns the profile. A write response may
   publish only if it still owns the queued operation.
3. On write failure, perform one explicitly fresh authoritative read whose
   snapshot begins after the failed write. That recovery read must not clobber
   a later queued successful write.
4. Reset all revision/provenance state on identity invalidation. Update theme
   and local key-format derivatives only from a response permitted to publish.

**Verify after each step**: focused tests; finally format, conventions, and
`npm run verify`.

## Test plan

Assert both persistence result and visible state. Include fetch F1, update U1,
update U2 permutations, stale errors (no toast for replaced work), and exact
theme/key preference side effects.

## Done criteria

- [ ] A read started before a newer write cannot overwrite that write locally.
- [ ] Failed-write recovery cannot overwrite a later queued success.
- [ ] Replacement-account guarantees and serialized updates remain intact.
- [ ] Focused and full gates pass.

## STOP conditions

Stop if ordering requires comparing unreliable server timestamps, if recovery
can loop, or if profile publication has another unreviewed writer.

## Maintenance notes

Keep the revision contract next to profile ownership and document which events
advance it. Plan 068 may extract preferences, but must retain this cloud-adapter
ordering behavior.
