# Test Coverage Gaps - Crate Guide

## Current State

**Total Tests**: 665 across 19 test files
**Framework**: Vitest 3.2.4 with two projects (unit, stores)

### Coverage Summary

| Category    | Tested | Total | Coverage |
| ----------- | ------ | ----- | -------- |
| Stores      | 8      | 11    | 73%      |
| Composables | 3      | 6     | 50%      |
| Utilities   | 8      | 15    | 53%      |
| Components  | 0      | 184   | 0%       |
| Pages       | 0      | 17    | 0%       |
| Server API  | 0      | 1     | 0%       |

---

## Critical Gaps

### GAP-001: Zero Component Testing

**Priority**: HIGH
**Impact**: UI regression risk

**Current State**: 184 Vue components with no unit tests.

**Recommended Testing Approach**:

```typescript
// Example: DialogCrateForm.test.ts
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import DialogCrateForm from '../DialogCrateForm.vue'

describe('DialogCrateForm', () => {
	it('validates required name field', async () => {
		const wrapper = mount(DialogCrateForm, {
			props: { open: true },
			global: {
				plugins: [createTestingPinia()]
			}
		})

		await wrapper.find('button[type="submit"]').trigger('click')
		expect(wrapper.text()).toContain('Name is required')
	})

	it('emits saved event on successful submit', async () => {
		// ...
	})
})
```

**Priority Components to Test**:

1. `DialogCrateForm.vue` - Core CRUD form
2. `DialogRecordDetails.vue` - Complex edit dialog
3. `DialogTrackEdit.vue` - Form with validation
4. `DeckLoadedTrack.vue` - Session UI
5. `CardRecord.vue` - List item rendering

### GAP-002: Server API Endpoint Not Tested

**Priority**: HIGH
**Location**: `server/api/beatport/search.get.ts`

**Current State**: No tests for the Beatport search endpoint.

**Risks**:

- HTML parsing logic untested
- Error handling paths uncovered
- Edge cases (malformed responses) not verified

**Recommended Tests**:

```typescript
// server/api/beatport/search.test.ts
import { describe, expect, it, vi } from 'vitest'

describe('beatport/search API', () => {
	it('returns 400 when query parameter missing', async () => {
		const event = { getQuery: () => ({}) }
		await expect(handler(event)).rejects.toThrow('Bad Request')
	})

	it('parses __NEXT_DATA__ correctly', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			text: () => Promise.resolve(mockBeatportHtml)
		})

		const result = await handler(mockEvent)
		expect(result.data).toMatchObject({
			bpm: 128,
			key: 'Am'
		})
	})

	it('handles Beatport 429 rate limit', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue({
			ok: false,
			status: 429
		})

		await expect(handler(mockEvent)).rejects.toThrow('429')
	})
})
```

### GAP-003: Untested Stores

**Priority**: MEDIUM

**Missing Store Tests**:

1. **discogsAuthStore** (OAuth flow)
   - Token storage/retrieval
   - Redirect handling
   - Error states

2. **recordDetailsStore** (Dialog state)
   - Record selection
   - Edit mode toggling
   - Track-to-delete state

3. **trackEditStore** (Dialog state)
   - Dialog open/close
   - Track loading

**Example Test**:

```typescript
// discogsAuthStore.test.ts
describe('discogsAuthStore', () => {
	it('completes OAuth flow with valid verifier', async () => {
		const store = useDiscogsAuthStore()

		mockSupabase.functions.invoke.mockResolvedValue({
			data: { access_token: 'token', access_secret: 'secret' }
		})

		await store.completeOAuthFlow('verifier123')

		expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
			'get-discogs-access-token',
			expect.objectContaining({ body: expect.stringContaining('verifier123') })
		)
	})

	it('handles OAuth failure gracefully', async () => {
		mockSupabase.functions.invoke.mockRejectedValue(new Error('OAuth failed'))

		await store.completeOAuthFlow('invalid')

		expect(toast.error).toHaveBeenCalled()
	})
})
```

---

## Medium Priority Gaps

### GAP-004: Untested Composables

**Missing Composable Tests**:

1. **useBeatportScraper**
   - Search request formatting
   - Response parsing
   - Error handling

2. **usePageActive**
   - Visibility change handling
   - Lifecycle cleanup

3. **useValidation**
   - VeeValidate integration
   - Schema validation

**Example Test**:

```typescript
// useBeatportScraper.test.ts
describe('useBeatportScraper', () => {
	it('formats search query correctly', async () => {
		const { searchTracks } = useBeatportScraper()

		await searchTracks({ artist: 'Artist Name', title: 'Track Title' })

		expect($fetch).toHaveBeenCalledWith(
			'/api/beatport/search',
			expect.objectContaining({
				query: {
					q: 'Artist Name Track Title',
					artist: 'Artist Name',
					title: 'Track Title'
				}
			})
		)
	})
})
```

### GAP-005: Untested Utilities

**Missing Utility Tests**:

| File                  | Status | Notes                 |
| --------------------- | ------ | --------------------- |
| cn.ts                 | ❌     | Class merging utility |
| discogs-database.ts   | ❌     | DB operations         |
| discogs-formatting.ts | ❌     | Display formatting    |
| discogs-validation.ts | ❌     | Input validation      |
| openInNewTab.ts       | ❌     | Browser utility       |
| setTheme.ts           | ❌     | Theme management      |
| supabase-client.ts    | ❌     | Client initialization |
| typeGuards.ts         | ❌     | Type checking         |

**Priority**: `discogs-validation.ts` and `typeGuards.ts` should be tested as they affect data integrity.

---

