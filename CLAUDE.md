# CLAUDE.md - Crate Guide

## Project Overview

**Crate Guide** is a DJ vinyl record management application that helps DJs catalog their record collection, organize crates for gigs, track DJ sessions, and discover compatible tracks by BPM/key for harmonic mixing.

**Live Site:** https://crate.guide  
**Author:** Ryan Voitiskis  
**License:** MIT

## Technical Stack

### Frontend

- **Framework:** Nuxt 4 (SSR disabled) with Vue 3 Composition API
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + shadcn-vue (reka-ui components)
- **State Management:** Pinia stores
- **Forms:** VeeValidate with Zod schemas
- **Icons:** Lucide Vue
- **Toasts:** vue-sonner
- **Tables:** @tanstack/vue-table
- **Drag & Drop:** sortablejs

### Backend

- **Platform:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **APIs:** Discogs API, Beatport (scraped metadata)
- **Local Dev:** Supabase local stack

### Build Tools

- **Node:** v22.18.0
- **NPM:** 11.5.2
- **Formatting:** Prettier with import sorting

## Project Structure

```
crate-guide/
├── app/
│   ├── components/      # Vue components (auto-imported)
│   │   ├── crates/      # Crate-related components
│   │   ├── records/     # Record-related components
│   │   ├── tracks/      # Track-related components
│   │   ├── session/     # DJ session components
│   │   ├── import/      # Import flow components
│   │   ├── layout/      # Layout components (nav, sidebar)
│   │   ├── settings/    # Settings page components
│   │   ├── shared/      # Shared dialogs/components
│   │   ├── turntable/   # Turntable visualization
│   │   ├── icons/       # Icon components (IconPrefix)
│   │   ├── notices/     # Notice components (NoticePrefix)
│   │   ├── ui/          # shadcn-vue components
│   │   └── utils/       # Utility components
│   ├── composables/     # Vue composables (auto-imported)
│   ├── layouts/         # Nuxt layouts
│   ├── pages/           # Route pages
│   ├── stores/          # Pinia stores (auto-imported)
│   └── utils/           # Utility functions (auto-imported)
│       ├── schemas/     # Zod validation schemas
│       └── beatport/    # Beatport scraping utilities
├── server/
│   └── api/             # Nitro API endpoints
├── shared/
│   └── types/           # TypeScript types (auto-imported)
│       ├── database.ts  # Supabase generated types
│       ├── discogs.ts   # Discogs API types
│       ├── options.ts   # App options/enums
│       └── supabase.ts  # Supabase client types
├── supabase/
│   ├── functions/       # Edge Functions
│   └── migrations/      # Database migrations
└── public/              # Static assets
```

## Auto-Imports

The following are auto-imported—never manually import these:

- **Vue:** `ref`, `computed`, `reactive`, `watch`, `watchEffect`, `onMounted`, `onUnmounted`, `defineProps`, `defineEmits`, etc.
- **Nuxt:** `navigateTo`, `useRoute`, `useRouter`, `useState`, `useFetch`, `$fetch`, `useSupabaseClient`, `useSupabaseUser`, etc.
- **Project:** Components, stores, composables, utils, and types from their respective directories

## Conventions

### Component Naming

Type-first PascalCase: `DialogUserSettings.vue`, `CardRecord.vue`, `ButtonPrimary.vue`

### Styling

Tailwind utility classes only—no `@apply`, no `<style>` blocks. Use design tokens: `bg-background`, `text-foreground`, `border-border`.

### Component Structure

```vue
<script setup lang="ts">
import { toast } from 'vue-sonner'

const props = defineProps<{
	records: DatabaseRecord[]
	isLoading?: boolean
}>()

const emit = defineEmits<{
	update: [record: DatabaseRecord]
}>()

const searchQuery = ref('')

const filteredRecords = computed(() =>
	props.records.filter((r) =>
		r.title.toLowerCase().includes(searchQuery.value.toLowerCase())
	)
)

async function handleSave() {
	try {
		// Implementation
		toast.success('Record saved')
	} catch (error) {
		console.error('Save failed:', error)
		toast.error('Failed to save record')
	}
}

onMounted(() => {
	// Setup
})
</script>

<template>
	<div class="space-y-4">
		<!-- Content -->
	</div>
</template>
```

### Pinia Stores

