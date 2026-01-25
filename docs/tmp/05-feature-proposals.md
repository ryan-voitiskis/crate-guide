# Feature Proposals - Crate Guide

## Overview

Based on the architecture analysis and domain understanding, these feature proposals align with the DJ vinyl record management use case while building on the existing codebase patterns.

---

## High-Value Features

### FEAT-001: Real-Time Crate Collaboration

**Priority**: HIGH
**Complexity**: Medium
**Dependencies**: Supabase Realtime (already configured)

**Description**:
Enable multiple users to view and edit a shared crate in real-time. Useful for DJ duos or crew planning sets together.

**Implementation Approach**:
1. Add `shared_with` JSONB column to `crates` table
2. Enable Supabase Realtime subscriptions on `crates` and `crate_records`
3. Add sharing UI in DialogCrateDetails
4. Implement conflict resolution for simultaneous edits

**Database Changes**:
```sql
ALTER TABLE crates ADD COLUMN shared_with jsonb DEFAULT '[]'::jsonb;

-- RLS policy for shared crates
CREATE POLICY "users_can_view_shared_crates"
  ON crates FOR SELECT
  USING (
    user_id = auth.uid() OR
    shared_with ? auth.uid()::text
  );
```

**Store Changes**:
```typescript
// cratesStore.ts
function subscribeToSharedCrate(crateId: string) {
  return supabase
    .channel(`crate:${crateId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crates', filter: `id=eq.${crateId}` },
      (payload) => handleCrateUpdate(payload)
    )
    .subscribe()
}
```

---

### FEAT-002: Offline Support with Service Worker

**Priority**: HIGH
**Complexity**: High
**Dependencies**: None

**Description**:
Enable offline access to record collection and crates for gigs without reliable WiFi.

**Implementation Approach**:
1. Add Nuxt PWA module
2. Implement IndexedDB storage for records, tracks, crates
3. Queue mutations for sync when online
4. Add sync status indicator in UI

**Package Addition**:
```bash
npm install @vite-pwa/nuxt
```

**Configuration**:
```typescript
// nuxt.config.ts
modules: [
  '@vite-pwa/nuxt'
],
pwa: {
  strategies: 'generateSW',
  registerType: 'autoUpdate',
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api-cache',
          expiration: { maxAgeSeconds: 86400 }
        }
      }
    ]
  }
}
```

---

### FEAT-003: Session Export to Mixcloud/Soundcloud

**Priority**: MEDIUM
**Complexity**: Medium

**Description**:
Export DJ session tracklist in formats compatible with Mixcloud and Soundcloud for show notes.

**Implementation Approach**:
1. Add export button to session history
2. Generate formatted text/JSON output
3. Support multiple formats (plain text, JSON, CSV)
4. Include timestamps if available

**Store Addition**:
```typescript
// sessionStore.ts
function exportSession(setId: string, format: 'text' | 'json' | 'csv'): string {
  const set = savedSets.value.find(s => s.id === setId)
  if (!set) return ''

  switch (format) {
    case 'text':
      return set.played_tracks
        .map((t, i) => `${i + 1}. ${t.artists.join(', ')} - ${t.title}`)
        .join('\n')
    case 'json':
      return JSON.stringify(set.played_tracks, null, 2)
    case 'csv':
      return 'Position,Artist,Title,BPM,Key\n' +
        set.played_tracks
          .map((t, i) => `${i + 1},"${t.artists.join(', ')}","${t.title}",${t.bpm || ''},${t.key || ''}`)
          .join('\n')
  }
}
```

---

### FEAT-004: Smart Crate Builder

**Priority**: MEDIUM
**Complexity**: Medium

**Description**:
Automatically suggest records for a crate based on:
- BPM range preference
- Key compatibility chains
- Genre consistency
- Target set duration

**Implementation Approach**:
1. Add crate builder dialog with parameters
2. Use existing harmony scoring from sessionStore
3. Generate ordered track suggestions
4. Allow manual reordering

**Algorithm**:
```typescript
interface CrateBuilderParams {
  startingTrack: Track
  targetDuration: number // minutes
  bpmRange: { min: number; max: number }
  preferredGenres: string[]
}

