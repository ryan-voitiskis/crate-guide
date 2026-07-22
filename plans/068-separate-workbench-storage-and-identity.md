# Plan 068: Separate workbench storage from account identity

> **Executor instructions**: Refactor the existing cloud/demo workbench behind
> domain repositories before adding browser persistence. Preserve every settled
> concurrency invariant and keep authenticated routes protected in this plan.
> Do not emulate local mode with a fake or anonymous Supabase user.
>
> **Drift check (run first)**:
> `git diff --stat 0a0cda6..HEAD -- app/composables/useWorkbench.ts app/utils/workbenchPinia.ts app/composables/useUserData.ts app/stores app/repositories shared/types/supabase.ts shared/types/library.ts app/composables/useRecordCover.ts`

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 044, 047, 048, 051, 054, 055, 057, 060, and 064
- **Category**: direction / architecture
- **Planned at**: commit `0a0cda6`, 2026-07-22
- **Status**: DONE

## Why this matters

The reusable demo workbench proves that the core UI is not inherently tied to
authenticated routes. The real coupling is inside stores: persistence,
Supabase identity, preferences, covers, and account lifecycle share ownership.
Accountless mode needs library location to be independent from identity and
network state without duplicating every store or weakening race protection.

## Current state

- `useWorkbench.ts:74-123` injects an alternate Pinia into the same pages.
- `workbenchPinia.ts:4-32` models only `mode: 'app' | 'demo'` plus booleans.
- records/tracks/crates/session stores instantiate Supabase and user state
  directly; demo branches detect a marked Pinia and reject writes.
- `useUserData.ts:136-199` clears/reloads all domain stores when auth identity
  changes. Authentication therefore currently selects the data source.
- `shared/types/supabase.ts` exposes database transport fields as application
  domain shapes; `useRecordCover.ts` understands only external URLs or private
  Supabase paths.

The target model has independent axes:

| Axis           | Values                                    |
| -------------- | ----------------------------------------- |
| Active library | `browser`, `cloud`, `demo`                |
| Identity       | signed out or a verified Supabase account |
| Connectivity   | online or offline                         |

## Commands you will need

| Purpose           | Command                | Expected on success     |
| ----------------- | ---------------------- | ----------------------- |
| Application tests | `npm run test:run`     | all pass                |
| E2E               | `npm run test:e2e`     | all existing flows pass |
| Browser           | `npm run test:browser` | all pass                |
| Full gate         | `npm run verify`       | exit 0                  |

## Scope

**In scope**:

- transport-neutral domain types under `shared/types/library.ts` (or cohesive
  files) and Supabase mapping codecs
- `app/repositories/library/*` domain interfaces, cloud adapters, and read-only
  demo adapters
- workbench context/capability injection and store consumers
- separation of preferences from auth/profile transport
- cover reference/resolver abstraction
- `useUserData.ts` split into authentication lifecycle and active-workspace data
  lifecycle, without enabling signed-out routes yet
- repository contract/parity tests and architecture docs

**Out of scope**:

- IndexedDB implementation (Plan 069)
- export/restore (Plan 070)
- signed-out routing/onboarding (Plan 071)
- cloud/local sync or merge
- generic ORM/query-builder emulation

## Git workflow

- Branch: `codex/068-separate-workbench-storage-and-identity`
- Commit: `refactor(workbench): separate storage from identity`

## Steps

### Step 1: Freeze domain and repository contracts

Move application-facing Record, Track, Crate, SavedSet, Preferences, and Cover
reference shapes away from raw database ownership fields. Keep strict mapping
codecs at the Supabase edge. Define small domain repositories, not one god
interface:

- records/tracks with semantic CRUD, atomic record-with-tracks, and batch CAS;
- crates with atomic membership/delete integrity;
- saved sets with ordered history/autosave semantics;
- preferences;
- cover byte/reference lifecycle;
- coherent `readLibrarySnapshot()` plus repository/workspace revision.

Commands return typed outcomes (`success`, `stale`, `conflict`, `unavailable`)
and accept an explicit workspace-operation context. They never accept a raw
query builder or client-supplied cloud owner ID.

Freeze preference ownership before moving code:

