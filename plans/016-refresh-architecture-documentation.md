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

## Done criteria

- [ ] README accurately names runners, test locations, prerequisites, and every
      final verification/maintenance command.
- [ ] Discogs docs describe private credential storage/RPC access and explicit
      endpoint dispatch; no profile-token claim remains.
- [ ] Enrichment docs describe final workflow/config/test ownership while
      preserving product safety decisions.
- [ ] Security audit is preserved under `docs/archive` and unmistakably marked
      historical/completed.
- [ ] Agent guides are byte-identical and contain concise enforceable rules.
- [ ] Stale-claim search is empty; format, convention, and full verification
      pass.
- [ ] No executable/config/package/migration file changed.

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