function buildSmartCrate(params: CrateBuilderParams): Track[] {
  const suggestions: Track[] = [params.startingTrack]
  let currentTrack = params.startingTrack
  let totalDuration = currentTrack.duration_ms || 240000

  while (totalDuration < params.targetDuration * 60000) {
    const candidates = getCompatibleTracks(currentTrack)
      .filter(t => t.bpm >= params.bpmRange.min && t.bpm <= params.bpmRange.max)
      .filter(t => !suggestions.some(s => s.id === t.id))

    if (candidates.length === 0) break

    const next = candidates[0] // Best scored
    suggestions.push(next)
    currentTrack = next
    totalDuration += next.duration_ms || 240000
  }

  return suggestions
}
```

---

### FEAT-005: Beatport Link Integration

**Priority**: MEDIUM
**Complexity**: Low

**Description**:
Use Beatport LINK streaming service for track previews instead of scraping.

**Benefits**:
- Official API instead of scraping
- No ToS concerns
- Better reliability
- Stream previews

**Implementation**:
Would require Beatport LINK subscription and API access. Replace scraping logic with official API calls.

---

## Medium-Value Features

### FEAT-006: Record Condition Tracking

**Priority**: LOW
**Complexity**: Low

**Description**:
Add vinyl condition grading (M, NM, VG+, VG, G+, G, F, P) to records.

**Database Changes**:
```sql
ALTER TABLE records ADD COLUMN condition varchar(3);
ALTER TABLE records ADD COLUMN condition_notes text;
```

**UI**: Add condition selector in DialogRecordDetails.

---

### FEAT-007: Gig/Venue Association

**Priority**: LOW
**Complexity**: Medium

**Description**:
Associate crates with venues/events for historical tracking.

**Database Changes**:
```sql
CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  location text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crates ADD COLUMN venue_id uuid REFERENCES venues(id);
ALTER TABLE crates ADD COLUMN event_date date;
```

---

### FEAT-008: Duplicate Track Detection

**Priority**: MEDIUM
**Complexity**: Low

**Description**:
Alert when importing records that contain tracks already in collection (different pressings of same song).

**Implementation**:
```typescript
function findDuplicateTracks(newTracks: DiscogsTrack[]): DuplicateMatch[] {
  return newTracks
    .map(newTrack => {
      const matches = tracks.value.filter(existing =>
        normalizeTitle(existing.title) === normalizeTitle(newTrack.title) &&
        existing.artists.some(a =>
          newTrack.artists.some(na => normalizeArtist(a.name) === normalizeArtist(na.name))
        )
      )
      return matches.length > 0 ? { newTrack, matches } : null
    })
    .filter(Boolean)
}
```

---

### FEAT-009: BPM/Key Manual Override History

**Priority**: LOW
**Complexity**: Low

**Description**:
Track history of manual BPM/key corrections for learning purposes.

**Database Changes**:
```sql
ALTER TABLE tracks ADD COLUMN bpm_source varchar(20); -- 'beatport', 'manual', 'discogs'
ALTER TABLE tracks ADD COLUMN key_source varchar(20);
ALTER TABLE tracks ADD COLUMN original_bpm numeric;
ALTER TABLE tracks ADD COLUMN original_key integer;
```

---

### FEAT-010: Quick Search Keyboard Navigation

**Priority**: MEDIUM
**Complexity**: Low

**Description**:
Add keyboard shortcuts for power users:
- `/` to focus search
- Arrow keys to navigate results
- Enter to select
- Escape to clear

**Implementation**:
```typescript
// composables/useKeyboardNav.ts
export function useKeyboardNav() {
  const selectedIndex = ref(-1)

  function handleKeydown(e: KeyboardEvent, items: any[], onSelect: (item: any) => void) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedIndex.value = Math.min(selectedIndex.value + 1, items.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
        break
      case 'Enter':
        if (selectedIndex.value >= 0) {
          onSelect(items[selectedIndex.value])
        }
        break
      case 'Escape':
        selectedIndex.value = -1
        break
    }
  }

  return { selectedIndex, handleKeydown }
}
```

---

## Low-Priority Enhancements

### FEAT-011: Dark/Light Theme Scheduling

Auto-switch themes based on time of day or system preference.

### FEAT-012: Record Cover Art Gallery View

Grid view of record covers for visual browsing.

### FEAT-013: Play Count Statistics

Track how often each record/track is played across sessions.

### FEAT-014: Wantlist Integration

Sync with Discogs wantlist to track records to acquire.

### FEAT-015: Mobile-Optimized Session View

Simplified session UI for tablet/phone use at gigs.

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)
- FEAT-010: Keyboard navigation
- FEAT-008: Duplicate detection
- FEAT-006: Condition tracking

### Phase 2: Core Enhancements (2-4 weeks)
- FEAT-003: Session export
- FEAT-004: Smart crate builder

### Phase 3: Major Features (4-8 weeks)
- FEAT-002: Offline support
- FEAT-001: Real-time collaboration

### Phase 4: Future Consideration
- FEAT-005: Beatport LINK (requires subscription)
- FEAT-007: Venue tracking
- FEAT-009: BPM/key history

---

## Technical Considerations

### Database Migrations
All features requiring schema changes should:
1. Create migration file in `supabase/migrations/`
2. Update RLS policies as needed
3. Regenerate types with `npm run genTypes`

### Testing Requirements
Each feature should include:
- Store tests for new state/actions
- Utility tests for new functions
- Update existing tests if behavior changes

### Performance Considerations
- FEAT-001: Realtime subscriptions should be cleaned up on unmount
- FEAT-002: IndexedDB operations should be async/non-blocking
- FEAT-004: Smart crate algorithm should have iteration limits
