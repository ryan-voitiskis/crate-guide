# Spotify Integration - Version 1 Technical Documentation

## Overview

Version 1 of Crate Guide implemented a comprehensive Spotify integration focused on importing audio features for DJ mixing workflows. The integration used OAuth 2.0 for authentication and provided bulk import capabilities with fuzzy matching for inexact results.

## Architecture

**Client**: Vue 3 + Pinia store
**Server**: Express.js + MongoDB
**Real-time**: Server-Sent Events (SSE) for progress tracking
**Matching**: Levenshtein distance algorithm for fuzzy matching

## OAuth 2.0 Implementation

### Flow

1. Client requests authorization URL from server
2. Server generates nonce, stores in user record, returns Spotify auth URL
3. User redirects to Spotify, authorizes, returns with code + state
4. Server exchanges code for access/refresh tokens
5. Tokens stored in user MongoDB document

### Token Management

- Access tokens refreshed automatically before 15min expiry
- Refresh tokens stored permanently until revoked
- Built-in retry logic for 401 responses (token refresh)
- Rate limit handling (429 responses with 10s delay)

### User Model Fields

```typescript
{
	spotifyToken: string
	spotifyRefreshToken: string
	spotifyTokenTimestamp: number
	spotifyTokenExpiresIn: number
	spotifyNonce: string // for OAuth state verification
}
```

## Audio Features Data Structure

Spotify's audio analysis data was stored directly in track documents:

```typescript
interface AudioFeatures {
	acousticness: number // 0.0-1.0
	danceability: number // 0.0-1.0
	duration_ms: number
	energy: number // 0.0-1.0
	instrumentalness: number // 0.0-1.0
	key: number // 0-11 (C, C#, D, etc.)
	liveness: number // 0.0-1.0
	loudness: number // dB, typically -60 to 0
	mode: number // 0=minor, 1=major
	speechiness: number // 0.0-1.0
	tempo: number // BPM
	time_signature: number // 3,4,5,6,7
	valence: number // 0.0-1.0 (musical positivity)
}
```

### Integration with DJ Features

- `tempo` used for BPM matching and pitch adjustment calculations
- `key` + `mode` converted to Camelot wheel notation for harmonic mixing
- `energy` and `danceability` used for set progression planning

## Fuzzy Matching System

### Two-Phase Matching Process

**Phase 1: Album Matching**

- Search Spotify for album using artist + title + year
- Exact matches imported automatically
- Inexact matches presented to user for manual selection
- Levenshtein distance calculated for similarity scoring

**Phase 2: Track Matching**

- For unmatched albums, search individual tracks
- Track-level fuzzy matching with user selection interface
- Fallback for albums with different track listings

### Matching Interfaces

```typescript
interface InexactAlbumMatch {
	recordID: string
	matches: SpotifyAlbumEdit[]
}

interface SpotifyAlbumEdit {
	id: string
	levenshtein: number
	image: string
	name: string
	artists: string
	external_url: string
	release_date: string
	selected?: boolean
}

interface InexactTrackMatch {
	recordID: string
	trackID: string
	options: SpotifyTrackEdit[]
}
```

### Search Optimization

- Query optimization for better Spotify API results
- Artist name normalization
- Title cleaning (removing parentheticals, etc.)
- Year-based filtering when available

## API Endpoints Structure

### OAuth Endpoints

- `GET /api/spotify/authorisation_request` - Get auth URL
- `GET /api/spotify/callback` - Handle OAuth callback
- `PUT /api/spotify/revoke` - Revoke authorization

### Data Import Endpoints

- `POST /api/spotify_sse/import_selected` - Bulk import with SSE progress
- `POST /api/spotify_sse/import_matched` - Import user-matched results
- `PUT /api/spotify/get_track_features` - Single track feature import

## User Experience Flow

1. **Selection**: User selects records from collection
2. **Authorization**: OAuth flow if not already authorized
3. **Bulk Import**: SSE-powered progress tracking for batch processing
4. **Fuzzy Matching**: UI for manual selection of inexact matches
5. **Completion**: Audio features integrated into track data

### State Management (Pinia Store)

```typescript
interface SpotifyStore {
	// Modals
	importProgressModal: boolean
	albumMatchesModal: boolean
	trackMatchesModal: boolean
	completionModal: boolean
	revokeSpotifyModal: boolean

	// Data
	inexactAlbumMatches: InexactAlbumMatch[]
	inexactTrackMatches: InexactTrackMatch[]

	// Status
	importProgress: number // 0-1
	loading: boolean
	errorMsg: string
}
```

## Key Features for v2 Consideration

### Essential Features

- **Audio Features Import**: Core value proposition for DJ mixing
- **OAuth 2.0 Flow**: Required for Spotify API access
- **Fuzzy Matching**: Critical for handling inexact matches
- **Manual Track Linking**: Allow users to add Spotify IDs manually

### V1 Implementation Notes

- Used SSE for real-time progress (v2 will use different approach)
- Server-side batch processing (v2 will use edge functions)
- MongoDB for token storage (v2 uses Supabase)
- Bulk import paradigm (v2 may prefer individual API calls)

### Rate Limiting & Error Handling

- Built-in 429 handling with delays
- Automatic token refresh logic
- Graceful degradation for network errors
- User-friendly error messages

## Data Integration

### Track Enhancement

- Spotify IDs stored on track documents
- Audio features augment track data for mixing workflows
- Direct links to Spotify tracks for preview/playback
- BPM and key data drives harmonic mixing features

### User Authorization State

- `isSpotifyOAuthd` boolean in user session
- Conditional UI elements based on auth status
- Automatic re-authorization prompts when tokens expire

## Security Considerations

- State parameter (nonce) for OAuth CSRF protection
- Tokens stored server-side, never exposed to client
- Automatic token refresh prevents long-lived credentials
- Revocation endpoint for clean disconnection
