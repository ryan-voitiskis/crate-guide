# Code Quality Improvements - Crate Guide

## Overview

The codebase demonstrates strong patterns overall, with consistent use of Vue 3 Composition API, TypeScript, and Pinia. This document identifies opportunities for improving type safety, reducing duplication, and enhancing maintainability.

## Type Safety Improvements

### QUAL-001: Replace Type Assertions with Type Guards

**Priority**: MEDIUM
**Locations**: Multiple stores

**Current Pattern**:
```typescript
// app/stores/recordsStore.ts:43
records.value = (data as DatabaseRecord[]) || []

// app/stores/tracksStore.ts:48
})) as Track[]) || []

// app/stores/sessionStore.ts:420
savedSets.value = (data as unknown as SavedSet[]) ?? []
```

**Problem**: `as` assertions bypass type checking. If Supabase returns unexpected data, runtime errors occur.

**Fix Option 1 - Runtime Validation**:
```typescript
import { z } from 'zod'

const recordSchema = z.object({
  id: z.string(),
  title: z.string(),
  // ... all fields
})

const records = recordSchema.array().parse(data)
```

**Fix Option 2 - Type Guard**:
```typescript
function isRecordArray(data: unknown): data is DatabaseRecord[] {
  return Array.isArray(data) && data.every(isRecord)
}

if (isRecordArray(data)) {
  records.value = data
} else {
  console.error('Invalid record data from API')
}
```

### QUAL-002: Fix Non-Null Assertions

**Priority**: MEDIUM
**Location**: `app/utils/keyFunctions.ts`

**Current Code**:
```typescript
// Line 144
pitchClassMap.find((i) => i.pitchClass === pitchClass)!.camelotMajor

// Line 248
const mode = parseInt(composite[0]!, 10)

// Line 310
const key = noteMap[note!]
```

**Fix**: Handle null cases explicitly:
```typescript
// Line 144
const match = pitchClassMap.find((i) => i.pitchClass === pitchClass)
if (!match) throw new Error(`Unknown pitch class: ${pitchClass}`)
return match.camelotMajor

// Line 248
const modeStr = composite[0]
if (!modeStr) throw new Error('Invalid composite key format')
const mode = parseInt(modeStr, 10)
```

### QUAL-003: Standardize Error Handling

**Priority**: MEDIUM
**Current State**: Inconsistent error handling across stores

**Pattern A (Silent)**:
```typescript
} catch {
  toast.error('Error message')
}
```

**Pattern B (Logged)**:
```typescript
} catch (e) {
  console.error('Context:', e)
  toast.error('Error message')
}
```

**Pattern C (Detailed)**:
```typescript
} catch (e) {
  toast.error(isError(e) ? e.message : 'Default message')
}
```

**Recommended Standard**:
```typescript
} catch (error) {
  console.error('[storeName.methodName]:', error)
  toast.error(isError(error) ? error.message : 'Operation failed')
}
```

---

## Code Duplication Reduction

### QUAL-004: Extract Generic CRUD Store Factory

**Priority**: MEDIUM
**Affected Stores**: recordsStore, tracksStore, cratesStore

**Current Duplication**:
Each store implements nearly identical patterns:
- `isLoadingX`, `isCreatingX`, `isUpdatingX`, `isDeletingX` refs
- `fetchAllX()` with identical structure
- `createX()` with optimistic add
- `updateX()` with optimistic update + rollback
- `deleteX()` with optimistic delete + rollback

**Proposed Solution**:
```typescript
// utils/createCrudStore.ts
interface CrudStoreConfig<T> {
  tableName: string
  storeName: string
  orderBy?: { column: string; ascending: boolean }
}

export function createCrudStore<T extends { id: string }>(config: CrudStoreConfig<T>) {
  return defineStore(config.storeName, () => {
    const items = ref<T[]>([])
    const isLoading = ref(false)
    const isCreating = ref(false)
    const isUpdating = ref(false)
    const isDeleting = ref(false)

    async function fetchAll() {
      isLoading.value = true
      try {
        const query = supabase.from(config.tableName).select('*')
        if (config.orderBy) {
          query.order(config.orderBy.column, { ascending: config.orderBy.ascending })
        }
        const { data, error } = await query
        if (error) throw error
        items.value = data as T[]
      } catch (e) {
        console.error(`[${config.storeName}] Fetch failed:`, e)
        toast.error(`Failed to load ${config.storeName}`)
      } finally {
        isLoading.value = false
      }
    }

    // ... create, update, delete with same pattern

    return { items, isLoading, isCreating, isUpdating, isDeleting, fetchAll, /* ... */ }
  })
}

// Usage:
export const useRecordsStore = createCrudStore<DatabaseRecord>({
  tableName: 'records',
  storeName: 'records',
  orderBy: { column: 'created_at', ascending: false }
})
```

