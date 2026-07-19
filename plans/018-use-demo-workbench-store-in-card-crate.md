# Plan 018: Make CardCrate read from the injected demo workbench

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/components/crates/CardCrate.vue app/composables/useWorkbench.ts test/nuxt/demo-workbench.nuxt.test.ts app/demo/domainFixtures.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `65c885c` (integrated as `58ebf01`), 2026-07-19

## Why this matters

The `/demo` workbench intentionally seeds an isolated Pinia instance so shared
pages can render realistic fixtures without touching account state. `CardCrate`
bypasses that injection and reads the default records store, so demo crate cards
can omit their seeded record-title previews or leak whatever the application
store contains. One wrapper substitution restores the architecture and a
rendered regression will prevent future shared components from bypassing it.

## Current state

`CardCrate.vue:14-17` contains:

```ts
const records = useRecordsStore()
const previewRecords = computed(() =>
	records.getRecordsByIds(props.crate.records.slice(0, 3))
)
```

- `useWorkbench.ts:81-99` exposes `useWorkbenchPinia()` and wrappers including
  `useWorkbenchRecordsStore()`; the wrapper falls back to app Pinia outside a
  provided workbench.
- Pages `/crates`, `/records`, `/tracks`, and the demo shell already use
  workbench wrappers. `CardCrate` is shared by the crate page.
- `test/nuxt/demo-workbench.nuxt.test.ts:20-116` mounts a host with
  `provideDemoWorkbench()` and proves 6 records/24 tracks/3 crates are isolated,
  but does not render `CardCrate`.
- Demo fixtures have deterministic crate record IDs and titles. Do not change
  fixture data to make the test pass.

## Commands you will need

| Purpose          | Command                                                               | Expected on success |
| ---------------- | --------------------------------------------------------------------- | ------------------- |
| Focused test     | `npx vitest run --project nuxt test/nuxt/demo-workbench.nuxt.test.ts` | all pass            |
| Convention check | `npm run check:conventions`                                           | exit 0              |
| Full gate        | `npm run verify`                                                      | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/components/crates/CardCrate.vue`
- `test/nuxt/demo-workbench.nuxt.test.ts`
- `plans/README.md` status row

**Read only; expected unchanged**:

- `app/composables/useWorkbench.ts`
- `app/demo/domainFixtures.ts`

**Out of scope**:

- Demo fixture redesign, capability changes, or demo mutations
- Changing CardCrate layout/styling/selection behavior
- Replacing Pinia or the workbench injection architecture
- Auditing/fixing account-only dialogs that correctly use default stores

## Git workflow

- Branch: `codex/018-card-crate-demo-store`
- Use one Conventional Commit, for example
  `fix(demo): resolve crate previews from workbench store`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Replace the direct store lookup

In `CardCrate.vue`, change only:

```ts
const records = useWorkbenchRecordsStore()
```

Keep preview slicing, order, props, emit, and markup unchanged. Because the
wrapper falls back to app Pinia, authenticated behavior remains identical.

**Verify**: `rg -n "use(WorkbenchRecords|Records)Store" app/components/crates/CardCrate.vue`
-> exactly one `useWorkbenchRecordsStore` match and no direct `useRecordsStore`.

### Step 2: Add a rendered isolation regression

Extend `demo-workbench.nuxt.test.ts` with a host that calls
`provideDemoWorkbench()` and renders `CardCrate` for the first seeded crate.
Before mounting, seed the default/app records store with a sentinel title that
is not in demo fixtures. Assert:

- rendered preview includes the expected demo record title(s);
- sentinel title is absent;
- record count matches the crate fixture;
- clicking still emits the original crate.

Do not mock `useWorkbenchRecordsStore`; exercise actual injection.

**Verify**: focused Nuxt test passes.

### Step 3: Run conventions and full verification

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project nuxt test/nuxt/demo-workbench.nuxt.test.ts && npm run verify`
-> exit 0.

## Test plan

- The regression must mount a real workbench provider and real CardCrate.
- Distinct app/demo sentinel content proves which Pinia supplied the data.
- Existing isolated-fixture and mutation-capability tests remain green.

## Done criteria

- [ ] CardCrate uses `useWorkbenchRecordsStore` only.
- [ ] Demo-rendered crate previews contain seeded demo titles, never app-state
      sentinels.
- [ ] Authenticated fallback behavior remains available through the wrapper.
- [ ] Markup and emitted selection contract are unchanged.
- [ ] Focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- `CardCrate` is no longer rendered inside a provided workbench on `/demo`.
- The wrapper no longer falls back to application Pinia outside demo.
- The test requires altering demo fixtures or product markup.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Reusable workbench components should consume `useWorkbench*Store` wrappers;
  account-only dialogs may continue using direct stores.
- When adding another shared component to demo pages, include a rendered
  sentinel-isolation assertion.
