# Plan 016: Prevent stale cover-file inspection from overwriting the latest selection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- app/components/records/DialogRecordDetails.vue test/nuxt/record-cover.nuxt.test.ts test/nuxt/record-details-cover-editor.nuxt.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `bbbe1ee` (integrated as `488b59f`), 2026-07-19

## Why this matters

Image decoding is asynchronous. If a user selects file A, then file B, A can
finish last and replace B's preview/file/dimensions—or write an old error after
the editor was cleared or closed. A monotonically increasing inspection token
must make only the newest still-active attempt eligible to commit state, while
every discarded object URL is revoked.

## Current state

- `DialogRecordDetails.vue:254-294` validates a file, creates an object URL and
  `Image`, awaits `onload`, then unconditionally writes preview state; its catch
  unconditionally writes `pendingCoverError`.
- `resetCoverEditor` at lines 242-252 and `clearPendingFile` at 312-318 clear
  state but do not invalidate an in-flight `Image` callback.
- `selectUrlMode` clears the pending file, and `onUnmounted` at line 352 only
  revokes the currently committed preview.
- `ImageRecordCover.vue` already uses a numeric request counter for async signed
  URL lookup (`ImageRecordCover.vue:22-33`); use the same generation concept.
- `test/nuxt/record-cover.nuxt.test.ts` tests presentation, not the record-detail
  editor. Add a focused dialog test file rather than overloading those tests.
- Components must remain type-first PascalCase and Tailwind-only.

## Commands you will need

| Purpose              | Command                                                                            | Expected on success |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| Focused Nuxt tests   | `npx vitest run --project nuxt test/nuxt/record-details-cover-editor.nuxt.test.ts` | all pass            |
| Existing cover tests | `npx vitest run --project nuxt test/nuxt/record-cover.nuxt.test.ts`                | all pass            |
| Full gate            | `npm run verify`                                                                   | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `app/components/records/DialogRecordDetails.vue`
- `test/nuxt/record-details-cover-editor.nuxt.test.ts` (create)
- `plans/README.md` status row

**Read only; expected unchanged**:

- `app/components/records/ImageRecordCover.vue`
- `test/nuxt/record-cover.nuxt.test.ts`

**Out of scope**:

- Cover validation/cropping rules, upload/storage behavior, or durable cleanup
- Extracting the cover editor into a new component
- Canceling browser image decode itself; stale-result suppression is sufficient
- UI redesign or new CSS/style blocks

## Git workflow

- Branch: `codex/016-cover-inspection-generation`
- Use one Conventional Commit, for example
  `fix(records): ignore stale cover inspections`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add a private inspection generation

Add `let coverInspectionGeneration = 0` and a helper that increments it. Every
call to `inspectCoverFile` must increment at function entry, before synchronous
validation, and capture its generation. Thus even an invalid newer selection
invalidates an older decode.

Increment the generation in every action that abandons inspection state:
`resetCoverEditor`, `clearPendingFile`, URL-mode selection (through clear), cover
removal (through clear), and unmount. Avoid double increments only for clarity;
extra monotonic increments are harmless.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Guard every async success/error commit

After the image-load await and again before each success state mutation, compare
the captured generation with the current one. If stale, revoke that attempt's
`previewUrl` and return without touching preview, file, error, dimensions, crop,
or removal state.

In catch, always revoke that attempt's URL, but update `pendingCoverError` only
when its generation is current. Ensure a successful current attempt transfers
URL ownership to `pendingCoverPreviewUrl` exactly once and does not revoke it.

**Verify**: a source search shows every post-await/catch state write is guarded;
focused tests in Step 3 provide the machine proof.

### Step 3: Add controllable fake-Image regressions

Create a Nuxt test that mounts `DialogRecordDetails` with the smallest existing
testing-Pinia fixture needed to enter cover edit mode. Stub `globalThis.Image`
with instances whose `onload`/`onerror`, natural dimensions, and `src` can be
settled in arbitrary order. Stub `URL.createObjectURL` with unique URLs and spy
on `URL.revokeObjectURL`.

Cover:

1. A selected, B selected, B loads, A loads: B remains current; A URL revoked;
2. A selected, B selected, B succeeds, A errors: B remains and old error hidden;
3. A pending, clear/reset: later A success commits nothing and URL is revoked;
4. A pending, switch to URL mode: same;
5. A pending, component unmount: no state update and URL revoked;
6. invalid B immediately invalidates pending A and shows only B's validation
   error;
7. current success still sets dimensions/crop defaults and current failure shows
   its error.

Use DOM-visible preview/error assertions where possible; expose no production
test-only state.

**Verify**: focused test file passes.

### Step 4: Run full verification

**Verify**: `npm run format && npm run check:conventions && npx vitest run --project nuxt test/nuxt/record-details-cover-editor.nuxt.test.ts test/nuxt/record-cover.nuxt.test.ts && npm run verify`
-> exit 0.

## Test plan

- Fake image completions must be manually ordered, not timer-based.
- Assert exact object-URL revocation counts to catch leaks/double ownership.
- Keep existing cover presentation and upload store tests green.
- Test both stale success and stale failure; they mutate different state today.

## Done criteria

- [ ] Only the newest active inspection can update editor state.
- [ ] Clear, mode switch, reset, remove, and unmount invalidate pending work.
- [ ] Every stale/current-failure URL is revoked exactly once.
- [ ] The current successful preview remains live until later reset/replacement.
- [ ] Existing validation and crop defaults are unchanged.
- [ ] Focused and full gates pass.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- The dialog cannot be mounted without changing unrelated generated UI
  primitives; use an existing application-level fixture, do not edit primitives.
- The browser implementation reuses one Image instance in a way the proposed
  ownership model cannot represent.
- Fixing URL ownership requires changing upload/storage behavior.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any new async cover probe (EXIF, crop detection) must carry the same generation.
- Reviewer focus: invalid newer input must invalidate older async work, and stale
  catches must not overwrite current errors.
- Keep object URL ownership explicit; generation guards alone do not prevent
  leaks.
