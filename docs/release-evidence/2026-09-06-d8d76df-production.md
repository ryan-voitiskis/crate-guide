# Turntable and dependency production release

- Source commit: `d8d76dfd7950352d3255807bef9229028d69dc2d`.
- Source branch: `codex/turntable-strobe-release`.
- Cloudflare Pages project: `crate-guide`, production branch selector `main`.
- Deployment: `dd06a247-4053-43be-b898-30f3b2e29c4e`.
- Immutable URL: <https://dd06a247.crate-guide.pages.dev>.
- Production URL: <https://crate.guide>.
- Nuxt build ID: `255966e6-7b29-4198-84b5-dbb7d3b6af67`.
- Previous production deployment: `d6c4e58d-8ee3-4b89-9a95-4354fbf463ba`,
  source `0407e531d12e24a37b348c1b2bd4d2c8ab9ab8f5`.

The release preserves the already-deployed enrichment status-label hotfix,
which was ahead of `origin/main`. Direct Upload publishes the exact release
commit; it does not merge either branch or the existing hotfix pull request.
No database migrations, hosted secrets, or Edge Functions were deployed.

## Pre-deploy evidence

All gates passed from a clean detached worktree at the exact release commit:

- `npm ci`: reproducible install, zero reported vulnerabilities.
- `npm run audit:prod` and `npm run audit:all`: zero vulnerabilities on the
  upgraded graph; frozen Edge audit: nine packages, no advisories.
- `npm run verify:full`, with `BROWSER_LIBRARY_REQUIRE_FULL_MATRIX=1` and
  `LOCAL_AUDIO_CACHE_REQUIRE_TIMING_BUDGETS=0`.
- Application tests: 157 files, 2,462 tests passed.
- E2E tests: eight files, 22 passed, one skipped; Chromium, Firefox, and WebKit
  adapter/engine checks passed.
- Browser component tests: ten files, 81 tests passed.
- Edge tests: 146 passed; six frozen function imports validated.
- Local database: 13 pgTAP files, 463 assertions passed; generated schema types
  matched both tracked copies.
- Production build, browser security headers, and client bundle budget passed.

The first development-worktree E2E attempt ran before browser installation had
finished and failed on missing executables. The complete clean-worktree rerun
above ran after installation and passed without weakening the tests.

The final artifact was rebuilt using the public production Supabase configuration
read from the previously deployed page. Its backend matched production, with no
local, test, or staging runtime target.

## Post-deploy evidence

Both the immutable deployment and `crate.guide` returned HTTP 200 for `/`,
`/demo`, `/demo/tracks`, `/demo/records`, and `/demo/enrichment`. Each returned
the expected build ID, production backend configuration, valid source-controlled
security headers and inline-script hashes, and a successfully served JavaScript
entry point. Cloudflare's production listing reported the exact source commit.

The turntable was exercised in the in-app browser locally and in production,
including start/stop, 45 RPM, and positive pitch adjustment. At speed, the
unlit physical-dot layer faded out and the four strobe phases animated
independently. Both local and production stop verification confirmed that all
four strobe rows matched the physical platter rotation exactly. Production
coasted to `238.491202944698` degrees across all five layers after the 45 RPM /
+2% pitch check. Controls were restored to 33 RPM and zero pitch afterward.

Live demo route checks also confirmed track filtering (Floorplan returned four
of 24 tracks), six records rendering, and the enrichment source chooser loading.
The browser's captured error log was empty. These were read-only demo checks;
authenticated Discogs OAuth and production library writes were not exercised.

See [dependency compatibility boundaries](../dependency-refresh-2026-09-06.md)
for intentionally retained major release lines.