## Integration Testing Gaps

### GAP-006: No Multi-Store Integration Tests

**Current State**: Each store tested in isolation.

**Missing Integration Scenarios**:

1. **Record Import Flow**

   ```typescript
   // Should test:
   // discogsStore.importSelectedReleases()
   // → recordsStore.fetchAllRecords()
   // → tracksStore.fetchAllTracks()
   ```

2. **Session Playback Flow**

   ```typescript
   // Should test:
   // sessionStore.loadTrackOnDeck()
   // → tracksStore.getTrackById()
   // → sessionStore.getSuggestionsForDeck()
   ```

3. **Beatport Enrichment Flow**
   ```typescript
   // Should test:
   // beatportStore.getBeatportData()
   // → tracksStore.updateTrack()
   ```

**Example Integration Test**:

```typescript
describe('Record Import Integration', () => {
	it('imports records and updates all stores', async () => {
		const discogs = useDiscogsStore()
		const records = useRecordsStore()
		const tracks = useTracksStore()

		// Setup mock data
		discogs.releasesToImport = [mockRelease]

		// Perform import
		await discogs.importSelectedReleases()

		// Verify all stores updated
		expect(records.fetchAllRecords).toHaveBeenCalled()
		expect(tracks.fetchAllTracks).toHaveBeenCalled()
	})
})
```

---

## Testing Infrastructure Improvements

### INFRA-001: Add Component Testing Environment

**Current**: vitest.config.ts has Nuxt environment commented out.

**Required Changes**:

```typescript
// vitest.config.ts
export default defineConfig({
	test: {
		projects: [
			// ... existing projects
			{
				name: 'components',
				include: ['app/components/**/*.test.ts'],
				environment: 'nuxt',
				setupFiles: ['./test/setup-components.ts']
			}
		]
	}
})
```

**Setup File**:

```typescript
// test/setup-components.ts
import { createTestingPinia } from '@pinia/testing'
import { config } from '@vue/test-utils'

config.global.plugins = [createTestingPinia()]
config.global.stubs = {
	NuxtLink: true,
	ClientOnly: true
}
```

### INFRA-002: Add E2E Testing

**Recommendation**: Add Playwright for critical user flows.

**Priority Flows**:

1. Login → Dashboard → Browse records
2. Import records from Discogs
3. Create crate → Add records
4. Start session → Load tracks → Play

```typescript
// e2e/import-records.spec.ts
import { expect, test } from '@playwright/test'

test('import records from Discogs', async ({ page }) => {
	await page.goto('/login')
	await page.fill('[name="email"]', 'test@example.com')
	await page.fill('[name="password"]', 'password')
	await page.click('button[type="submit"]')

	await page.waitForURL('/records')
	await page.click('text=Import from Discogs')

	// ... rest of flow
})
```

---

## Test Quality Improvements

### QUAL-001: Add Snapshot Testing for Complex Components

```typescript
// CardRecord.test.ts
it('renders correctly with full record data', () => {
	const wrapper = mount(CardRecord, { props: { record: fullMockRecord } })
	expect(wrapper.html()).toMatchSnapshot()
})
```

### QUAL-002: Add Coverage Reporting

```typescript
// vitest.config.ts
export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			exclude: ['**/*.test.ts', 'test/**']
		}
	}
})
```

### QUAL-003: Add Test Data Factories

**Current**: `test/mocks/fixtures/` has basic factories.

**Improvements**:

```typescript
// test/factories/index.ts
import { faker } from '@faker-js/faker'

export function createRecord(
	overrides?: Partial<DatabaseRecord>
): DatabaseRecord {
	return {
		id: faker.string.uuid(),
		user_id: faker.string.uuid(),
		title: faker.music.songName(),
		artists: [
			{ name: faker.person.fullName(), discogs_id: faker.number.int() }
		],
		year: faker.date.past({ years: 50 }).getFullYear(),
		created_at: faker.date.recent().toISOString(),
		...overrides
	}
}

export function createTrack(overrides?: Partial<Track>): Track {
	return {
		id: faker.string.uuid(),
		record_id: faker.string.uuid(),
		title: faker.music.songName(),
		bpm: faker.number.int({ min: 80, max: 180 }),
		key: faker.number.int({ min: 0, max: 23 }),
		...overrides
	}
}
```

---

## Implementation Roadmap

### Phase 1: Critical Coverage (Week 1-2)

- [ ] Add Beatport API endpoint tests
- [ ] Add tests for 3 untested stores
- [ ] Add component testing infrastructure

### Phase 2: Component Testing (Week 2-4)

- [ ] Test top 10 critical components
- [ ] Add snapshot tests for cards/dialogs

### Phase 3: Integration Testing (Week 4-6)

- [ ] Multi-store integration tests
- [ ] User flow integration tests

### Phase 4: E2E Testing (Week 6-8)

- [ ] Add Playwright
- [ ] Test critical user journeys

### Target Coverage

- **Stores**: 100% (11/11)
- **Composables**: 100% (6/6)
- **Utilities**: 80% (12/15)
- **Components**: 30% (55/184 critical ones)
- **Integration**: Key flows covered
- **E2E**: 5 critical journeys

---

## Quick Win Tests

These can be added immediately with minimal effort:

1. **typeGuards.ts tests** (~10 tests, 30 min)
2. **cn.ts tests** (~5 tests, 15 min)
3. **discogs-formatting.ts tests** (~10 tests, 30 min)
4. **recordDetailsStore tests** (~20 tests, 1 hour)
5. **trackEditStore tests** (~10 tests, 30 min)

**Total Effort**: ~3 hours for ~55 additional tests
