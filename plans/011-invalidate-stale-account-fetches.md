# Plan 011: Prevent signed-out or prior-account fetches from repopulating stores

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/stores/recordsStore.ts app/stores/tracksStore.ts app/stores/cratesStore.ts app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts app/composables/useUserData.ts app/composables/__tests__/useUserData.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/010-page-full-library-queries.md`
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `cb6f108` (integrated as `7deac4a`), 2026-07-19

## Why this matters

Signing out clears records, tracks, and crates, but an already-running fetch can
resolve afterward and write the previous account's rows back into shared Pinia
state. The retained fetch promise can also make the next account await the old
operation instead of starting its own. Each store needs an account generation
and a store-owned resolved-user guard around every state/error/loading commit.
The guard cannot depend on reactive `supaUserId`, because persisted-session
bootstrap resolves auth before that reactive field is always populated.

## Current state

- `recordsStore.ts:71,102-142` keeps one `fetchPromise`; after resolving the
  authenticated user it commits decoded rows without rechecking account state.
  `clearRecords()` at lines 502-506 clears arrays but neither invalidates nor
  releases the promise.
- `tracksStore.ts:35,129-172,402-405` and
  `cratesStore.ts:16,24-61,246-249` use the same pattern.
- `useUserData.ts` starts all three store fetches as authenticated state changes
  and clears stores on sign-out.
- `sessionStore.ts:285-319` is the correct repository exemplar: it increments an
  `accountGeneration`, captures `{ generation, userId }`, and ignores late work
  unless both still match.
- `userStore.ts:98-112` can return an authenticated ID from `getSession()` or
  `getUser()` while reactive `supaUserId` remains null. `useUserData.ts:126-133`
  intentionally supports that persisted-session bootstrap. Store fetch guards
  must therefore track the most recently resolved user inside the store rather
  than comparing to `user.supaUserId`.
- Plan 010 adds multiple page requests; this plan must guard the final aggregate
  commit and must not allow a stale page loop to overwrite current state.

## Commands you will need

| Purpose           | Command                                                                                                                                                       | Expected on success |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Store regressions | `npx vitest run --project stores app/stores/__tests__/recordsStore.test.ts app/stores/__tests__/tracksStore.test.ts app/stores/__tests__/cratesStore.test.ts` | all pass            |
| User-data tests   | `npx vitest run --project stores app/composables/__tests__/useUserData.test.ts`                                                                               | all pass            |
| Browser auth flow | `npm run test:e2e`                                                                                                                                            | all pass            |
| Full gate         | `npm run verify`                                                                                                                                              | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/stores/recordsStore.ts`
- `app/stores/tracksStore.ts`
- `app/stores/cratesStore.ts`
- `app/stores/__tests__/recordsStore.test.ts`
- `app/stores/__tests__/tracksStore.test.ts`
- `app/stores/__tests__/cratesStore.test.ts`
- `app/composables/__tests__/useUserData.test.ts`
- `app/composables/useUserData.ts` only if a test proves orchestration must change
- `plans/README.md` status row

**Out of scope**:

- Session store; it already has account-generation protection
- Auth provider/session architecture
- Pagination mechanics from Plan 010
- Canceling HTTP requests with AbortController; correctness does not require it
- Changing toasts, row decoding, ownership filters, or store public data shapes

## Git workflow

- Branch: `codex/011-account-fetch-invalidation`
- Use one Conventional Commit, for example
  `fix(stores): discard stale account fetches`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add an operation context to each store

In each of records, tracks, and crates stores, add a private integer
`accountGeneration` and a private `activeFetchUserId: string | null`. Add a
helper equivalent to:

```ts
type FetchContext = { generation: number; userId: string }
function isCurrentFetchContext(context: FetchContext): boolean {
	return (
		context.generation === accountGeneration &&
		activeFetchUserId === context.userId
	)
}
```

Capture the generation before resolving auth. After auth returns a user ID, set
`activeFetchUserId` only if the captured generation is still current; otherwise
return `false` without committing anything. Then capture `{ generation, userId
}`. Before every state commit, warning/toast, and loading-flag clear, require
the context to remain current. A stale fetch returns `false` silently.

Do not compare against reactive `user.supaUserId`; valid persisted-session
bootstrap may leave it null temporarily. The generation is invalidated by each
clear/account transition, while `activeFetchUserId` prevents two identities
within one generation from sharing ownership.

**Verify**: typecheck the three stores with `npm run typecheck` -> exit 0.

### Step 2: Make promise ownership race-safe

Move `fetchPromise = null` out of a generic fetch `finally`. In `fetchAll*`, keep
the exact promise created for the current generation and clear the shared slot
only when `fetchPromise === createdPromise`. This prevents an old promise's
finally from clearing a newer account's promise.

Each `clear*` action must:

1. increment `accountGeneration`;
2. set `fetchPromise = null`;
3. set `activeFetchUserId = null`;
4. set its loading flag false;
5. clear existing domain/search state exactly as today.

Do not await or mutate the stale operation.

**Verify**: store tests start old and new deferred fetches, resolve the new one
first and old one last, and assert only new rows remain and loading is false.

### Step 3: Add sign-out and account-switch regressions

For every store, add tests for:

- fetch starts, `clear*()` runs, old success resolves: state stays empty;
- fetch starts, `clear*()` runs, old error resolves: no error toast/log mutation;
- old fetch starts for user A, clear/switch to user B, new fetch starts: two
  backend operations occur and only B commits;
- old finally resolves while B fetch is pending: a second B caller still shares
  B's promise, not A's;
- paginated A fetch is invalidated between pages and never partially commits.

Use deferred promises and existing mock query builders; do not use timers or
real Supabase.

**Verify**: the three focused store test files pass.

### Step 4: Prove orchestration remains correct

Extend `useUserData.test.ts` with a rapid A -> signed out -> B scenario. Assert
the composable calls all three clear actions and all three B fetches. Modify
`useUserData.ts` only if this test exposes a missing call; the generation logic
should normally make its existing orchestration sufficient.

**Verify**: `npx vitest run --project stores app/composables/__tests__/useUserData.test.ts`
-> all pass.

### Step 5: Run browser and full gates

**Verify**: `npm run format && npm run check:conventions && npm run test:e2e && npm run verify`
-> exit 0.

## Test plan

- Use controllable deferred query promises; resolve them in the opposite order
  from invocation.
- Assert stale failures are silent because their account no longer owns UI state.
- Preserve existing same-account promise de-duplication tests.
- Preserve Plan 010's page-boundary/error tests.
- Existing login-without-refresh E2E must remain green.

## Done criteria

- [ ] Clearing any library store invalidates its active fetch immediately.
- [ ] An old account can never commit rows, warnings, errors, or loading state.
- [ ] A new account starts a new fetch even while the old network request lives.
- [ ] An old finally cannot clear the current account's promise slot.
- [ ] Same-account callers still share one active fetch.
- [ ] Focused, E2E, and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- `resolveAuthenticatedUserId()` can return different user IDs within one
  generation without an intervening clear/account transition; report the
  observed orchestration before changing auth code.
- Fixing the race requires a global auth-store redesign.
- Plan 010 has not landed or the live fetch implementation no longer matches its
  complete-page semantics.
- A stale operation performs a destructive mutation rather than a read; that
  requires a separate mutation-cancellation plan.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any new account-scoped async read must capture both generation and user ID.
- Promise identity checks are as important as result guards; review both.
- Do not show late errors from an account that is no longer active.
