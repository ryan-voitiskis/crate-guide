# September 2026 dependency refresh

The turntable release refreshes the npm application and development dependency
graph, including Nuxt 4.5.2, Vue 3.5.42, Pinia 4.0.3, TypeScript 6.0.3,
Playwright 1.63.0, Supabase CLI 2.116.0, and Wrangler 4.129.0. The Vue override
remains aligned with the direct dependency. Pinia's devtools peer is explicit.
Existing application APIs, database migrations, and deployed Edge Function
dependencies are unchanged.

The lockfile refresh resolves the reported nanoid, js-yaml, and undici advisories.
Do not use forced peer resolution or audit suppressions to reproduce this install.

## Compatibility boundaries

Every direct npm dependency is at the latest stable release available during the
refresh, except these intentionally retained compatible release lines:

- `@tanstack/vue-table` 8.21.3: version 9 changes the Vue hook, required feature
  configuration, sorting APIs, and pinning terminology. It needs a separate table
  migration, not a dependency-only update. See the
  [Vue migration guide](https://tanstack.com/table/latest/docs/framework/vue/guide/migrating).
- `vitest` and `@vitest/browser-playwright` 4.1.11: `@nuxt/test-utils` 4.2.0
  declares `vitest: ^4.0.2`; version 5 is outside that supported peer range.
- `zod` 3.25.76: `@vee-validate/zod` 4.15.1 declares `zod: ^3.24.0`.
- `typescript` 6.0.3: TypeScript 7 does not provide the compiler API required by
  Vue's template tooling. See Microsoft's
  [TypeScript 7 compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

Pinia 4's ESM-only packaging fits this ESM application; its required
`@vue/devtools-api` peer is installed directly. See the
[Pinia 4 release notes](https://github.com/vuejs/pinia/releases/tag/v4.0.0).

## Revalidation

Use a clean `npm ci`, then run the npm production/full and frozen Edge audits,
`npm run verify:full`, and the Chromium/Firefox/WebKit browser matrix. Build the
release in a clean worktree with the production public Supabase configuration;
never let a developer's ignored `.env` select a production build's backend.

The frozen Edge SDK remains on its separately reviewed deployment lockfile;
`npm run audit:edge` covers that graph without changing or deploying Functions.