### QUAL-005: Extract Search Logic

**Priority**: LOW
**Locations**: recordsStore.ts, tracksStore.ts

**Current Duplication**:
Both stores have similar search implementations with filter predicates.

**Proposed Solution**:
```typescript
// utils/createSearchableState.ts
export function useSearchableState<T>(
  items: Ref<T[]>,
  searchFields: (keyof T)[]
) {
  const searchQuery = ref('')
  const searchResults = ref<T[]>([])
  const isSearching = ref(false)

  const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
  const displayedItems = computed(() =>
    hasSearchQuery.value ? searchResults.value : items.value
  )

  function performSearch() {
    if (!hasSearchQuery.value) {
      searchResults.value = []
      return
    }
    const query = searchQuery.value.toLowerCase()
    searchResults.value = items.value.filter(item =>
      searchFields.some(field => {
        const value = item[field]
        return typeof value === 'string' && value.toLowerCase().includes(query)
      })
    )
  }

  return {
    searchQuery: readonly(searchQuery),
    searchResults: readonly(searchResults),
    isSearching: readonly(isSearching),
    hasSearchQuery,
    displayedItems,
    setSearchQuery: (q: string) => { searchQuery.value = q; performSearch() },
    clearSearch: () => { searchQuery.value = ''; searchResults.value = [] }
  }
}
```

---

## Complexity Reduction

### QUAL-006: Refactor getSuggestionsForDeck

**Priority**: MEDIUM
**Location**: `app/stores/sessionStore.ts:101-185`
**Complexity**: ~100 lines, 4 nested filters, complex scoring

**Current Structure**:
```typescript
function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
  // Get deck and validate
  // Filter by BPM reachability
  // Filter already played
  // Filter same record
  // Score each track (harmony + tempo)
  // Sort and limit
}
```

**Proposed Refactor**:
```typescript
// utils/trackSuggestions.ts
export function filterByBpmReach(
  tracks: Track[],
  targetBpm: number,
  pitchRange: number
): Track[] {
  return tracks.filter(t => {
    if (!t.bpm) return false
    const minReachable = t.bpm * (1 - pitchRange / 100)
    const maxReachable = t.bpm * (1 + pitchRange / 100)
    return targetBpm >= minReachable && targetBpm <= maxReachable
  })
}

export function filterAlreadyPlayed(
  tracks: Track[],
  playedIds: Set<string>
): Track[] {
  return tracks.filter(t => !playedIds.has(t.id))
}

export function scoreTrack(
  track: Track,
  targetBpm: number,
  targetKey: number | null,
  pitchRange: number
): ScoredTrack {
  const tempoScore = calculateTempoScore(track.bpm, targetBpm, pitchRange)
  const harmonyScore = calculateHarmonyScore(track.key, targetKey)
  const score = harmonyScore * 0.7 + tempoScore * 0.3
  return { ...track, score, tempoScore, harmonyScore }
}

// In store:
function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
  const deck = decks.value[deckIndex]
  if (!deck?.loadedTrack) return []

  const adjustedBpm = getAdjustedBpm(deckIndex)
  const adjustedKey = getAdjustedKey(deckIndex)

  let candidates = tracks.playableTracks
  candidates = filterByBpmReach(candidates, adjustedBpm, pitchRange.value)
  candidates = filterAlreadyPlayed(candidates, getPlayedTrackIds())
  candidates = candidates.filter(t => t.record_id !== deck.loadedTrack!.record_id)

  return candidates
    .map(t => scoreTrack(t, adjustedBpm, adjustedKey, pitchRange.value))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
}
```

