# Plan portfolio implementation evidence

This ledger records the implementation pass for Plans 044-076 from baseline
`0a0cda6`. It distinguishes repository completion from hosted rollout, provider
approval, and product-launch evidence. No deployment, provider configuration,
or production data mutation was authorized or performed during this pass.

## Status meaning

- `DONE`: the plan's repository implementation and required local gates are
  complete. Any non-blocking hosted smoke still appears in the external evidence
  section below.
- `BLOCKED`: a named STOP condition, approval, or upstream product gate prevents
  the remaining work. Partial implementation is retained only where it is safe
  and independently useful.
- `DEFERRED`: the maintainer intentionally removed the remaining product work
  from the current delivery scope. Existing STOPs and dependencies remain intact.

The current repository result is 27 `DONE` plans, 2 `BLOCKED` plans, and 4
`DEFERRED` plans. The maintainer accepted Plan 063's engineering defaults on
2026-07-28. Plans 071-073 and 076 were deferred the same day; Discogs acquisition
remains core, so a degraded signed-out mode without it is not the target.

## Portfolio status

| Plan |  Status  | Representative implementation evidence                                                                                                                                       | Remaining boundary                                                                                                                                                    |
| ---: | :------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  044 |   DONE   | `aa4e856` reconciles record writes, fetch publication, and derived search with deferred-race coverage.                                                                       | None.                                                                                                                                                                 |
|  045 |   DONE   | `6315eab` makes BPM/key parsing and matching semantics exact and order-independent.                                                                                          | None.                                                                                                                                                                 |
|  046 |   DONE   | `a69a6f6` guards cold settings hydration and all four late dialog completions.                                                                                               | None.                                                                                                                                                                 |
|  047 |   DONE   | `c492e2e` and `45a08c8` add authoritative record removal, privileges, integrity tests, and client alignment.                                                                 | Hosted migration rollout remains operational evidence, not repository work.                                                                                           |
|  048 |   DONE   | `16731fb` and `824e799` preserve saved-set rows, legacy history, target BPM, and source-deck provenance.                                                                     | Hosted migrated-schema smoke remains operational evidence.                                                                                                            |
|  049 |   DONE   | `891014c` makes OAuth identity finalization resumable, owner-bound, quota-accounted, and avatar-tolerant.                                                                    | A live provider/hosted OAuth smoke was not performed.                                                                                                                 |
|  050 |   DONE   | `ddadda4` and `4a99163` bound durable cleanup, cover jobs, quota pruning, and paged cleanup smoke.                                                                           | Scheduler/deployment operation was not authorized.                                                                                                                    |
|  051 |   DONE   | `f75ac03` and `68c5460` harden local orchestration, config validation, staging target checks, and frozen Edge imports.                                                       | The remote-secret wrapper remains safely disabled until `deployment/staging-project.json` supplies authoritative staging identity.                                    |
|  052 |   DONE   | `4abf53f` makes schema types, E2E errors, conventions, docs, actions, and dependency checks source-truthful.                                                                 | None.                                                                                                                                                                 |
|  053 |   DONE   | `1147365`, `61027d0`, and `5e9e781` enforce deterministic bundle budgets, defer review storage/format code, and prove lazy browser request ordering.                         | None.                                                                                                                                                                 |
|  054 |   DONE   | `13e9315` extracts record/cover coordination and application UI wrappers without changing persistence order.                                                                 | None.                                                                                                                                                                 |
|  055 |   DONE   | `61cb1d8` and `fdf683d` decompose hotspots and retain checked-in 10k behavior characterization.                                                                              | None.                                                                                                                                                                 |
|  056 |   DONE   | `6da1d95` makes benchmark configuration, manifests, comparison, routing, and child processes executable under test.                                                          | None.                                                                                                                                                                 |
|  057 |   DONE   | `e477e5f` binds deletion authorization and every late completion to the initiating account/dialog generation.                                                                | Hosted deletion smoke was not performed.                                                                                                                              |
|  058 |   DONE   | `ac99b0b` enforces conservative decode-memory envelopes and honest recoverable oversized-file states.                                                                        | None.                                                                                                                                                                 |
|  059 |   DONE   | `347d849` centralizes strict site-origin parsing across browser-facing Edge functions.                                                                                       | Hosted environment-value smoke was not performed.                                                                                                                     |
|  060 |   DONE   | `e477e5f` prevents older reads and failed-write recovery from overwriting newer profile writes.                                                                              | None.                                                                                                                                                                 |
|  061 |   DONE   | `f3fd9b1` owns Discogs folder reviews and transfer snapshots by exact account/request generation.                                                                            | None.                                                                                                                                                                 |
|  062 |   DONE   | `9f7c630` and `87b7671` add production response policies plus negative broadening and local-build checks.                                                                    | The documented read-only Cloudflare response smoke remains hosted evidence.                                                                                           |
|  063 |   DONE   | `45528bd` virtualizes the named surfaces and records passing 1k/10k structural evidence; the maintainer accepted the checked-in engineering defaults on 2026-07-28.          | None.                                                                                                                                                                 |
|  064 |   DONE   | `cb5f764` and `a3e9966` add bounded batch persistence, fill-only/CAS enforcement, idempotency, and partial-result mapping.                                                   | Hosted migrated-RPC/runtime smoke was not performed.                                                                                                                  |
|  065 |   DONE   | `52afbc5` and `db41f06` move bounded XML parsing to a cancellable Worker with golden and security coverage.                                                                  | None.                                                                                                                                                                 |
|  066 |   DONE   | `5c2aa4f`, `279fe77`, and `68309c2` bound cache connections/pruning and Worker residency.                                                                                    | None.                                                                                                                                                                 |
|  067 |   DONE   | `99e457a` extracts pure snapshot validation and one characterized import/retry lifecycle runner.                                                                             | None.                                                                                                                                                                 |
|  068 |   DONE   | `bedc111` through `b774c15` separate domain, repository, runtime, storage, and identity ownership with cloud/demo parity.                                                    | None.                                                                                                                                                                 |
|  069 |   DONE   | `8687bfa`, `ca894e0`, `18d0434`, `a7a57f6`, and `f8612c5` implement and exercise the atomic browser repository across Chromium, Firefox, and WebKit.                         | Physical macOS/iOS Safari support remains unclaimed pending the documented manual/provider matrix.                                                                    |
|  070 | BLOCKED  | `f94e7fd` and `3703fe8` add coherent cloud snapshot foundations and bounded archive planning.                                                                                | `docs/decisions/discogs-data-portability.md` keeps schema freeze at STOP until provider/legal/maintainer acceptance of storage, export, attribution, and eligibility. |
|  071 | DEFERRED | `cfe34a8`, `3f4af98`, `33fa114`, and `ebea2ba` define startup, safety, and truthful status behavior.                                                                         | Maintainer deferred signed-out Local launch on 2026-07-28. Discogs acquisition remains core; do not ship a degraded Local-only substitute.                            |
|  072 | DEFERRED | `3b14281` and `c6bcbd8` define safe empty-destination and copy-lifecycle policy.                                                                                             | Deferred with Plan 071 because no Local source product is launching in the current scope.                                                                             |
|  073 | DEFERRED | `b4bc817` and `9fa59bc` make Discogs transformation and destination repository-neutral for cloud or browser libraries.                                                       | Accountless Discogs was deferred; its provider, legal, abuse, credential, retention, eligibility, and attribution STOPs remain intact.                                |
|  074 |   DONE   | `3517bea`, `db54410`, `2e8a206`, `e396003`, and `b40d847` deliver sanitized drafts, rematch recovery, atomic leases, truthful recovery UX, and ordered partial outcomes.     | None after the final integrated gate recorded below.                                                                                                                  |
|  075 | BLOCKED  | `babf06d`, `dde4612`, `a6517c0`, `f86b08f`, `56d2e02`, and `ee7faf7` deliver the v2 reader, Evidence lens/inspector, agreement policy, and inert evidence-only draft intent. | Plan 070 archive compatibility and an atomic cloud/browser Evidence writer must close before evidence-only UI/write activation.                                       |
|  076 | DEFERRED | `a9adab6` defines the versioned app-shell cache allowlist/denylist and threat boundary.                                                                                      | Deferred with Plan 071; service-worker/update work and hosted verification remain unstarted.                                                                          |

