# Crate Guide

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live Site](https://img.shields.io/badge/Live-crate.guide-green)](https://crate.guide)

Crate Guide is a vinyl record collection management application for DJs. It enables cataloging records, organizing crates for gigs, tracking DJ sessions, and discovering compatible tracks through BPM and musical key analysis for harmonic mixing.

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Nuxt 4 (SSR disabled), Vue 3 Composition API, TypeScript |
| Styling | Tailwind CSS v4, shadcn-vue (reka-ui) |
| State | Pinia |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| External APIs | Discogs |

### Project Structure

```
├── app/
│   ├── components/     # Vue components (auto-imported)
│   ├── composables/    # Vue composables
│   ├── layouts/        # Nuxt layouts
│   ├── pages/          # Route pages
│   ├── stores/         # Pinia stores
│   └── utils/          # Utility functions
├── server/api/         # Nitro API endpoints
├── shared/types/       # TypeScript definitions
└── supabase/
    ├── functions/      # Deno Edge Functions
    └── migrations/     # PostgreSQL migrations
```

### Data Model

| Entity | Description |
|--------|-------------|
| `profiles` | User preferences and Discogs OAuth credentials |
| `records` | Vinyl records with metadata (artists, labels, year, cover) |
| `tracks` | Individual tracks with BPM, key, duration, genres |
| `crates` | Named collections of records for organizing gigs |
| `sets` | DJ session history with played tracks and transitions |

## Features

- **Collection Management** — Create, edit, and delete records and tracks
- **Discogs Integration** — Import records from Discogs collection via OAuth 1.0
- **Crate Organization** — Group records into crates for specific gigs or sets
- **Track Discovery** — Filter and search tracks by BPM, key, genre, and artist
- **Harmonic Mixing** — Find compatible tracks based on BPM range and key relationships
- **Session Tracking** — Log played tracks and rate transitions

## Development

### Prerequisites

- Node.js 22.18.0
- npm 11.5.2
- Docker (for Supabase local development)
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd crate-guide

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with required API keys
```

Required environment variables:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
DISCOGS_CONSUMER_KEY=
DISCOGS_CONSUMER_SECRET=
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

### Database

```bash
# Generate TypeScript types from schema
npm run genTypes

# Reset local database (applies migrations + seed)
npm run supa:reset
```

### Code Quality

```bash
# Format with Prettier
npm run format

# Build for production
npm run build
```

## Edge Functions

Supabase Edge Functions handle Discogs OAuth flow:

| Function | Purpose |
|----------|---------|
| `get-discogs-request-token` | Initiate OAuth 1.0 flow |
| `get-discogs-access-token` | Exchange verifier for access token |
| `authenticated-discogs-request` | Proxy authenticated API requests |

## Documentation

Additional documentation is available in the [`docs/`](docs/) directory:

- [Development Setup](docs/DEVELOPMENT.md)
- [Discogs Integration](docs/discogs-integration.md)

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/description`)
3. Commit changes with clear messages
4. Push to your fork and open a pull request

## License

This project is licensed under the [MIT License](LICENSE).