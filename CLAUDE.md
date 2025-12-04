# CLAUDE.md - Crate Guide v2

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

### Backend
- **Platform:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **APIs:** Discogs API for music metadata
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
│   │   ├── icons/       # Icon components (IconPrefix)
│   │   ├── notices/     # Notice components (NoticePrefix)
│   │   └── ui/          # shadcn-vue components
│   ├── composables/     # Vue composables (auto-imported)
│   ├── layouts/         # Nuxt layouts
│   ├── pages/           # Route pages
│   ├── stores/          # Pinia stores (auto-imported)
│   └── utils/           # Utility functions (auto-imported)
├── server/
│   └── api/             # Nitro API endpoints
├── shared/
│   └── types/           # TypeScript types (auto-imported)
│       ├── database.ts  # Supabase generated types
│       ├── discogs.ts   # Discogs API types
│       └── supabase.ts  # Supabase client types
├── supabase/
│   ├── functions/       # Edge Functions
│   └── migrations/      # Database migrations
└── public/              # Static assets
```

## Auto-Import Configuration

The following are **auto-imported** - NEVER manually import these:

### Vue & Nuxt
- Vue: `ref`, `computed`, `reactive`, `watch`, `watchEffect`, `onMounted`, `onUnmounted`, `defineProps`, `defineEmits`, etc.
- Nuxt: `navigateTo`, `useRoute`, `useRouter`, `useState`, `useFetch`, `$fetch`, `useSupabaseClient`, etc.

### Project Files
- Components: `~/components/**` (no prefix except icons and notices)
- Icons: `~/components/icons/**` (IconPrefix)
- Notices: `~/components/notices/**` (NoticePrefix)
- UI: `~/components/ui/**` (shadcn-vue components)
- Stores: `~/stores/**`
- Composables: `~/composables/**`
- Utils: `~/utils/**`
- Types: `~/shared/types/**`

## Component Standards

### Naming Convention
Use **Type-first PascalCase** for component names:

✅ **Correct:**
- `DialogUserSettings.vue`
- `CardRecord.vue`
- `ButtonPrimary.vue`
- `InputPassword.vue`
- `TableRecords.vue`

❌ **Incorrect:**
- `UserSettingsDialog.vue`
- `RecordCard.vue`
- `PrimaryButton.vue`

### Component Template

```vue
<script setup lang="ts">
// Props with TypeScript interface
const props = defineProps<{
  records: Record[]
  isLoading?: boolean
}>()

// Emits with TypeScript interface
const emit = defineEmits<{
  update: [record: Record]
  delete: [id: string]
}>()

// Reactive state
const searchQuery = ref('')
const selectedRecords = ref<Record[]>([])

// Computed properties
const filteredRecords = computed(() => 
  props.records.filter(r => 
    r.title.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
)

// Methods with proper error handling
async function handleSave() {
  const { toast } = useToast()
  
  try {
    // Implementation
    toast.success('Record saved')
  } catch (error) {
    console.error('Save failed:', error)
    toast.error('Failed to save record')
  }
}

// Lifecycle hooks at the end
onMounted(() => {
  // Setup logic
})
</script>

<template>
  <div class="space-y-4">
    <!-- Template content -->
  </div>
</template>
```

## Styling Guidelines

### Tailwind CSS Only
- **Use only Tailwind utility classes** - no `@apply`, no `<style>` blocks
- **Inline styles only for dynamic values:** `:style="{ width: `${progress}%` }"`
- **Use design tokens:** `bg-background`, `text-foreground`, `border-border`
- **Responsive design:** Use Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`)

### Common Patterns
```vue
<!-- Card container -->
<div class="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">

<!-- Form input group -->
<div class="space-y-2">
  <Label for="title">Title</Label>
  <Input id="title" v-model="title" />
</div>

<!-- Button variants -->
<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Delete</Button>
```

## Pinia Store Pattern

```typescript
export const useRecordsStore = defineStore('records', () => {
  // State
  const records = ref<Record[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // Getters
  const recordCount = computed(() => records.value.length)
  const sortedRecords = computed(() => 
    [...records.value].sort((a, b) => a.title.localeCompare(b.title))
  )
  
  // Actions
  async function fetchRecords() {
    const supabase = useSupabaseClient()
    const { toast } = useToast()
    
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
      console.error('Fetch records error:', err)
    } finally {
      isLoading.value = false
    }
  }
  
  async function addRecord(record: NewRecord) {
    // Implementation
  }
  
  async function updateRecord(id: string, updates: Partial<Record>) {
    // Implementation
  }
  
  async function deleteRecord(id: string) {
    // Implementation
  }
  
  return {
    // State
    records,
    isLoading,
    error,
    // Getters
    recordCount,
    sortedRecords,
    // Actions
    fetchRecords,
    addRecord,
    updateRecord,
    deleteRecord
  }
})
```

## Dialog/Modal Pattern

```vue
<script setup lang="ts">
const showEditDialog = ref(false)
const editingRecord = ref<Record | null>(null)

function openEditDialog(record: Record) {
  editingRecord.value = record
  showEditDialog.value = true
}

async function handleSave() {
  // Save logic
  showEditDialog.value = false
  editingRecord.value = null
}
</script>

<template>
  <Button @click="openEditDialog(record)">Edit</Button>
  
  <Dialog v-model:open="showEditDialog">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Record</DialogTitle>
        <DialogDescription>
          Update the record information below
        </DialogDescription>
      </DialogHeader>
      
      <div class="space-y-4 py-4">
        <!-- Form content -->
      </div>
      
      <DialogFooter>
        <Button 
          variant="outline" 
          @click="showEditDialog = false"
        >
          Cancel
        </Button>
        <Button @click="handleSave">
          Save Changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

## Form Validation Pattern

```vue
<script setup lang="ts">
import { z } from 'zod'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

const formSchema = toTypedSchema(z.object({
  title: z.string().min(1, 'Title is required'),
  artist: z.string().min(1, 'Artist is required'),
  year: z.number().min(1900).max(new Date().getFullYear()),
  bpm: z.number().min(60).max(200).optional(),
  key: z.string().optional()
}))

const { handleSubmit, errors, defineField, isSubmitting } = useForm({
  validationSchema: formSchema
})

const [title, titleAttrs] = defineField('title')
const [artist, artistAttrs] = defineField('artist')

const onSubmit = handleSubmit(async (values) => {
  try {
    // Submit logic
  } catch (error) {
    console.error('Submit error:', error)
  }
})
</script>
```

## Supabase Integration

```typescript
// Fetching data
const supabase = useSupabaseClient()

// Simple query
const { data, error } = await supabase
  .from('records')
  .select('*')
  .eq('user_id', userId)

// With joins
const { data, error } = await supabase
  .from('records')
  .select(`
    *,
    artist:artists(name),
    tracks:record_tracks(*)
  `)
  .order('created_at', { ascending: false })

// Insert
const { data, error } = await supabase
  .from('records')
  .insert({ title, artist_id })
  .select()
  .single()

// Update
const { error } = await supabase
  .from('records')
  .update({ title })
  .eq('id', recordId)

// Delete
const { error } = await supabase
  .from('records')
  .delete()
  .eq('id', recordId)

// Realtime subscription
const channel = supabase
  .channel('records-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'records' },
    (payload) => {
      console.log('Change received:', payload)
    }
  )
  .subscribe()
```

## Error Handling Standards

```typescript
// API/Database operations
try {
  const result = await riskyOperation()
  // Success handling
} catch (error) {
  // Log for debugging (development only)
  if (process.dev) {
    console.error('Operation failed:', error)
  }
  
  // User feedback
  const { toast } = useToast()
  toast.error('Something went wrong. Please try again.')
  
  // Optional: Report to error tracking
  // captureException(error)
}

// Form submissions
const onSubmit = handleSubmit(async (values) => {
  try {
    await saveRecord(values)
    toast.success('Record saved successfully')
    navigateTo('/records')
  } catch (error) {
    toast.error('Failed to save record')
    // Don't navigate away on error
  }
})
```

## Domain-Specific Context

### Key Entities
- **Records:** Vinyl records with metadata from Discogs
- **Crates:** Collections of records for specific gigs/sets
- **Sessions:** DJ performance tracking
- **Tracks:** Individual songs on records
- **BPM/Key:** For harmonic mixing compatibility

### Common Operations
- Searching/browsing record collection
- Creating and organizing crates
- Finding compatible tracks by BPM/key
- Importing records from Discogs
- Tracking play history in sessions

## Development Workflow

### Commands
```bash
# Full development environment (recommended)
npm run dev:all

# Individual services
npm run dev              # Nuxt only
npm run supa:start       # Start Supabase
npm run supa:functions   # Edge Functions only
npm run supa:stop        # Stop Supabase

# Code quality
npm run format           # Format with Prettier
npm run genTypes         # Generate TypeScript types from DB

# Deployment
npm run build            # Production build
```

### Environment Variables
Required in `.env`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DISCOGS_KEY`
- `DISCOGS_SECRET`

## Collaboration with Ryan

### Communication Style
- **Be direct and technical** - Skip excessive explanations
- **Show code examples** - Demonstrate with actual implementations
- **Propose incrementally** - Break changes into reviewable steps
- **Present trade-offs** - Show pros/cons of different approaches

### Decision Points - ASK FIRST
- Creating new Pinia stores or major state changes
- Database schema modifications
- New composables or utilities
- Architectural patterns not shown here
- Significant refactoring approaches
- External API integrations
- Authentication/authorization changes

### Implement Directly
- New components following established patterns
- Bug fixes and error handling improvements
- UI/UX enhancements within existing designs
- Form validation
- Splitting large components
- Adding TypeScript types
- Performance optimizations

### Quality Expectations
Ryan values:
- **Clean code** over clever abstractions
- **Type safety** - proper TypeScript everywhere
- **Consistent patterns** - follow existing conventions
- **Complete error handling** - no unhandled promises
- **No dead code** - remove unused imports/variables
- **Meaningful commits** - clear, atomic changes

### Common Feedback Patterns
Expect questions like:
- "Can we simplify this further?"
- "What's the error handling strategy here?"
- "Should this be in a store or component?"
- "Have you tested edge cases?"

## Anti-Patterns to Avoid

❌ **Never do these:**
- Manual imports of auto-imported items
- Console.log in production code (use proper error handling)
- Inline styles for static values
- Missing TypeScript types
- Unhandled async errors
- Nested ternaries beyond 2 levels
- Direct DOM manipulation
- Global state outside Pinia
- Hardcoded API keys or secrets
- Components over 200 lines

## Quick Reference

### Common Imports (when needed)
```typescript
import { z } from 'zod'
import type { Database } from '~/shared/types/database'
import type { DiscogsRelease } from '~/shared/types/discogs'
```

### Toast Messages
```typescript
const { toast } = useToast()

toast.success('Action completed')
toast.error('Something went wrong')
toast.info('Please note...')
toast.warning('Are you sure?')
```

### Navigation
```typescript
// Programmatic navigation
await navigateTo('/records')
await navigateTo({ path: '/records', query: { page: 2 } })

// With loading state
const router = useRouter()
isNavigating.value = true
await router.push('/records')
isNavigating.value = false
```

### Authentication Check
```typescript
const user = useSupabaseUser()

if (!user.value) {
  await navigateTo('/login')
  return
}
```

---

**Remember:** When in doubt, ask for clarification rather than making assumptions. Ryan appreciates thoughtful questions about approach before implementation.
