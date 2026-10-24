# Time-limited node-forge audit exception

The owner approved this exact, 30-day exception on 24 October 2026. It is active only for the advisory and locked dependency chain below. The normal high-severity gate continues to block every other unapproved finding.

The one remaining root advisory is [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), affecting RSA PKCS#1 v1.5 signature verification in node-forge through 1.4.0. The npm registry still publishes 1.4.0 as latest, and the [upstream repair](https://github.com/digitalbazaar/forge/pull/1152) is unmerged as of 24 October 2026. Vendoring an unreviewed cryptography fork or downgrading Nuxt would add maintenance and compatibility risk.

The installed chain is `nuxt@4.6.2 → @nuxt/nitro-server@4.6.2 → nitropack@2.13.5 → listhen@1.10.1 → node-forge@1.4.0`. Listhen is node-forge's only direct consumer. Its uses create development certificates or load developer-supplied PEM/PFX files. The product does not expose those inputs. This remains an affected package on development/build hosts; it is not patched by the approved exception.

Nuxt builds an SPA and a Cloudflare Pages Worker. A production build on Node 24.18.1 passed guards over 1,215 rendered client modules, the additional client worker chunks, and 196 rendered server modules. Neither listhen nor node-forge entered those bundles. `scripts/production-dependency-guard.mjs` now rejects either package in rendered modules or static/dynamic external imports for both targets. Tests cover ordinary, Windows, pnpm, virtual and external module identifiers. This guard remains required for future builds.

The approved exception is limited to that exact advisory, node-forge version 1.4.0, and its sole listhen 1.10.1 consumer. It expires on **23 November 2026** and names the repository owner as accountable. It must fail closed on expiry, a changed version/consumer, malformed audit output, or any other unsuppressed high/critical advisory. Transitive duplicate reports may be attributed to this single root; other roots remain blocking. The active policy is `security/npm-audit-suppressions.json`; its exact locked versions, sole-consumer chain and package integrity are checked on every audit.

The audit implementation and CI test those failure cases, and the final exact commit must pass the full application/build/database gates before merge. Remove the exception when a compatible upstream patch is available. This exception does not change production access or replace the release checks.
