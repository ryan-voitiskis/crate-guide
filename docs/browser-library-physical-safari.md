# Browser library physical Safari evidence

- **Status:** macOS Safari repository smoke passed
- **Observed:** 2026-07-28
- **Tested commit:** `caf24d9`
- **Browser:** Safari `26.5.2`, AppleWebKit `605.1.15`
- **Origin:** local loopback Vite fixture
- **Remote services or user data:** none

This is dated evidence for the browser-library repository contract in Apple's
physical macOS Safari application. It supplements Playwright WebKit; it does not
turn WebKit automation into Safari proof or claim full application support.

## Reproduction

Run:

```bash
npm run probe:safari
```

Open the printed loopback URL in Safari and select
`Run physical Safari probe`. The checked-in runner opens one same-origin
secondary window, uses a randomly named disposable IndexedDB database, closes
all repository connections, deletes the database, and closes the secondary
window. It does not call Crate Guide, Supabase, Discogs, or another remote
service.

The same fixture is exercised automatically in Chromium by:

```bash
npx vitest run --project e2e \
  test/e2e/browser-library-safari-probe.e2e.test.ts
```

## Observed result

Safari displayed `PASS: physical Safari library probe completed.` with:

| Check                                        | Observed result                                           |
| -------------------------------------------- | --------------------------------------------------------- |
| IndexedDB availability                       | supported                                                 |
| Durable record/track/crate/preferences graph | exact read-back after close and page reload               |
| Managed cover Blob                           | complete `image/webp` read-back with exact text bytes     |
| Cross-window repository delivery             | 2 repository events observed                              |
| Stale secondary write                        | rejected with `revision-mismatch`, then recovered         |
| Post-recovery write                          | committed with coherent graph/preferences                 |
| Web Locks                                    | supported                                                 |
| Deliberately aborted schema upgrade          | `AbortError`; upgrade began and did not commit            |
| Database version after aborted upgrade       | `2`                                                       |
| `navigator.storage.persisted()`              | `false`; diagnostic only and not treated as write failure |

## Evidence boundary

This probe proves the named repository behaviors only. It is not:

- an authenticated production-app smoke;
- evidence for iPhone or iPad Safari;
- a quota, private-browsing, site-data-clear, or browser-eviction matrix;
- hosted Cloudflare/Supabase/Discogs evidence; or
- permission to claim every Crate Guide workflow is supported in Safari.

Physical iOS Safari and broader authenticated application flows remain separate
release evidence.
