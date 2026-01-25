# Bug Fixes - Crate Guide

## Critical Bugs

### BUG-001: Falsy Key Check Filters Out C Major Tracks

**Severity**: HIGH
**Location**: `app/stores/tracksStore.ts:238`
**Status**: Confirmed via test file comment

**Description**:
The `getCompatibleTracks()` function uses falsy checks for track keys, but key `0` represents C Major in the Camelot wheel. This causes C Major tracks to be incorrectly filtered out.

**Current Code**:
```typescript
if (!track.bpm || !track.key || !currentTrack.bpm || !currentTrack.key) {
  return false
}
```

**Problem**:
- `!track.key` evaluates to `true` when `key === 0` (C Major)
- Tracks with key=0 are incorrectly excluded from compatibility results

**Evidence**:
Test file `tracksStore.test.ts:733` contains the comment:
```typescript
// Note: Key 0 (C) is treated as falsy in the store's null check
```

**Fix**:
```typescript
if (
  track.bpm === null || track.bpm === undefined ||
  track.key === null || track.key === undefined ||
  currentTrack.bpm === null || currentTrack.bpm === undefined ||
  currentTrack.key === null || currentTrack.key === undefined
) {
  return false
}
```

**Or more concisely**:
```typescript
if (
  track.bpm == null || track.key == null ||
  currentTrack.bpm == null || currentTrack.key == null
) {
  return false
}
```

**Testing Required**:
- Add test case for track with key=0 (C Major)
- Verify C Major tracks appear in compatibility results
- Check harmonic mixing suggestions include key=0 tracks

---

### BUG-002: Session Auto-Save Timeout Memory Leak Risk

**Severity**: MEDIUM
**Location**: `app/stores/sessionStore.ts:337`

**Description**:
The `autoSaveTimeout` variable is module-scoped outside the reactive system. If the store is destroyed and recreated (unlikely in SPA but possible), the timeout reference could leak.

**Current Code**:
```typescript
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave() {
  if (autoSaveTimeout) clearTimeout(autoSaveTimeout)
  autoSaveTimeout = setTimeout(async () => {
    // ...
  }, 2000)
}
```

**Fix**:
```typescript
const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function scheduleAutoSave() {
  if (autoSaveTimeout.value) clearTimeout(autoSaveTimeout.value)
  autoSaveTimeout.value = setTimeout(async () => {
    // ...
  }, 2000)
}

function clearSession() {
  if (autoSaveTimeout.value) {
    clearTimeout(autoSaveTimeout.value)
    autoSaveTimeout.value = null
  }
  // ... rest of cleanup
}
```

---

## Medium Priority Bugs

### BUG-003: Potential Race Condition in Session Auto-Save

**Severity**: MEDIUM
**Location**: `app/stores/sessionStore.ts:379-396`

**Description**:
If `scheduleAutoSave()` is called rapidly and the first `createActiveSet()` completes between two scheduled callbacks, both callbacks might attempt operations.

**Current Flow**:
1. First callback fires, `activeSetId` is null → calls `createActiveSet()`
2. Second callback scheduled before first completes
3. First callback sets `activeSetId`
4. Second callback fires, sees `activeSetId` set → calls `updateActiveSet()`
5. Both could race if timing is unlucky

**Current Mitigation**: 2-second debounce makes this unlikely.

**Note**: The store already has `isAutoSaving` ref at line 63. The fix only requires converting `autoSaveTimeout` to a ref and ensuring the guard is used properly.

**Recommended Fix**: Convert timeout to ref (isAutoSaving already exists):
```typescript
// autoSaveTimeout should be a ref (isAutoSaving already exists at line 63)
const autoSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

function scheduleAutoSave() {
  if (autoSaveTimeout.value) clearTimeout(autoSaveTimeout.value)

  autoSaveTimeout.value = setTimeout(async () => {
    if (isAutoSaving.value) return // Already saving
    isAutoSaving.value = true

    try {
      if (!activeSetId.value) {
        activeSetId.value = await createActiveSet()
      } else {
        await updateActiveSet()
      }
    } finally {
      isAutoSaving.value = false
    }
  }, 2000)
}
```

---

### BUG-004: TODO Comments in Production Code

**Severity**: LOW
**Locations**:
- `app/components/records/CardRecordShort.vue:45` - `<!-- TODO: fallback -->`
- `app/components/records/DialogTrackEdit.vue:17` - `// TODO: check this is right!`
- `app/components/records/DialogRecordDetails.vue:342` - `<!-- TODO: the colour of AlertDialogAction should be red or amber -->`
- `app/utils/keyFunctions.ts:1,7,14` - Multiple TODO comments about module organization
- `app/components/tracks/DialogTrackFilters.vue:8,13,24` - Three TODOs about UI refactoring

**Fix**: Review and either implement the TODOs or remove the comments.

---

### BUG-005: Hardcoded Colors in DialogBeatportImport.vue

**Severity**: LOW
**Location**: `app/components/import/DialogBeatportImport.vue:114-120`

**Description**:
Uses hardcoded Tailwind colors instead of design tokens:
```vue
<span class="text-green-600 dark:text-green-400">
  {{ beatport.bulkBeatportResults.successful }} found
</span>
<span class="text-red-600 dark:text-red-400">
  {{ beatport.bulkBeatportResults.failed.length }} failed
</span>
```

**Fix**: Use semantic color tokens if available in design system, or create them:
```vue
<span class="text-success">...</span>
<span class="text-destructive">...</span>
```

---

### BUG-006: DeckPitchFader Uses Scoped CSS

**Severity**: LOW
**Location**: `app/components/session/DeckPitchFader.vue`

**Description**:
This is the only component using `<style scoped>` with hardcoded HSL values instead of Tailwind utilities. Inconsistent with the rest of the codebase.

**Current Code**:
```vue
<style scoped>
.pitch-fader::-webkit-slider-thumb {
  background: linear-gradient(
    to right,
    hsl(0, 0%, 87%) 0%,
    hsl(0, 0%, 44%) 33%,
    /* ... */
  );
}
</style>
```

**Note**: This may be intentional due to range input styling limitations. Document if keeping.

---

## Edge Cases to Address

### EDGE-001: Empty Error Catch Blocks

**Locations**:
- `app/stores/recordsStore.ts:44`
- `app/stores/tracksStore.ts:49`
- `app/stores/cratesStore.ts:41`

**Current Pattern**:
```typescript
} catch {
  toast.error('Error fetching records.')
}
```

**Problem**: Error details are lost, making debugging difficult.

**Fix**:
```typescript
} catch (error) {
  console.error('Failed to fetch records:', error)
  toast.error('Error fetching records.')
}
```

---

### EDGE-002: No Request Timeouts

**Locations**: All Supabase operations in stores

**Problem**: Long network stalls could freeze the UI indefinitely.

**Fix**: Add timeouts to critical operations:
```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 10000)

try {
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .abortSignal(controller.signal)
  // ...
} finally {
  clearTimeout(timeoutId)
}
```

---

## Implementation Priority

1. **BUG-001** (High): Fix falsy key check - affects core functionality
2. **BUG-002** (Medium): Convert timeout to ref - prevents potential leaks
3. **BUG-003** (Medium): Add auto-save guard - prevents race conditions
4. **EDGE-001** (Low): Log errors in catch blocks - improves debugging
5. **EDGE-002** (Low): Add request timeouts - improves reliability
6. **BUG-004-006** (Low): Cleanup/consistency issues
