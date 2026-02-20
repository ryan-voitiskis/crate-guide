# Architecture Analysis - Crate Guide

## Executive Summary

Crate Guide is a well-architected Nuxt 4 SPA for DJ vinyl record management. The codebase demonstrates strong patterns around Vue 3 Composition API, Pinia state management, and Supabase integration. This document captures the architectural strengths and areas for improvement.

## Stack Overview

| Layer         | Technology                            | Notes                                     |
| ------------- | ------------------------------------- | ----------------------------------------- |
| Framework     | Nuxt 4 (SSR disabled)                 | SPA mode appropriate for real-time DJ app |
| UI            | Vue 3 Composition API                 | Modern patterns throughout                |
| State         | Pinia (12 stores)                     | Consistent composition API style          |
| Styling       | Tailwind CSS v4 + shadcn-vue          | Design tokens, reka-ui components         |
| Backend       | Supabase                              | PostgreSQL, Auth, Edge Functions          |
| External APIs | Discogs OAuth 1.0, Beatport (scraped) | Third-party integrations                  |

## Directory Structure

```
app/
├── components/     # 184 Vue components (auto-imported, type-prefixed)
├── composables/    # 6 composables (useDiscogsApi, useUserData, etc.)
├── stores/         # 12 Pinia stores (domain + UI state)
├── middleware/     # Global auth guard
├── pages/          # 17 route pages
├── utils/          # Utility functions + Zod schemas
└── layouts/        # Single default layout

server/api/         # Nitro API endpoints (Beatport proxy)
supabase/           # Migrations + Edge Functions
shared/types/       # Generated DB types + Discogs types
```

## Data Flow Architecture

```
Pages → Stores → Composables → Supabase/External APIs
         ↓
    Auto-imports (no manual imports needed)
```

### Key Data Flows

1. **Record Import**: Dialog → discogsStore → useDiscogsApi → Edge Function → Supabase RPC
2. **DJ Session**: Deck UI → sessionStore → tracksStore → Supabase (auto-save)
3. **Track Enrichment**: beatportStore → server/api/beatport → Beatport scraping

## Architectural Strengths

### 1. Consistent Store Patterns

- All 12 stores use Composition API style
- Optimistic updates with rollback on all mutations
- Clear separation: domain stores vs UI state stores

### 2. Type Safety

- Strict TypeScript throughout
- Auto-generated Supabase types (`shared/types/database.ts`)
- Comprehensive Discogs type guards (20+ functions)

### 3. Auto-Import Architecture

- Components, composables, stores, utils all auto-imported
- Reduces boilerplate significantly
- Configured in `nuxt.config.ts`

### 4. Form Handling

- VeeValidate + Zod schemas
- Dual validation strategies (edit vs create modes)
- Consistent unsaved changes detection

## Architectural Concerns

### 1. SSR Disabled

- Pure SPA limits SEO (acceptable for authenticated DJ app)
- No server-side data fetching benefits

### 2. Beatport Integration Fragility

- HTML scraping relies on `__NEXT_DATA__` JSON structure
- No official API - ToS risk and maintenance burden
- Breaks when Beatport changes HTML structure

### 3. Edge Function Module Caching

```typescript
// supabase/functions/_shared/supabaseHelpers.ts
let cachedSupabaseClient: SupabaseClient | null = null
let cachedUser: User | null = null
```

- Module-level caching in serverless could leak data between requests
- Should create isolated client per invocation

### 4. Session Store Timeout Variable

```typescript
// app/stores/sessionStore.ts:337
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null
```

- Module-scoped variable outside reactive system
- Could leak if store reinitializes

## Store Architecture

| Store              | Domain     | Key Responsibility                             |
| ------------------ | ---------- | ---------------------------------------------- |
| userStore          | Auth       | Supabase auth, profile sync                    |
| recordsStore       | Records    | CRUD, search, relationship tracking            |
| tracksStore        | Tracks     | CRUD, filtering, harmony matching              |
| cratesStore        | Crates     | Collection management, record associations     |
| sessionStore       | Session    | Deck state, suggestions, auto-save (555 lines) |
| discogsStore       | Import     | OAuth flow, folder listing, import progress    |
| discogsAuthStore   | Auth       | OAuth token handling                           |
| beatportStore      | Enrichment | Bulk metadata fetching                         |
| trackFiltersStore  | UI         | Filter state management                        |
| recordDetailsStore | UI         | Dialog state                                   |
| trackEditStore     | UI         | Dialog state                                   |

## Composable Architecture

| Composable         | Purpose                          |
| ------------------ | -------------------------------- |
| useUserData        | Master data loading orchestrator |
| useDiscogsApi      | Discogs API wrapper              |
| useBeatportScraper | Beatport search client           |
| useNavigation      | Route helpers                    |
| usePageActive      | Tab visibility tracking          |
| useValidation      | VeeValidate helpers              |

## Database Schema

- **profiles**: User preferences (pitch range, Discogs tokens)
- **records**: Vinyl records with Discogs metadata
- **tracks**: Individual songs with BPM/key data
- **crates**: Collections/setlists
- **sets**: DJ session history

All tables have RLS policies enforcing user isolation.

## Recommendations

1. **Convert module-scoped variables to refs** in sessionStore
2. **Remove Edge Function caching** or ensure proper isolation
3. **Consider Beatport API alternatives** or robust fallback handling
4. **Document cross-store dependencies** explicitly
5. **Add request timeouts** to Supabase operations
