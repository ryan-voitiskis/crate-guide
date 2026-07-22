# Client bundle budget

Crate Guide measures the emitted Cloudflare Pages browser assets after
`npm run build`. The gate follows Nuxt's semantic client manifest instead of
depending on content hashes, and it excludes source maps.

## 2026-07-22 baseline

The baseline was recaptured after resumable device-local enrichment reviews
were present and their storage/format code had explicit deferred boundaries:

| Boundary                           | Raw bytes | Gzip bytes |                   CI limit |
| ---------------------------------- | --------: | ---------: | -------------------------: |
| Initial client JavaScript          |   943,332 |    293,763 | 971,632 raw / 302,576 gzip |
| Largest ordinary lazy/shared chunk |   146,966 |     42,964 |  151,375 raw / 44,253 gzip |
| Local-audio Worker                 |     2,666 |      1,184 |        reported separately |
| Essentia WASM asset                | 2,506,385 |    781,545 |        reported separately |
| Initial CSS                        |   139,448 |     24,178 |        reported separately |

Each enforced limit is the measured value plus exactly 3%, rounded up to a
whole byte. The first gate records a stable boundary rather than claiming a
size reduction: Nuxt, Vue, Pinia, Supabase, form validation, sortable behavior,
and shared workbench code remain in the single client entry. The largest
ordinary chunk is now the enrichment route after adding the resumable-review
controller and recovery UI. Optional work continues to load outside the entry:

These measured allowances are engineering regression defaults, not
maintainer-selected or maintainer-accepted product limits.

- `utils/cloudWorkbenchRuntime.ts` and the Cloud repository adapter graph it
  owns form a semantic lazy boundary loaded only for Cloud workbench routes;
- the enrichment route is a semantic Nuxt lazy module;
- the track-enrichment draft format, privacy scanner, and schema constants form
  a shared manual chunk rather than being hoisted into the initial entry;
- `repositories/library/browser/browserDeviceDraftRepository.ts` loads only
  when the enrichment route initializes device-local draft recovery;
- `music-metadata` format parsers remain dynamic modules;
- the local-audio Worker and Essentia WASM remain separately emitted assets.

The configuration in `shared/config/clientBundleBudget.json` names the semantic
dynamic modules and optional asset prefixes. The check fails if a named
boundary disappears or moves into initial JavaScript, even when its generated
hash changes. The lower initial-entry baseline also fails closed if the draft
format boundary is accidentally hoisted back into the entry. The Nuxt manifest
hook opts only declared optional assets out of browser prefetch; ordinary route
and shared-chunk prefetch remains available.

The initial client plugin checks `window.location.pathname` before deciding
whether to load the Cloud workbench runtime. During initial hydration,
`useRoute()` can still expose Nuxt's placeholder `/` route, which would
otherwise fetch Cloud-only code on a signed-out public page. The browser proof
resolves generated asset names through the semantic manifest, then records
successful responses across `/login`, the default workbench, enrichment, and a
real local-audio Worker/WASM interaction.

## Commands and interpretation

```bash
npm run build
npm run check:client-bundle-budget
```

The report prints the initial closure, largest ordinary chunk, separately
classified Worker/WASM/CSS assets, and named lazy modules. A failure identifies
the raw or gzip dimension, actual bytes, and exact limit.

When an intentional dependency or architecture change exceeds a limit, first
inspect the production manifest and exercise the affected route or Worker in a
real browser. Update the measured baseline and allowance only in the same
reviewed change; do not make the threshold a round number or hide initial code
under a Worker/WASM pattern.