| Owner                | Fields/behavior                                                                                       | Switch/archive rule                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identity/integration | profile name and Discogs account/OAuth metadata                                                       | never enters a library archive or Local repository                                                                                  |
| Active library       | `ui_theme`, `key_format`, `list_layout`, `selected_crate`, `turntable_pitch_range`, `turntable_theme` | cloud maps the current profile fields; browser stores them per workspace; archives include them and validate/remap `selected_crate` |
| Device presentation  | `crate-guide-density` and a signed-out/no-workspace theme fallback                                    | stays on-device, is not copied/exported, and cannot overwrite another workspace                                                     |

The anonymous theme value is a bootstrap cache/fallback, not a second owner.
After hydration, the active library theme wins and refreshes a workspace-tagged
first-paint mirror without writing another library. Demo may hold temporary
device presentation changes while its domain adapter remains read-only; leaving
demo restores the selected workspace's effective values.

**Verify**: pure codec/contract tests pass and generated DB types stay unchanged.

### Step 2: Implement cloud adapters without behavior drift

Move Supabase calls behind the interfaces using the settled account generation,
per-entity revisions, tombstones, fresh-fetch, RPC, and decode contracts. Keep
Pinia as reactive presentation/cache state, but make it consume injected
repositories rather than construct Supabase. Run the mutable-backend CRUD/
concurrency contract suite plus existing store tests against the cloud adapter.

**Verify**: all existing store tests pass unchanged or with mechanical adapter
setup; adversarial tests from prerequisite plans still pass.

### Step 3: Make demo a real read-only repository

Replace scattered `isDemoStore` persistence branches with a seeded in-memory
read-only adapter returning a typed disabled outcome. Split contracts into
common read/snapshot/capability assertions and mutable-backend CRUD/concurrency
assertions; demo passes the former plus explicit disabled outcomes, not the
cloud mutation suite. Keep the existing demo fixtures, routes, and visible
capabilities. Do not make demo mutable or durable.

**Verify**: demo E2E behavior and mutation-disabled tests pass.

### Step 4: Introduce an explicit active workbench context

Define a stable workspace descriptor containing repository identity, location,
display label, read-only state, current revision, and capabilities. Identity
and `useOnline()` remain separate inputs. Replace `mode: 'app'` with explicit
`cloud | browser | demo` vocabulary while browser remains unavailable until
Plan 069.

Split `useUserData`: auth hydration exposes account availability; workspace
bootstrap owns the active repository. Auth changes may invalidate cloud work but
must not implicitly select/clear another workspace. In this plan, existing
signed-in cloud startup remains the default for backward compatibility.

**Verify**: auth A/B/sign-out tests, workbench injection tests, and E2E pass.

### Step 5: Abstract preferences and covers

Keep identity/integration fields in the cloud identity store. Implement the
frozen preference matrix and theme-mirror precedence exactly; changing active
workspace refetches library-owned preferences and never copies them implicitly.
Represent covers as external URL, managed cloud asset, managed local asset, or
none; never overload `cover_storage_path` with a pseudo-path.

**Verify**: settings, cover, demo, account replacement, format/convention/full
gates pass.

## Test plan

- Run common read/snapshot/capability contracts against cloud and demo, and the
  mutable CRUD/concurrency suite only against mutable adapters.
- Characterize every public store action and current toast/result before moving
  it.
- Cover workspace replacement during fetch/mutation, auth change while a
  non-cloud descriptor is active (synthetic only), cover resolution, preference
  ownership/theme precedence/demo overrides, and coherent snapshot loading
  including sets.

## Done criteria

- [x] Stores no longer instantiate persistence transports directly.
- [x] Library location, auth identity, and connectivity are distinct typed state.
- [x] Cloud behavior/race protection and read-only demo behavior are unchanged.
- [x] Identity-, library-, and device-owned preferences follow the frozen switch/archive precedence.
- [x] Domain types do not require local data to pretend it has a `user_id` or Supabase path.
- [x] Contract, store, Nuxt, E2E, browser, convention, and full gates pass.

## STOP conditions

Stop if an interface erases domain-specific transaction/reconciliation rules,
if cloud parity cannot be characterized, if auth changes still implicitly clear
an arbitrary active workspace, or if the refactor requires a mutable base-store
superclass.

## Maintenance notes

Every new persistence backend must pass the same semantic contract suite. Keep
transport mapping at adapters and keep product vocabulary `This browser`,
`Cloud library`, and `Demo` out of low-level SQL types.
