# Crate Guide

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Live Site](https://img.shields.io/badge/Live-crate.guide-green)](https://crate.guide)

A DJ-focused vinyl record collection manager with real-time session mixing, harmonic track discovery, and turntable simulation. Import from Discogs, organize crates, and mix with BPM and key-aware suggestions.

## Features

- **Session Mixing** — Two-deck mixing interface with pitch faders, track suggestions, and transition history
- **Turntable Simulation** — SL-1200 style deck with animated platter, tonearm, and RPM controls
- **Collection Management** — Catalog records and tracks with detailed metadata
- **Discogs Integration** — Import records from your Discogs collection via OAuth 1.0
- **BPM & Key** — Reuse Rekordbox XML or analyze local audio in the browser,
  then match and stage missing BPM/key values for review
- **Crate Organization** — Color-coded crates for organizing gigs and sets
- **Harmonic Mixing** — Find compatible tracks by BPM range and Camelot key relationships
- **Track Discovery** — Filter and search by BPM, key, genre, artist, and more
- **Session Tracking** — Log played tracks, rate transitions, and save set history
- **Demo Mode** — Try the full app without creating an account

## Architecture

### Tech Stack

| Layer         | Technology                                             |
| ------------- | ------------------------------------------------------ |
| Frontend      | Nuxt 4 (SPA), Vue 3 Composition API, TypeScript        |
| Styling       | Tailwind CSS v4, shadcn-vue (reka-ui)                  |
| State         | Pinia                                                  |
| Backend       | Supabase (PostgreSQL, Auth, Deno Edge Functions)       |
| Testing       | Vitest projects, Nuxt Test Utils, `playwright-core`    |
| External APIs | Discogs                                                |
| Audio         | Essentia.js, music-metadata, Web Audio API, Web Worker |

### Project Structure

```
├── app/
│   ├── components/     # Vue components (auto-imported)
│   │   ├── session/    # Deck mixing UI (suggestions, faders, history)
│   │   ├── turntable/  # SL-1200 simulation (platter, tonearm, controls)
│   │   ├── tracks/     # Track list, filters, editing
│   │   ├── records/    # Record cards, details, editing
│   │   ├── crates/     # Crate management
│   │   ├── import/     # Collection import dialogs
│   │   ├── icons/      # Icon components (auto-prefixed)
│   │   ├── notices/    # Notice components (auto-prefixed)
│   │   ├── ui/         # shadcn-vue primitives
│   │   └── ...
│   ├── composables/    # Vue composables and colocated store-project tests
│   ├── layouts/        # Nuxt layouts
│   ├── middleware/     # Route middleware (auth)
│   ├── pages/          # Route pages (+ demo/ routes)
│   ├── stores/         # Pinia stores and colocated store-project tests
│   └── utils/          # Pure utilities and colocated unit tests
├── server/             # Nitro routes/utilities; configured server test project
├── shared/             # Shared types, analyzer config, and unit tests
├── test/
│   ├── e2e/            # Nuxt Test Utils browser E2E tests
│   ├── mocks/          # Shared test doubles and fixtures
│   └── nuxt/           # Nuxt runtime/component tests
├── scripts/            # Development and maintenance scripts/tests
└── supabase/
    ├── functions/      # Deno Edge Functions and Deno tests
    └── migrations/     # PostgreSQL migrations
```

### Data Model

| Entity                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `profiles`            | User preferences, turntable settings, and public Discogs identity |
| `discogs_credentials` | Private OAuth credentials accessed through identity-bound RPCs    |
| `records`             | Vinyl records with metadata (artists, labels, year, cover)        |
| `tracks`              | Tracks with BPM, key, duration, genres, RPM, Beatport metadata    |
| `crates`              | Color-coded record collections with descriptions                  |
| `sets`                | DJ session history with played tracks and transition ratings      |

## Development

### Prerequisites

- Node.js 24.12.0
- npm 11.6.2
- Deno 2.x (for Edge Function checks and tests)
- Docker (for Supabase local development)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Environment Setup

```bash
git clone <repository-url>
cd crate-guide
npm install
cp .env.example .env

# One-time browser download for Nuxt Test Utils E2E tests
npx playwright-core install chromium
```

Root `.env` — Supabase connection:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=
SITE_URL=http://localhost:3000
```

`supabase/functions/.env` — Discogs OAuth (for Edge Functions):

```
DISCOGS_CONSUMER_KEY=
DISCOGS_CONSUMER_SECRET=
DISCOGS_USER_AGENT=CrateGuide/2.0
SITE_URL=http://localhost:3000
```

### Running Locally

```bash
# Full environment (Nuxt + Supabase local stack)
npm run dev:all

# Nuxt only (requires external Supabase)
npm run dev

# Supabase services only
npm run supa:start
npm run supa:stop
```

### Testing

Vitest is the single application test runner. Its projects separate pure unit
tests (`app/utils` and `shared`), Pinia/composable/middleware tests, a configured
Nitro server project (currently with no test files), Nuxt runtime tests
(`test/nuxt`), and browser E2E tests (`test/e2e`). The E2E project uses Nuxt
Test Utils backed by `playwright-core`; there is no separate Playwright Test
suite.

```bash
# Unit + store/composable + server + Nuxt runtime tests (watch mode)
npm test

# The same four projects, once
npm run test:run

# Pure unit project only
npm run test:unit

# Nuxt runtime project only
npm run test:nuxt

# Nuxt Test Utils browser E2E project
npm run test:e2e

# Deno Edge Function type-check, lint, and tests
npm run check:edge
npm run lint:edge
npm run test:edge
```

### Code Quality

```bash
npm run format               # Write Prettier formatting
npm run format:check         # Check formatting without writes
npm run lint                 # ESLint
npm run lint:fix             # ESLint with auto-fix
npm run typecheck            # Nuxt/TypeScript checking
npm run check:conventions    # Component naming and Tailwind boundaries
npm run test:typegen-script  # Failure/rollback tests for genTypes
npm run test:audio-config    # Shared analyzer/benchmark config tests
npm run test:conventions     # Convention checker tests
npm run verify               # Comprehensive read-only verification gate
npm run build                # Production build (separate from verify)
```

`npm run verify` runs formatting, lint, type checking, all application and E2E
tests, all three Edge gates, and the maintenance/convention tests above. It is
read-only; run `npm run format` separately when files need formatting. A
production build is also a separate release check.

### Database

```bash
# Generate TypeScript types (requires the CLI and a running local Supabase stack)
npm run genTypes

# Reset local database (applies migrations + seed)
npm run supa:reset
```

`npm run genTypes` validates and Prettier-formats generated output before
replacing the intentional byte-identical copies at `shared/types/database.ts`
and `supabase/functions/_shared/types/database.ts`. The application and Deno
Edge Function module trees consume their respective copies. Any failure before
replacement leaves both files unchanged; a partial replacement restores both
prior states and reports if restoration cannot complete.

## Edge Functions

Supabase Edge Functions handle Discogs OAuth flow:

| Function                        | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `get-discogs-request-token`     | Initiate OAuth 1.0 flow              |
| `get-discogs-access-token`      | Exchange verifier for access token   |
| `authenticated-discogs-request` | Dispatch allowed authenticated reads |

## Documentation

Additional documentation in [`docs/`](docs/):

- [Discogs Integration](docs/discogs-integration.md)
- [Track Enrichment](docs/track-enrichment.md)

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/description`)
3. Commit changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push to your fork and open a pull request

## License

Crate Guide is a personal, non-commercial project maintained for fun and
intended to remain open source. It is licensed under the
[GNU Affero General Public License v3.0](LICENSE). Network users must be offered
the corresponding source for modified versions.

See [Third-Party Notices](THIRD_PARTY_NOTICES.md) for dependency attribution.