**Benefits**:
- Pure functions are easily testable
- Logic is reusable
- Store becomes a thin orchestration layer

### QUAL-007: Simplify scoreHarmony Function

**Priority**: LOW
**Location**: `app/utils/keyFunctions.ts:329-357`

**Current**: Deeply nested if/else with 3+ levels.

**Proposed**: Use lookup table pattern:
```typescript
const HARMONY_SCORES: Record<number, { affinity: number; description: string }> = {
  0: { affinity: 1.0, description: 'Same key' },
  1: { affinity: 0.9, description: 'Adjacent key' },
  2: { affinity: 0.7, description: 'Relative major/minor' },
  // ... etc
}

function scoreHarmony(key1: number, key2: number): HarmonyResult {
  const distance = getHarmonicDistance(key1, key2)
  const score = HARMONY_SCORES[distance]
  if (!score) return { harmonicAffinity: 0, description: 'Incompatible' }
  return { harmonicAffinity: score.affinity, description: score.description }
}
```

---

## Naming Convention Fixes

### QUAL-008: Expand Terse Variable Names

**Priority**: LOW
**Locations**: Various callback functions

**Current**:
```typescript
(c: Crate) => c.id === id
(r: DatabaseRecord) => r.id === id
(t: Track) => t.id === id
```

**Recommended**:
```typescript
(crate: Crate) => crate.id === id
(record: DatabaseRecord) => record.id === id
(track: Track) => track.id === id
```

### QUAL-009: Fix Mixed Count Naming

**Location**: `app/stores/recordsStore.ts:24`

**Current**: `resultsCount` vs `recordsCount` (inconsistent singular/plural)

**Fix**: Standardize to `recordCount` and `resultCount` (singular prefix).

---

## Documentation Improvements

### QUAL-010: Add JSDoc to Public Store Functions

**Priority**: LOW
**Locations**: All stores

**Current**: No JSDoc comments on public functions.

**Recommended**:
```typescript
/**
 * Fetches all records for the current user from the database.
 * Updates the `records` ref and handles loading state.
 * @throws Displays toast error if fetch fails
 */
async function fetchAllRecords(): Promise<void> {
  // ...
}

/**
 * Calculates track suggestions for the specified deck.
 * Filters by BPM reachability, excludes played tracks,
 * and scores by harmonic compatibility (70%) and tempo closeness (30%).
 * @param deckIndex - The deck index (0-3)
 * @returns Sorted array of scored tracks, limited to top 50
 */
function getSuggestionsForDeck(deckIndex: number): ScoredTrack[] {
  // ...
}
```

### QUAL-011: Resolve TODO Comments

**Locations**:
- `app/utils/keyFunctions.ts:1,7,14` - Module organization TODOs
- `app/components/records/CardRecordShort.vue:45` - Fallback TODO
- `app/components/records/DialogTrackEdit.vue:17` - Validation TODO
- `app/components/records/DialogRecordDetails.vue:342` - Color TODO
- `app/components/tracks/DialogTrackFilters.vue:8,13,24` - UI refactoring TODOs

**Action**: Either implement or remove with explanation comment.

---

## Implementation Priority

| ID | Description | Priority | Effort |
|----|-------------|----------|--------|
| QUAL-001 | Type assertions → guards | Medium | Medium |
| QUAL-002 | Fix non-null assertions | Medium | Low |
| QUAL-003 | Standardize error handling | Medium | Low |
| QUAL-004 | CRUD store factory | Medium | High |
| QUAL-005 | Extract search logic | Low | Medium |
| QUAL-006 | Refactor suggestions | Medium | Medium |
| QUAL-007 | Simplify scoreHarmony | Low | Low |
| QUAL-008 | Expand variable names | Low | Low |
| QUAL-009 | Fix count naming | Low | Low |
| QUAL-010 | Add JSDoc | Low | Medium |
| QUAL-011 | Resolve TODOs | Low | Low |

---

## Quick Wins

1. **QUAL-003**: Add `console.error` to all catch blocks (~15 min)
2. **QUAL-008**: Expand callback variable names (~10 min)
3. **QUAL-011**: Resolve or document TODOs (~20 min)
4. **QUAL-002**: Fix non-null assertions in keyFunctions (~15 min)