## External and approval evidence still required

1. The copy-ready `docs/decisions/discogs-provider-inquiry.md` is deferred and
   unsent. It remains required before freezing Plan 070's useful universal
   archive schema, completing Plan 075 archive compatibility, or resuming Plan 073.
2. Supply the authoritative staging project record before using the Plan 051
   remote-secret wrapper.
3. Run the documented hosted Supabase/Discogs/Cloudflare smokes only after a
   separately authorized deployment or provider mutation.
4. Run the physical Safari matrix before making macOS/iOS Safari support claims.

## Integrated verification

At code head `2814207` (the subsequent closeout changes plan Markdown only), the
integrated gate produced this final evidence:

- `npm run verify:full` passed formatting, ESLint, Vue/TypeScript, convention,
  Tailwind, documentation, dependency, Edge-import, generated-type, security,
  build, bundle, and migrated-schema checks.
- The unit/store/server/Nuxt run passed 156 files and 2,423 tests.
- The production E2E run passed 7 files and 20 tests, with 1 explicitly opt-in
  test skipped; the Vitest Browser run passed 10 files and 81 tests.
- Deno passed all 141 Edge tests. Local Supabase pgTAP passed 12 files and 425
  tests.
- The production Cloudflare Pages build passed response-policy inspection. Its
  measured initial JavaScript is 943,332 raw / 293,763 gzip bytes, and its
  largest ordinary lazy chunk is 146,966 raw / 42,964 gzip bytes, both within
  their exact 3% limits.
- The forced actual-adapter matrix passed 3/3 multi-page scenarios in Chromium,
  Firefox, and persistent-profile WebKit.

No hosted deployment, provider mutation, live OAuth, production database, or
physical Safari claim is represented by these local results.
