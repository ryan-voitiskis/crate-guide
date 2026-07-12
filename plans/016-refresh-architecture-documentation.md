# Plan 016: Refresh and archive architecture documentation

> **Executor instructions**: Execute this plan last. Document only architecture
> and commands that actually exist after dependency plans. Do not change code or
> configuration to make prose true. Run the checks and stop on any mismatch.
> Update the tracker row when complete unless the reviewer owns it.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 004d548..HEAD -- \
>   README.md \
>   AGENTS.md \
>   CLAUDE.md \
>   docs/discogs-integration.md \
>   docs/track-enrichment.md \
>   docs/tmp/supabase-auth-audit.md \
>   docs/archive
> ```
>
> Run `git status --short`. Plans 003–015 must either be DONE or explicitly
> reconciled; this document must describe final source, never planned source.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: Plans 003–015
- **Category**: docs
- **Planned at**: commit `004d548`, 2026-07-12

## Why this matters

Current documentation says Discogs credentials live in readable profile
columns even though they were moved behind a private table/RPC boundary. The
security audit still calls itself ready for implementation despite recording
completed commits, and README testing/tooling descriptions do not match the
actual Vitest/Nuxt Test Utils/Deno harness. This final plan records the
implemented architecture and archives historical audit material without
discarding its decision trail.

## Current state

- `docs/discogs-integration.md:46-50` says `isOAuthed` is based on stored
  tokens; `app/stores/discogsAuthStore.ts:16-21` derives it from
  `discogs_username` so the client never reads credential secrets.
- `docs/discogs-integration.md:69-85,125-131` says request/access credentials
  are stored in user profiles and describes a generic proxy.
- `supabase/migrations/20260417120300_move_discogs_credentials.sql:41-58`
  removed profile credential columns and made dedicated RPCs the access path.
- `docs/tmp/supabase-auth-audit.md:1-21` says “ready for implementation” and
  instructs future work, while later sections record implementation commits.
- `README.md:26-63,125-159` describes Playwright and test layout/commands
  incompletely relative to the final Vitest E2E, Nuxt runtime, Edge, convention,
  and maintenance gates.
- `docs/track-enrichment.md` records the active review-before-write enrichment
  model and private analyzer research; Plans 013–014 change internal ownership
  and benchmark provenance without changing safety policy.
- `AGENTS.md` and `CLAUDE.md` are currently byte-identical. Preserve that.

Never reproduce credential values or `.env` content. Historical audit evidence
may identify credential types and code locations only.

## Commands you will need

| Purpose            | Command                      | Expected on success                      |
| ------------------ | ---------------------------- | ---------------------------------------- |
| Agent guide parity | `cmp -s AGENTS.md CLAUDE.md` | exit 0                                   |
| Format check       | `npm run format:check`       | exit 0                                   |
| Convention check   | `npm run check:conventions`  | exit 0                                   |
| Full verification  | `npm run verify`             | exit 0                                   |
| Link/path checks   | commands in Done criteria    | expected files/phrases present or absent |

## Scope

**In scope**:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/discogs-integration.md`
- `docs/track-enrichment.md`
- move `docs/tmp/supabase-auth-audit.md` to
  `docs/archive/supabase-auth-audit-2026-04.md`
- `plans/README.md` — status-only update after implementation

**Out of scope**:

- Any source, test, package, lockfile, config, migration, generated type, or
  command implementation.
- Rewriting historical audit findings as current vulnerabilities.
- Adding secrets, environment values, production URLs, or user data.
- Product roadmap or new enrichment source design.
- Deleting the audit rather than preserving it as clearly historical material.

## Git workflow

- Branch: `codex/016-refresh-architecture-docs`.
- Before editing, record the implementation-start SHA with `git rev-parse HEAD`;
  use that SHA, not the planned-at SHA, for the final scope diff.
- Suggested commit: `docs: align architecture and verification guides`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Verify every final command and path before documenting it

Run or inspect:

- `test`, `test:run`, `test:nuxt`, `test:e2e`;
- `check:edge`, `lint:edge`, `test:edge`;
- `format`, `format:check`, `check:conventions`, `verify`;
- `genTypes` and its failure-safe tool test;
- the actual component/runtime/E2E test locations;
- final enrichment composable/config paths;
- final UI wrapper/component names.

