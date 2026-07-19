# Contributing to Crate Guide

Thanks for considering a contribution. Crate Guide is a personal,
non-commercial proof of concept, so small, focused changes that are easy to
review and maintain are the best fit.

## Before changing code

- Search existing issues before opening a new one.
- Use an issue, or an existing project discussion if available, to propose a
  substantial feature, schema change, dependency change, or UX redesign before
  investing in implementation.
- For small bug fixes and documentation corrections, a focused pull request is
  welcome without a separate proposal.
- Keep each pull request scoped to one concern and avoid unrelated cleanup.

## Set up the project

Follow the prerequisites, environment setup, local Supabase ports, and run
commands in the [README](README.md). In brief:

```bash
npm install
cp .env.example .env
npx playwright-core install chromium
npm run dev:all
```

Use synthetic or personally controlled development data. Never commit `.env`
files, credentials, OAuth tokens, production exports, personal data, or private
record-cover URLs. Redact secrets and personal data from logs, screenshots,
fixtures, issues, and pull requests.

## Project conventions

- Name components with type-first PascalCase, such as
  `DialogRecordDetails.vue` and `CardRecordShort.vue`.
- Use Tailwind utility classes only; do not add `<style>` blocks or `@apply`.
- Keep application-specific UI behaviour in wrapper components outside the
  generated `app/components/ui` primitives.
- Respect the auto-registered `Icon`, `Notice`, and `Turntable` component
  prefixes configured in `nuxt.config.ts`.
- Add tests at the closest existing layer: colocated unit/store tests,
  `test/nuxt` runtime tests, `test/e2e` browser tests, Supabase SQL tests, or
  Edge Function tests as appropriate.
- Add database changes as new, forward-only migrations in
  `supabase/migrations`; do not rewrite migrations that may already have run.
- Keep local Supabase configuration and documentation within the reserved
  `42820-42829` port range.
- Let Prettier format Edge Functions along with the rest of the repository; do
  not run `deno fmt`.
- Use [Conventional Commits](https://www.conventionalcommits.org/), for example
  `fix(records): preserve private cover access`.

Repository-specific agent and tooling rules are summarised in
[`AGENTS.md`](AGENTS.md).

## Validate a change

Run focused tests while developing. Before handing off a pull request, run:

```bash
npm run format
npm run check:conventions
npm run verify
```

`npm run verify` is the comprehensive read-only gate and includes formatting,
linting, type checking, application and browser tests, Edge Function checks,
and convention tests. Run `npm run build` separately when the change affects
production generation or deployment behaviour.

Changes to schemas, RLS, RPCs, storage policies, or migrations must also pass
`npm run test:db` against a running local Supabase stack. For
deployment-affecting handoffs, run `npm run verify:full`; it combines the
read-only application gate, production build, and local database tests.

Every pull request also runs source-controlled GitHub Actions CI. The
application job runs `npm run verify` and the production build, while the
database job starts the tracked local Supabase stack and runs `npm run test:db`.
`npm run verify:full` is the nearest local equivalent and requires Docker plus a
running local Supabase stack.

## Pull request checklist

- [ ] The change is focused and its motivation and user impact are explained.
- [ ] Relevant tests were added or updated, or the reason none are needed is
      stated.
- [ ] `npm run format`, `npm run check:conventions`, and `npm run verify` pass.
- [ ] Database changes pass `npm run test:db`, and deployment-affecting changes
      pass `npm run verify:full`.
- [ ] Database, environment, deployment, and privacy implications are
      documented where relevant.
- [ ] No secrets, personal data, private URLs, or production data are included.
- [ ] User-facing changes include suitable desktop and mobile checks.

## Contribution licence

Crate Guide is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE). By submitting a
contribution, you agree that it may be distributed under that licence. No
separate Contributor Licence Agreement is currently required.

For a suspected vulnerability, follow [`SECURITY.md`](SECURITY.md) instead of
opening a public issue.
