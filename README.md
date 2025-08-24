# Crate Guide

Live site: [https://crate.guide](https://crate.guide)

Crate Guide is a DJ app for finding compatible tracks within your vinyl record collection.

## v2

I have started working on a version 2. The current MongoDB / Express backend will not support future features I would like to build. I have also changed my opinion on document databases since choosing MongoDB.

I am also investigating options for getting basic audio features like BPM and Key for tracks without using the Spotify API. I was unable to have Crate Guide approved by Spotify because you might play a vinyl record whilst using the app which counts as playback from other sources.

## Development Setup

### Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your Discogs API keys
   ```

3. **Start the full development environment:**
   ```bash
   npm run dev:full
   ```

This will start Supabase local services, Edge Functions, and the Nuxt development server.

### Development Commands

- `npm run dev:full` - Start complete development environment
- `npm run dev` - Start only Nuxt dev server
- `npm run supabase:start` - Start Supabase services
- `npm run supabase:stop` - Stop Supabase services
- `npm run supabase:functions` - Start Edge Functions only

### Architecture

- **Frontend**: Nuxt 4 with TypeScript, Tailwind CSS, Shadcn/ui
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **APIs**: Discogs for music data, OpenAI for AI features

### Local vs Staging

- **Local development**: Uses Supabase local stack (all data stays on your machine)
- **Staging**: Uses live Supabase project for testing deployments

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed setup instructions.

## License

This project is licensed under the MIT License.

## Contributions

Crate Guide is an open source project, talk to me, open an issue, submit a PR or fork it.

## Author

Ryan Voitiskis.

[ryanvoitiskis.com](https://ryanvoitiskis.com) | [ryanvoitiskis@protonmail.com](mailto:ryanvoitiskis@protonmail.com) | [GitHub](https://github.com/ryan-voitiskis)