**Verify**: every command/path exists. If any dependency plan chose a different
name, document the live name rather than the old plan text.

### Step 2: Align README with the actual development stack

Update README to describe:

- Vitest projects for pure unit, stores/composables, server, and Nuxt runtime;
- Nuxt Test Utils + Vitest E2E backed by `playwright-core`, not a second
  Playwright Test runner;
- one-time `npx playwright-core install chromium` prerequisite;
- actual colocated/`__tests__`/`test/nuxt`/`test/e2e` placement;
- Deno 2 prerequisite and Edge check/lint/test commands;
- `npm run verify` as the read-only comprehensive gate;
- `format:check`, convention checks, and production build as distinct commands;
- failure-safe `genTypes` prerequisite/behavior and the intentional two copies.

Do not claim CI runs a command when no checked-in CI workflow exists.

### Step 3: Correct Discogs credential and dispatcher architecture

Rewrite the technical sections to state:

- the browser derives connected state from `discogs_username` only;
- secrets live in dedicated `discogs_credentials` storage inaccessible through
  normal client table reads;
- authenticated Edge Functions access/update credentials through identity-bound
  RPCs;
- request-token, access-token, identity refresh, and disconnect flow;
- `authenticated-discogs-request` dispatches only explicit allowed endpoint
  variants rather than acting as an arbitrary URL proxy;
- handler/client tests and Edge verification commands that actually exist.

Preserve useful OAuth/domain explanations and safe public-error guidance.

### Step 4: Refresh enrichment/analyzer maintenance documentation

Update `docs/track-enrichment.md` to match:

- `useTrackEnrichmentWorkflow` ownership and the thin route boundary;
- shared `localAudioAnalysis.json` configuration ownership;
- benchmark output's effective config/analyzer/runtime metadata;
- configuration-version/cache invalidation maintenance rule;
- current test commands for matcher/workflow/Worker/config behavior.

Preserve the decided product policy: XML/local inputs, review before write,
blank-only changes, provenance retention, no local audio upload, and confidence
thresholds unchanged.

### Step 5: Archive the completed security audit

Move the tracked file to `docs/archive/supabase-auth-audit-2026-04.md`. Add a
prominent first-page banner stating:

- historical/completed audit;
- original review date;
- implementation status is recorded in each finding/commit reference;
- current architecture lives in the maintained docs/source;
- it must not be used as an active implementation checklist.

Correct the contradictory top-level status/how-to-use language, but do not
rewrite the entire historical body or erase decisions/evidence. Ensure it
contains no credential values.

### Step 6: Update agent guides identically

Keep `AGENTS.md` and `CLAUDE.md` byte-identical. Preserve existing four rules
and add only concise live commands/boundaries needed after the portfolio, such
as:

- run `npm run check:conventions`/`npm run verify` where appropriate;
- application-specific UI behavior belongs in wrappers outside generated
  `components/ui`;
- Prettier, not Deno fmt, owns Edge formatting.

Do not turn the guides into architecture essays.

### Step 7: Run stale-claim and full checks

Run:

```bash
cmp -s AGENTS.md CLAUDE.md
test -f docs/archive/supabase-auth-audit-2026-04.md
test ! -e docs/tmp/supabase-auth-audit.md
rg -q "Nuxt Test Utils" README.md
rg -q "npm run verify" README.md
rg -q "npm run check:edge" README.md
rg -q "private" docs/discogs-integration.md
rg -q "credentials" docs/discogs-integration.md
rg -q "discogs_username" docs/discogs-integration.md
rg -q "RPC" docs/discogs-integration.md
rg -q "useTrackEnrichmentWorkflow" docs/track-enrichment.md
rg -q "localAudioAnalysis\.json" docs/track-enrichment.md
rg -q "configuration" docs/track-enrichment.md
rg -n "ready for implementation|Tokens are stored in the user profile|Updates profile with access credentials" README.md docs AGENTS.md CLAUDE.md
npm run format:check
npm run check:conventions
npm run verify
```

Expected: all positive checks exit 0; the stale-claim search exits 1 with no
matches; full verification remains green.

## Test plan

- Documentation verification is command/path/phrase based, not subjective.
- Re-open each cited live source before describing security or data ownership.
- Check links and file paths introduced by moves.
- Review archived audit for accidental current-tense instructions and secret
  values without copying any such values into output.

## Completion and reconciliation

