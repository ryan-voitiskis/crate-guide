# Time-limited picomatch audit exception

> **Resolved 23 November 2026.** GitHub withdrew [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) on 18 November 2026, so npm audit no longer reports it and the audit script rejected the unused exception. The exception was removed from `security/npm-audit-suppressions.json`. No picomatch upgrade was involved. The production dependency guard still rejects picomatch. This page is historical.

The owner approved this 30-day exception on 18 November 2026 during the dependency refresh. It covers only [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), a regular-expression denial of service through single-branch repeated extglobs. Every published picomatch release through 4.0.7 is affected, and the advisory lists no patched version as of 18 November 2026.

Picomatch has many build-time consumers rather than one chain: Nuxt, Nitro (`@rollup/plugin-commonjs`, `@vercel/nft`, `globby`/`micromatch`, `unimport`, `unplugin`), Vite and `tinyglobby`, `vue-router`'s route-file tooling, `vue-tsc`, `@nuxt/devtools`/`unstorage`, ESLint and Vitest. Each matches glob patterns written in this repository's configuration or by those tools; the product never passes user input to it.

`scripts/production-dependency-guard.mjs` rejects picomatch, together with node-forge and listhen, in rendered modules and static/dynamic imports of both the client and the Cloudflare Pages Worker build. A production build on Node 24.18 after this refresh passed the guard over 1,216 rendered client modules and 193 Worker modules.

The exception is recorded in `security/npm-audit-suppressions.json` with `scope: "build-only"`. Instead of one consumer chain, it pins every locked picomatch installation by path, version, integrity and registry source. The audit fails closed when an installation is added, removed, moved or changed; when the package is no longer guarded out of production bundles; on malformed audit output; on expiry (**18 December 2026**); or on any other unsuppressed high/critical advisory. Remove the exception as soon as a patched picomatch reaches the lockfile.

The previous [node-forge exception](node-forge-reachability.md) was removed in the same refresh because node-forge 1.4.3 fixes every listed advisory.
