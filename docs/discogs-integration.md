# Discogs Integration

## Overview

The Discogs integration allows users to authenticate with their Discogs account
and bulk import vinyl records from their collection into Crate Guide. The
integration handles OAuth 1.0 authentication, restricts authenticated requests
to the reads the application supports, and transforms Discogs releases into the
app's record/track format.

## Architecture Overview

The integration uses a multi-layer architecture:

- **Frontend stores**: Pinia stores manage public connection state and the
  import workflow; OAuth secrets are never loaded into store state.
- **API layer**: `useDiscogsApi` exposes three structured read methods.
- **Edge Functions**: Authenticated functions handle OAuth and dispatch allowed
  Discogs reads.
- **Private credential storage**: `discogs_credentials` has RLS enabled with no
  policies, so normal authenticated table reads cannot access it. Identity-bound
  `SECURITY DEFINER` RPCs derive the owner from `auth.uid()`.
- **Data processing**: Utility modules transform and validate Discogs data.
- **Database import**: `import_record_with_tracks` inserts each record and its
  tracks atomically.

## User Flow

### Authentication

1. User clicks "Connect Discogs" button
2. `get-discogs-request-token` validates the caller, requests a temporary token
   from Discogs, and saves the request token and secret through
   `set_discogs_request_credentials`.
3. The browser redirects to Discogs's authorization page with the public
   request token.
4. After approval, Discogs returns the public request token and verifier.
5. `get-discogs-access-token` verifies that the callback token matches the
   caller's pending credentials, exchanges it, and stores the access token and
   secret through `set_discogs_access_credentials`.
6. The Edge Function performs one post-exchange Discogs identity fetch and sets
   the public `discogs_username` and avatar fields in the caller's profile.

### Import Process

1. **Folder Selection**: User opens import dialog, system fetches collection folders
2. **Release Loading**: User selects folder, system fetches all releases (paginated)
3. **Filter Dialog**: User can select/deselect specific releases to import
4. **Import Execution**: System processes selected releases in 3 phases:
   - **Duplicate Check**: Filters out already imported releases
   - **Detail Fetch**: Gets full release data from Discogs API with progress tracking
   - **Database Import**: Transforms and inserts records/tracks atomically

### Disconnection

`disconnect_discogs` derives the caller from `auth.uid()`, deletes that user's
private credential row, and clears the public username and avatar in one RPC.
The store then refreshes the profile. Because the browser derives connected
state from `discogs_username`, a completed disconnect is reflected without
reading credential state.

## Technical Components

### Stores

#### `useDiscogsAuthStore`

- Manages OAuth state (`isDiscogsConnecting`, `oAuthCompletionFailed`)
- Derives `isOAuthed` only from the public `discogs_username` profile field
- Handles OAuth initiation, callback completion, and safe public error messages

#### `useDiscogsStore`

- Manages import workflow state (folders, selected releases, progress)
- Controls dialog visibility for different import phases
- Tracks import results (successful, skipped, failed)
- Provides methods for folder fetching, release importing, and disconnection

### API Layer

#### `useDiscogsApi`

- Wraps edge function calls with type-safe methods
- Core methods: `getFolders()`, `getFolderReleases()`, `getRelease()`
- Handles authentication headers and error propagation

### Edge Functions

#### `get-discogs-request-token`

- Initiates OAuth 1.0 flow using PLAINTEXT signature
- Validates the authenticated caller before contacting Discogs
- Stores request credentials with the caller-bound RPC
- Returns only the public request token needed for the authorization redirect

#### `get-discogs-access-token`

- Reads only the caller's pending credentials through `get_discogs_credentials`
- Rejects a callback whose token does not match the pending request
- Exchanges the verifier and stores private access credentials through the RPC
- Fetches identity once after the exchange and updates only public
  username/avatar profile fields

#### `authenticated-discogs-request`

- Is an explicit dispatcher, not an arbitrary URL proxy
- Accepts only `folders`, `folder_releases`, or `release` endpoint variants
- Validates structured IDs and pagination, constructs the URL server-side, and
  performs GET requests only
- Resolves the collection username from the authenticated caller's profile
- Uses `makeAuthenticatedRequest` to load the caller's credentials through the
  RPC and sign all URL query parameters with OAuth 1.0 HMAC-SHA1

### Data Processing

#### `discogs-data.ts`

