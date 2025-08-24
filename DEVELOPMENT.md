# Development Setup Guide

This guide explains how to set up and work with the Crate Guide development environment.

## Overview

Crate Guide uses:

- **Nuxt 4** - Frontend framework
- **Supabase** - Backend as a Service (database, auth, storage, functions)
- **TypeScript** - Type safety
- **Tailwind CSS + Shadcn/ui** - Styling
- **Discogs API** - Music data integration

## Quick Start

1. **Clone and install dependencies:**

   ```bash
   git clone <repository-url>
   cd crate-guide
   npm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys
   ```

3. **Start the full development environment:**
   ```bash
   npm run dev:full
   ```

This will start:

- Supabase local services (database, auth, storage, etc.)
- Edge Functions runtime
- Nuxt development server

## Environment Management

### Local Development

- Uses Supabase local development stack
- All data stays on your machine
- No external API calls to Supabase cloud
- Perfect for offline development

### Staging

- Uses live Supabase project: `luhufzpayswbgewenudn`
- Copy `.env.staging` to `.env` when testing staging
- Useful for testing integrations and deployments

## Supabase Services

### Managing Supabase Services

```bash
# Check status
supabase status

# Stop all services
npm run supabase:stop

# Start all services
npm run supabase:start

# Restart services
npm run supabase:restart

# Start only functions (if main services already running)
npm run supabase:functions

# Reset database (careful: destroys local data)
npm run supabase:reset

# Deploy supabase functions to staging
npm run supabase:functions:deploy --project-ref luhufzpayswbgewenudn
```

## Database Management

### Generate TypeScript Types

After making database changes:

```bash
# For local development
npm run genTypes

# For staging types
npm run genStagingTypes
```

### Migrations

```bash
# Create a new migration
supabase migration new your_migration_name

# Apply migrations locally
supabase db reset

# Push migrations to staging
supabase db push --project-ref luhufzpayswbgewenudn
```

## Troubleshooting

### Supabase Won't Start

```bash
# Check Docker status
docker ps | grep supabase

# Stop everything and restart
docker stop $(docker ps -q --filter name=supabase)
supabase start
```

### Functions Not Working

```bash
# Make sure functions runtime is running
supabase functions serve

# Check function logs
supabase functions logs
```

### Database Issues

```bash
# Reset local database
supabase db reset

# Check database connection
supabase db diff
```

### Port Conflicts

If you get port conflicts, check what's running:

```bash
# Check common ports
lsof -i :3000  # Nuxt
lsof -i :54321 # Supabase API
lsof -i :54322 # Supabase DB
lsof -i :54323 # Supabase Studio
```

## Best Practices

1. **Always use `npm run dev`** for development to ensure all services are running
2. **Stop Supabase when not developing** to free up resources: `npm run supabase:stop`
3. **Use local environment for development** to avoid affecting shared staging data
4. **Generate types after schema changes** to maintain type safety
5. **Test functions locally** before deploying to staging
6. **Keep environment files secure** and never commit actual API keys

## Additional Resources

- [Supabase Local Development](https://supabase.com/docs/guides/cli/local-development)
- [Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [Nuxt 3 Documentation](https://nuxt.com/)
- [Discogs API Documentation](https://www.discogs.com/developers/)
