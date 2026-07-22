# Client bundle budget

Crate Guide measures the emitted Cloudflare Pages browser assets after
`npm run build`. The gate follows Nuxt's semantic client manifest instead of
depending on content hashes, and it excludes source maps.

## 2026-07-22 baseline

The baseline was captured after the frontend hotspot decomposition and batched
track-enrichment client contract were present:

| Boundary                           | Raw bytes | Gzip bytes |                     CI limit |
| ---------------------------------- | --------: | ---------: | ---------------------------: |
| Initial client JavaScript          |   971,103 |    298,559 | 1,000,237 raw / 307,516 gzip |
| Largest ordinary lazy/shared chunk |   115,842 |     35,146 |    119,318 raw / 36,201 gzip |
| Local-audio Worker                 |     2,666 |      1,184 |          reported separately |
| Essentia WASM asset                | 2,506,385 |    781,545 |          reported separately |
| Initial CSS                        |   136,693 |     23,783 |          reported separately |

Each enforced limit is the measured value plus exactly 3%, rounded up to a
whole byte. The first gate records a stable boundary rather than claiming a
size reduction: Nuxt, Vue, Pinia, Supabase, form validation, sortable behavior,
and shared workbench code remain in the single client entry. Optional work
continues to load outside that entry:

- `utils/cloudWorkbenchRuntime.ts` and the Cloud repository adapter graph it
  owns form a semantic lazy boundary loaded only for Cloud workbench routes;
- the enrichment route is a semantic Nuxt lazy module;
- `music-metadata` format parsers remain dynamic modules;
- the local-audio Worker and Essentia WASM remain separately emitted assets.

The configuration in `shared/config/clientBundleBudget.json` names those
semantic modules and optional asset prefixes. The check fails if a named
boundary disappears or moves into initial JavaScript, even when its generated
hash changes.

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
