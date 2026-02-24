# Discogs Integration

## Overview

The Discogs integration allows users to authenticate with their Discogs account and bulk import vinyl records from their Discogs collection into Crate Guide. The integration handles OAuth 1.0 authentication, fetches collection data, and transforms Discogs releases into the app's record/track format with comprehensive metadata.

## Architecture Overview

The integration uses a multi-layer architecture:

- **Frontend Stores**: Pinia stores manage authentication state and import workflow
- **API Layer**: Composable provides type-safe Discogs API methods
- **Edge Functions**: Supabase functions handle OAuth flow and authenticated requests
- **Data Processing**: Utility modules transform and validate Discogs data
- **Database**: Atomic record+track insertion via RPC functions

## User Flow

### Authentication

1. User clicks "Connect Discogs" button
2. System initiates OAuth flow via `get-discogs-request-token` edge function
3. User redirects to Discogs authorization page
4. After approval, user returns with verifier code
5. System exchanges verifier for access tokens via `get-discogs-access-token`
6. User identity and avatar are fetched and stored in profile

### Import Process

1. **Folder Selection**: User opens import dialog, system fetches collection folders
2. **Release Loading**: User selects folder, system fetches all releases (paginated)
3. **Filter Dialog**: User can select/deselect specific releases to import
4. **Import Execution**: System processes selected releases in 3 phases:
   - **Duplicate Check**: Filters out already imported releases
   - **Detail Fetch**: Gets full release data from Discogs API with progress tracking
   - **Database Import**: Transforms and inserts records/tracks atomically

### Disconnection

Users can disconnect their Discogs account, which clears all stored tokens and username.

## Technical Components

### Stores

#### `useDiscogsAuthStore`

- Manages OAuth state (`isDiscogsConnecting`, `oAuthCompletionFailed`)
- Provides computed `isOAuthed` status based on stored tokens
- Handles OAuth initiation and completion

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
- Stores request token/secret in user profile
- Returns authorization URL token

#### `get-discogs-access-token`

- Exchanges verifier for access tokens
- Updates profile with access credentials
- Fetches and stores user identity/avatar

#### `authenticated-discogs-request`

- Generic proxy for authenticated Discogs API calls
- Generates proper OAuth 1.0 HMAC-SHA1 signatures
- Supports pagination parameters

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
Frontend → Edge Function → Discogs OAuth → Edge Function → Database
```

Tokens are stored in the user profile and used for subsequent API calls via the authentication edge function.

## Key Implementation Details

### OAuth 1.0 Signature Generation

The integration properly implements OAuth 1.0 with HMAC-SHA1 signatures for API requests. The `makeAuthenticatedRequest` helper handles the complex signature generation using the `oauth-signature` library.

### Progress Tracking

Import progress is tracked at the release level during the detail fetching phase. The `releaseBeingImported` ref shows which release is currently being processed.

### Error Resilience

The import process continues even if individual releases fail, categorizing results into successful, skipped (duplicates), and failed (with specific error messages).

### Type Safety

Comprehensive TypeScript types and runtime validation ensure data integrity throughout the transformation pipeline using type guards like `isDiscogsReleaseFull()`.

### Database Atomicity

The `import_record_with_tracks` RPC function ensures that records and their tracks are inserted atomically, preventing partial imports on database errors.
On success it returns `{ success: true, record_id, tracks_inserted }`; authentication/validation/SQL failures are raised and surface to clients as RPC errors (not `{ success: false, error }` payloads).

## Usage for Future Development

When building features that interact with Discogs data:

- Use `useDiscogsAuthStore().isOAuthed` to check authentication status
- Access user's Discogs username via `useUserStore().profile?.discogs_username`
- Leverage `useDiscogsApi()` methods for additional API calls
- Follow the existing data transformation patterns for consistency
- Consider the import result structure for user feedback patterns

The integration provides a solid foundation for any Discogs-related features while maintaining proper authentication, error handling, and data integrity.