- Implemented by amended executor commit
  `0d3f8d72b0a9f5fc0f2ee7036d501b60b25e1315` and integrated as
  `f1335ded372133850f538241845d3bdd978041d2`. The implementation scope is
  documentation-only: `README.md`; byte-identical `AGENTS.md` and `CLAUDE.md`;
  the Discogs and enrichment guides; and the 91%-similar move from
  `docs/tmp/supabase-auth-audit.md` to
  `docs/archive/supabase-auth-audit-2026-04.md`. No source, test, package,
  lockfile, configuration, migration, or generated file changed.
- The source-truth audit reopened the live package scripts, Vitest projects,
  test paths, credential migration/RPCs, Edge handlers, stores, enrichment
  composable, shared analyzer configuration, Worker/cache code, and benchmark
  script before updating prose. The README now records Deno 2.x, the currently
  empty server test project, Nuxt Test Utils E2E backed by `playwright-core`,
  and the actual maintenance gates without claiming a separate Playwright Test
  runner or checked-in CI behavior.
- The Discogs guide distinguishes the normal application/store path and normal
  authenticated table reads from callable RPC behavior. Those paths select
  public profile identity and cannot read the private credential table, while
  an authenticated caller may invoke `get_discogs_credentials`, which is bound
  internally to `auth.uid()` and accepts no caller-supplied user ID. Edge
  Functions use the same caller-bound RPC boundary. The guide describes the
  post-exchange identity fetch and explicitly states that direct Edge handler
  tests do not currently exist rather than overclaiming coverage.
- The enrichment guide records `useTrackEnrichmentWorkflow` ownership and the
  thin rendered route, shared `localAudioAnalysis.json` ownership, deliberate
  analyzer/configuration/metadata-reader cache versioning, and the `ffprobe`
  plus `ffmpeg` benchmark prerequisites. Benchmark output is described as
  selected effective analyzer/config/runtime metadata, not an exhaustive
  serialization of every setting.
- The archived audit has an unmistakable historical/completed banner and is no
  longer an active implementation checklist. Its implementation lines remain
  distinct from deferred observations and positive findings; the decision trail
  is preserved without credential values, environment contents, or other
  secrets.
- Byte-comparison, archive/source-path, maintained-link/path, positive phrase,
  and stale-claim checks passed. `AGENTS.md` and `CLAUDE.md` are byte-identical,
  the archived path exists, the temporary path is absent, and the stale search
  is empty. Format and convention checks also passed.
- Focused verification passed 83 Discogs tests, 30 matcher/config tests, 13
  workflow tests, 15 Nuxt route/Worker/cache tests, and 7 benchmark-config
  tests.
- Full verification passed 43 files / 1040 application tests, 2 E2E tests, 4
  Deno tests, 6 type-generation tests, 7 audio-configuration tests, and 5
  convention tests. The Cloudflare production build was green.
- Independent truth audit and cold review initially found wording that blurred
  normal table-read restrictions with the authenticated caller-bound
  `get_discogs_credentials` RPC, overstated Edge handler coverage, and treated
  remediation lines like deferred/positive audit observations. The amended
  commit narrowed each statement to the live source and was approved.

## Done criteria

- [x] README accurately names runners, test locations, prerequisites, and every
      final verification/maintenance command.
- [x] Discogs docs describe private credential storage/RPC access and explicit
      endpoint dispatch; no profile-token claim remains.
- [x] Enrichment docs describe final workflow/config/test ownership while
      preserving product safety decisions.
- [x] Security audit is preserved under `docs/archive` and unmistakably marked
      historical/completed.
- [x] Agent guides are byte-identical and contain concise enforceable rules.
- [x] Stale-claim search is empty; format, convention, and full verification
      pass.
- [x] No executable/config/package/migration file changed.

## STOP conditions

Stop and report if:

- A documented command/path does not exist after dependency plans.
- Live source contradicts a planned architecture claim.
- The two agent guides cannot remain byte-identical.
- Archiving/review would require reproducing a credential or environment value.
- Making documentation true requires any code/config change.
- A gate fails twice after one reasonable documentation-only correction.

## Maintenance notes

- README and maintained architecture docs are current truth; archived audits are
  decision history.
- Future credential/enrichment/tooling changes must update the maintained docs
  in the same implementation plan rather than accumulating another stale audit.
