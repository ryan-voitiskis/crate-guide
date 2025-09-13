# CLAUDE.md - Crate Guide v2

## Context

DJ vinyl record management system. Users catalog records, organize crates for gigs, track DJ sessions, and discover records by BPM/key for harmonic mixing.

## Stack

- Nuxt 4 (SSR disabled), Vue 3 Composition API, TypeScript
- shadcn-vue (reka-ui), Tailwind v4, Pinia
- Supabase, Discogs API integration

## Auto-imports (Never import these)

- Vue: ref, computed, defineProps, onMounted, watch, etc.
- Components: ~/components (no prefix), ~/components/icons (Icon prefix), ~/components/notices (Notice prefix)
- shadcn-vue: all UI components from ~/components/ui
- Custom: shared/types/_, stores/_, utils/\*
- Nuxt: navigateTo, useRoute, useRouter, useState, etc.

## Component Rules

### Naming: Type-first PascalCase

✅ DialogUserSettings, CardRecord, ButtonPrimary, InputPassword
❌ UserSettingsDialog, RecordCard, PrimaryButton

### Structure

```vue
<script setup lang="ts">
// Props/emits first
const props = defineProps<{ items: Item[] }>()
const emit = defineEmits<{ update: [value: string] }>()

// State
const isLoading = ref(false)

// Computed
const hasItems = computed(() => props.items.length > 0)

// Functions
async function handleSubmit() {
	isLoading.value = true
	try {
		// logic
	} catch (error) {
		toast.error('Failed')
	} finally {
		isLoading.value = false
	}
}

// Lifecycle last
onMounted(() => {})
</script>

<template>
	<!-- template -->
</template>
```

### Key Patterns

- Always use `<script setup lang="ts">`
- TypeScript for all props, emits, refs
- Try/catch/finally for async operations
- Descriptive loading states: isLoadingRecords, isSaving
- Split large components into smaller ones
- NO console.log unless debugging

## Styling Rules

- **Only Tailwind classes** - never @apply, never style blocks
- Inline styles ONLY for JS dynamic values: `:style="{ color: dynamicColor }"`
- Use design tokens: bg-background, text-foreground, border-border
- Multi-line ternaries OK unless very complex

## Pinia Stores

```typescript
export const useRecordsStore = defineStore('records', () => {
	// State
	const records = ref<Record[]>([])
	const isLoading = ref(false)

	// Computed
	const recordCount = computed(() => records.value.length)

	// Actions
	async function fetchRecords() {
		isLoading.value = true
		try {
			const { data } = await $fetch('/api/records')
			records.value = data || []
		} catch (error) {
			toast.error('Failed to load records')
		} finally {
			isLoading.value = false
		}
	}

	return { records, isLoading, recordCount, fetchRecords }
})
```

## Dialog Pattern

```vue
<template>
	<Button @click="showDialog = true">Open</Button>

	<Dialog v-model:open="showDialog">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Title</DialogTitle>
			</DialogHeader>
			<!-- content -->
			<DialogFooter>
				<Button @click="showDialog = false" variant="outline">Cancel</Button>
				<Button @click="handleConfirm">Confirm</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
```

## Collaboration Guidelines

### Working Style

Ryan prefers **incremental improvements** over large rewrites. Propose changes in logical steps that can be reviewed and refined. He values **pragmatic solutions** over clever abstractions and will often suggest cleaner implementations.

### Decision Making

- **Always ask before architectural decisions** - Ryan has strong technical judgment and will catch issues early
- **Present options with trade-offs** - He appreciates seeing multiple approaches with pros/cons
- **Expect feedback and iteration** - Ryan reviews code carefully and will suggest improvements
- **Be direct and efficient** - No need for excessive explanation; focus on the technical details

### Quality Focus

Ryan is **quality-oriented** and will want to address:
- Unused variables and imports
- TODO comments and technical debt
- Type safety improvements
- Code cleanup opportunities

Expect questions like "Can we clean this up further?" or "What else needs attention?"

### Error Handling

Ryan **catches mistakes quickly** and will point out:
- Missing exports or broken functionality
- Inconsistent patterns
- Edge cases in logic
- TypeScript errors

Don't take corrections personally - use them as learning opportunities for better code.

## ASK BEFORE

- Creating new Pinia stores
- State location decisions (unsure → ask)
- Creating composables for shared logic
- Database structure changes
- Data fetching strategy (SSR/client/store)
- Any architectural patterns not shown here
- **Any significant refactoring approach**
- **Store vs component state decisions**

## IMPLEMENT DIRECTLY

- New components following patterns above
- Component props/emits modifications
- Supabase queries in components/stores
- Bug fixes and error handling
- Splitting large components
- Form validation
- Styling adjustments

## Anti-patterns

- Manual imports of auto-imported items
- Complex nested component structures
- Inline styles for static values
- Missing TypeScript types
- Unhandled async errors
- Console.log in production code

Don't begin to implement changes or generate extensive examples until we agree on a strategy. **Always consult Ryan on approach before implementing.**
