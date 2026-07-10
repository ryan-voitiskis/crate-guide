# Crate Guide

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live Site](https://img.shields.io/badge/Live-crate.guide-green)](https://crate.guide)

A DJ-focused vinyl record collection manager with real-time session mixing, harmonic track discovery, and turntable simulation. Import from Discogs, organize crates, and mix with BPM and key-aware suggestions.

## Features

- **Session Mixing** — Two-deck mixing interface with pitch faders, track suggestions, and transition history
- **Turntable Simulation** — SL-1200 style deck with animated platter, tonearm, and RPM controls
- **Collection Management** — Catalog records and tracks with detailed metadata
- **Discogs Integration** — Import records from your Discogs collection via OAuth 1.0
- **BPM & Key** — Match rekordbox XML exports to collection tracks and stage
  missing BPM/key values for review
- **Crate Organization** — Color-coded crates for organizing gigs and sets
- **Harmonic Mixing** — Find compatible tracks by BPM range and Camelot key relationships
- **Track Discovery** — Filter and search by BPM, key, genre, artist, and more
- **Session Tracking** — Log played tracks, rate transitions, and save set history
- **Demo Mode** — Try the full app without creating an account

## Architecture

### Tech Stack

| Layer         | Technology                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | Nuxt 4 (SPA), Vue 3 Composition API, TypeScript |
| Styling       | Tailwind CSS v4, shadcn-vue (reka-ui)           |
| State         | Pinia                                           |
| Backend       | Supabase (PostgreSQL, Auth, Edge Functions)     |
| Testing       | Vitest (unit + store), Playwright (e2e)         |
| External APIs | Discogs                                         |

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
│   ├── composables/    # Vue composables
│   ├── layouts/        # Nuxt layouts
│   ├── middleware/      # Route middleware (auth)
│   ├── pages/          # Route pages (+ demo/ routes)
│   ├── stores/         # Pinia stores
│   └── utils/          # Utility functions
├── server/api/         # Nitro API endpoints
├── shared/types/       # TypeScript definitions
├── test/               # Unit, store, and e2e tests
├── scripts/            # Dev scripts
└── supabase/
    ├── functions/      # Deno Edge Functions
    └── migrations/     # PostgreSQL migrations
```

### Data Model

| Entity     | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `profiles` | User preferences, theme, key format, turntable settings, OAuth |
| `records`  | Vinyl records with metadata (artists, labels, year, cover)     |
| `tracks`   | Tracks with BPM, key, duration, genres, RPM, Beatport metadata |
| `crates`   | Color-coded record collections with descriptions               |
| `sets`     | DJ session history with played tracks and transition ratings   |

## Development

### Prerequisites

- Node.js 24.12.0
- npm 11.6.2
- Docker (for Supabase local development)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Environment Setup

```bash
git clone <repository-url>
cd crate-guide
npm install
cp .env.example .env
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

```bash
# Unit + store tests (watch mode)
npm test

# Unit + store tests (single run)
npm run test:run

# Unit tests only
npm run test:unit

# E2E tests (Playwright)
npm run test:e2e
```

### Code Quality

```bash
npm run format      # Prettier
npm run lint        # ESLint
npm run lint:fix    # ESLint with auto-fix
npm run typecheck   # TypeScript checking
npm run build       # Production build
```

### Database

```bash
# Generate TypeScript types from schema
npm run genTypes

# Reset local database (applies migrations + seed)
npm run supa:reset
```

## Edge Functions

Supabase Edge Functions handle Discogs OAuth flow:

| Function                        | Purpose                            |
| ------------------------------- | ---------------------------------- |
| `get-discogs-request-token`     | Initiate OAuth 1.0 flow            |
| `get-discogs-access-token`      | Exchange verifier for access token |
| `authenticated-discogs-request` | Proxy authenticated API requests   |

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

[MIT License](LICENSE)