```typescript
import { toast } from 'vue-sonner'

export const useRecordsStore = defineStore('records', () => {
	const records = ref<DatabaseRecord[]>([])
	const isLoading = ref(false)
	const error = ref<string | null>(null)

	// Search state
	const searchQuery = ref('')
	const searchResults = ref<DatabaseRecord[]>([])
	const isSearching = ref(false)

	const recordCount = computed(() => records.value.length)
	const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
	const displayedRecords = computed(() =>
		hasSearchQuery.value ? searchResults.value : records.value
	)

	async function fetchRecords() {
		const supabase = useSupabaseClient<Database>()
		isLoading.value = true
		error.value = null

		try {
			const { data, error: fetchError } = await supabase
				.from('records')
				.select('*')
				.order('created_at', { ascending: false })

			if (fetchError) throw fetchError
			records.value = data || []
		} catch (err) {
			error.value = err.message
			toast.error('Failed to load records')
		} finally {
			isLoading.value = false
		}
	}

	return {
		records,
		isLoading,
		error,
		recordCount,
		fetchRecords,
		// Expose search state as readonly to prevent external mutation
		searchQuery: readonly(searchQuery),
		searchResults: readonly(searchResults),
		isSearching: readonly(isSearching),
		displayedRecords
	}
})
```

### Optimistic Updates

For responsive UX, update local state immediately then sync with server:

```typescript
async function updateCrate(id: string, updates: Partial<Crate>) {
	const crateIndex = crates.value.findIndex((c) => c.id === id)
	if (crateIndex === -1) return

	// Store original for rollback
	const originalCrate = crates.value[crateIndex]

	// Optimistic update
	crates.value[crateIndex] = { ...originalCrate, ...updates } as Crate

	try {
		const { data, error } = await supabase
			.from('crates')
			.update(updates)
			.eq('id', id)
			.select()
			.single()

		if (error) throw error
		crates.value[crateIndex] = data as Crate
	} catch (error) {
		// Rollback on failure
		crates.value[crateIndex] = originalCrate
		toast.error('Failed to update crate')
	}
}
```

### Form Validation

```typescript
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { z } from 'zod'

const formSchema = toTypedSchema(
	z.object({
		title: z.string().min(1, 'Title is required'),
		artist: z.string().min(1, 'Artist is required'),
		bpm: z.number().min(60).max(200).optional()
	})
)

const { handleSubmit, errors, defineField } = useForm({
	validationSchema: formSchema
})
```

### Form Validation UX

**Edit forms (modifying existing data):** Disable submit when invalid.

- User is editing known-valid data, immediate feedback is helpful
- Example: DialogRecordDetails, DialogTrackDetails, DialogCrateDetails (edit mode)

**Create forms (new data entry):** Allow submit, show errors after first attempt.

- User hasn't had chance to fill form yet
- Uses `showValidationErrors` ref pattern
- Example: DialogTrackEdit, DialogCrateForm

### Store-Based Alert Dialog Pattern

Alert/confirmation dialogs that can be triggered from multiple places should use store state rather than props. This pattern:

- Keeps triggering components simple (just set store state)
- Centralizes dialog logic
- Makes it easy to close dialogs from anywhere (e.g., after successful operation)

**Implementation:**

```typescript
// In store
const itemToDelete = ref<Item | null>(null)

// In alert component
const item = computed(() => store.itemToDelete)
const isOpen = computed(() => !!item.value)

function handleDelete() {
	// perform delete
	store.itemToDelete = null
}
```

**Usage:**

```vue
<!-- Triggering component - just set store state -->
<Button @click="store.itemToDelete = item">Delete</Button>

<!-- Alert component uses computed isOpen -->
<AlertDialog v-model:open="isOpen">...</AlertDialog>
```

**Examples:** AlertConfirmDeleteTrack, AlertConfirmDeleteCrate, AlertConfirmRemoveRecord

### Toast with Undo Action

For destructive but recoverable actions, show a toast with an undo option:

```typescript
import { toast } from 'vue-sonner'

const success = await cratesStore.removeRecordFromCrate(crateId, recordId)

if (success) {
	toast(`${recordTitle} removed from crate`, {
		id: 'crate-record-removed',
		duration: 5000,
		action: {
			label: 'Undo',
			onClick: () => {
				cratesStore.addRecordToCrate(crateId, recordId, { silent: true })
			}
		}
	})
}
```

## Domain Context

### Key Entities

- **Records:** Vinyl records with Discogs metadata
- **Crates:** Collections for specific gigs/sets
- **Sessions:** DJ performance tracking
- **Tracks:** Individual songs on records
- **BPM/Key:** For harmonic mixing compatibility

## Development

```bash
npm run dev:all      # Full environment (Nuxt + Supabase)
npm run dev          # Nuxt only
npm run supa:start   # Start Supabase
npm run supa:stop    # Stop Supabase
npm run format       # Prettier
npm run genTypes     # Generate DB types
npm run build        # Production build
```

### Environment Variables

```
SUPABASE_URL
SUPABASE_ANON_KEY
DISCOGS_KEY
DISCOGS_SECRET
```

## Communication

Be direct and technical. Skip excessive explanation.