- **Artist Normalization**: Removes disambiguation numbers, handles roles
- **Track Transformation**: Processes tracklist with position normalization, duration parsing
- **Title Enhancement**: Adds remix/edit info from extraartists to track titles
- **Label Processing**: Extracts catalog numbers, entity types, thumbnails

#### `discogs-import.ts`

- **3-Phase Import**: Separates duplicate filtering, API fetching, and database insertion
- **Progress Tracking**: Reports progress during detail fetching phase
- **Error Handling**: Categorizes failures by phase with detailed error messages

#### `discogs-database.ts`

- **Duplicate Detection**: Queries existing records by Discogs ID
- **Atomic Import**: Uses `import_record_with_tracks` RPC for transactional inserts

## Data Flow

### Release Data Transformation

Discogs releases undergo significant transformation:

```
DiscogsRelease (collection) → DiscogsReleaseFull (API) → Record + Tracks (database)
```

**Key Transformations**:

- **Position Normalization**: `A1`, `AA` formats → standardized vinyl positions
- **Duration Parsing**: `"4:32"` → milliseconds
- **Artist Role Processing**: Remix artists become track title suffixes
- **Genre Inheritance**: Release styles/genres applied to tracks
- **RPM Detection**: Format descriptions determine 33/45 RPM

### Authentication Flow

```
Browser → authenticated Edge Function → Discogs OAuth
        → caller-bound credential RPC → private credential row
        → post-exchange identity fetch → public profile fields
```

The normal application/store path selects only public profile identity. Private
request/access credentials are stored in `discogs_credentials`; RLS with no
policies denies normal authenticated table reads. The authenticated browser
role can still execute the four identity-bound RPCs, including
`get_discogs_credentials`, which returns credentials only for the caller's
`auth.uid()`. None accepts a user ID. The Edge Functions use the same RPCs for
the OAuth and request flows.

## Key Implementation Details

### OAuth 1.0 Signature Generation

The request-token and access-token exchanges use the signature methods required
by those OAuth steps. Subsequent API reads use HMAC-SHA1. The
`makeAuthenticatedRequest` helper parses the server-constructed URL and includes
every query parameter in the OAuth signature base string.

### Progress Tracking

Import progress is tracked at the release level during the detail fetching phase. The `releaseBeingImported` ref shows which release is currently being processed.

### Error Resilience

The import process continues even if individual releases fail, categorizing results into successful, skipped (duplicates), and failed (with specific error messages).

### Type Safety

TypeScript types and runtime validation protect the transformation pipeline.
Store boundaries decode Supabase JSON, and Discogs responses use guards such as
`isDiscogsReleaseFull()` before import.

### Database Atomicity

The `import_record_with_tracks` RPC function ensures that records and their tracks are inserted atomically, preventing partial imports on database errors.
On success it returns `{ success: true, record_id, tracks_inserted }`; authentication/validation/SQL failures are raised and surface to clients as RPC errors (not `{ success: false, error }` payloads).

## Errors and Tests

OAuth failures sent to the browser use controlled public messages. The client
also rejects unusually long responses and messages that resemble tokens,
signatures, verifiers, or authorization headers. Keep diagnostic details in the
server logs; never put credentials, authorization headers, or raw OAuth
responses in a browser-visible error.

The live client contracts are covered by
`app/composables/__tests__/useDiscogsApi.test.ts`,
`app/stores/__tests__/discogsAuthStore.test.ts`, and
`app/stores/__tests__/discogsStore.test.ts`. The Deno suite contains four tests
for callback credential validation in
`supabase/functions/get-discogs-access-token/validateCredentials.test.ts`.
There are no direct Edge handler tests, so changes to a handler require the Edge
checks plus an authenticated local walkthrough.

```bash
npx vitest run --project stores \
  app/composables/__tests__/useDiscogsApi.test.ts \
  app/stores/__tests__/discogsAuthStore.test.ts \
  app/stores/__tests__/discogsStore.test.ts
npm run check:edge
npm run lint:edge
npm run test:edge
```

## Usage for Future Development

When building features that interact with Discogs data:

- Use `useDiscogsAuthStore().isOAuthed` to check authentication status
- Access user's Discogs username via `useUserStore().profile?.discogs_username`
- Extend the explicit client/Edge endpoint union together; never accept a raw
  client URL or an unrestricted HTTP method
- Follow the existing data transformation patterns for consistency
- Consider the import result structure for user feedback patterns

Keep credentials out of profile selects, Pinia state, client logs, and public
errors. Any new credential operation must remain identity-bound and must not
accept a caller-supplied user ID.
