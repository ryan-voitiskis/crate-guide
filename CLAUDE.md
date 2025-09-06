# CLAUDE.md - Crate Guide v2 Development Guide

## Domain Context & Business Logic

Crate Guide is a DJ-focused vinyl record management system with these core concepts:

### Key Entities

- **Records**: Physical vinyl with metadata (artist, title, genre, BPM, key, etc.)
- **Crates**: Organized collections of records for specific purposes/gigs
- **Sessions**: DJ sets with tracklists and performance notes
- **Collection**: User's complete record library with import from Discogs

### User Workflows

- **Collection Management**: Import from Discogs, catalog personal records
- **Crate Preparation**: Create themed collections for gigs
- **Session Tracking**: Log DJ sets, track what works well together
- **Discovery**: Find records by genre, BPM, harmonic key for mixing

This context should inform all UI/UX decisions and component design.

Built with Nuxt 4, Pinia, Supabase, shadcn-vue (reka-ui), and Tailwind v4.

## Technology Stack

- **Frontend**: Vue 3 with Composition API, Nuxt 4
- **UI**: shadcn-vue (reka-ui, not radix), Tailwind v4
- **State Management**: Pinia
- **Backend**: Supabase
- **Integration**: Discogs API for record importing

## Vue Component Patterns & Composition API

### Component Naming Convention

**CRITICAL**: Use type-first PascalCase: `[ComponentType][Context][Specifics]`

✅ **Correct:**

- `DialogUserSettings` - Dialog for user settings
- `CardProductSummary` - Card showing product summary
- `ButtonPrimaryAction` - Primary action button
- `InputPassword` - Password input field

❌ **Incorrect:**

- `UserSettingsDialog`
- `ProductSummaryCard`
- `PrimaryActionButton`

### Composition API Standards

Always use `<script setup>` syntax with this organization:

```vue
<script setup lang="ts">
// 1. Imports → 2. Props/Emits → 3. State → 4. Computed → 5. Functions → 6. Lifecycle

const props = defineProps<{ items: Item[] }>()
const emit = defineEmits<{ update: [value: string] }>()

const selectedItem = ref<Item | null>(null)
const filteredItems = computed(() => props.items.filter((item) => item.visible))

async function handleSubmit() {
	try {
		// logic here
	} catch (error) {
		toast.error('Operation failed')
	}
}

onMounted(() => {
	// initialization
})
</script>
```

### Component Guidelines

- Use TypeScript with proper typing
- Avoid complex nested structures - prefer composition
- No inline styles except for dynamic values

## State Management with Pinia

### Store Structure

```typescript
export const useMyStore = defineStore('storeName', () => {
	// 1. Dependencies → 2. State → 3. Computed → 4. Actions → 5. Return
	const api = useMyApi()

	const items = ref<Item[]>([])
	const isLoading = ref(false)

	const hasItems = computed(() => items.value.length > 0)

	async function fetchItems() {
		isLoading.value = true
		try {
			const data = await api.getItems()
			items.value = data.items || []
		} catch (error) {
			toast.error('Error fetching items.')
		} finally {
			isLoading.value = false
		}
	}

	return { items, isLoading, hasItems, fetchItems }
})
```

### Error Handling & Loading States

- Use descriptive loading names: `isLoadingFolders`, `isProcessing`, `isSaving`
- Always use try/finally for loading cleanup
- Use type guards for error handling: `isError(error) ? error.message : 'Unknown error'`

## shadcn-vue UI Components

### Dialog Patterns

```vue
<template>
	<!-- Trigger can be anywhere in your UI -->
	<Button @click="showDialog = true" variant="secondary">Open Dialog</Button>

	<!-- Dialog content separate -->
	<Dialog v-model:open="showDialog">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Dialog Title</DialogTitle>
				<DialogDescription>Description text here</DialogDescription>
			</DialogHeader>

			<!-- Content -->

			<DialogFooter>
				<Button @click="showDialog = false" variant="secondary">Cancel</Button>
				<Button @click="handleConfirm" :loading="isProcessing">Confirm</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
```

**Guidelines:**

- **Simple Dialogs**: Separate trigger from content, use direct `v-model:open` binding
- **Complex Dialogs**: Create dedicated composables for dialog logic and state
- **Reusable Dialogs**: Build dedicated dialog components with props/emits

### Button Patterns

```vue
<template>
	<!-- Loading states -->
	<Button :loading="isSubmitting" @click="handleSubmit">Submit</Button>

	<!-- Disabled states with proper conditions -->
	<Button :disabled="!canSubmit || isProcessing">Process</Button>

	<!-- Variants -->
	<Button variant="secondary">Secondary</Button>
	<Button variant="destructive">Delete</Button>
	<Button variant="outline">Outline</Button>
</template>
```

## Styling with Tailwind v4

### Core Principles

- **Always use Tailwind utility classes directly in HTML** - Never use `@apply` directives
- Use design system colors: `bg-background`, `text-foreground`, `border-border`
- Inline styles only for dynamic JavaScript values
- Leverage Tailwind v4's improved CSS variables and container queries
- Prefer utility-first approach over custom CSS classes

### Dynamic Styling Example

```vue
<script setup lang="ts">
const dynamicColor = computed(() => `hsl(${hue.value}, 70%, 50%)`)
const isActive = ref(false)
</script>

<template>
	<!-- ✅ Good: Dynamic value as inline style -->
	<div :style="{ backgroundColor: dynamicColor }" class="rounded-lg p-4">
		Content
	</div>

	<!-- ✅ Good: Conditional classes -->
	<div
		:class="[
			'rounded-lg p-4 transition-colors',
			isActive
				? 'bg-primary text-primary-foreground'
				: 'bg-muted text-muted-foreground'
		]"
	>
		Content
	</div>

	<!-- ❌ Bad: Static styles inline -->
	<div style="padding: 1rem; background-color: red;">Content</div>

	<!-- ✅ Good: Static styles with Tailwind -->
	<div class="rounded-lg bg-red-500 p-4">Content</div>
</template>
```

### Tailwind v4 Specific Features

- **CSS Variables**: Use semantic color tokens (`bg-primary`, `text-foreground`)
- **Container Queries**: Use `@container` and `@md:`, `@lg:` prefixes
- **Improved Dark Mode**: Automatic CSS variable switching
- **Custom Properties**: Leverage CSS custom properties for dynamic values

```vue
<template>
	<!-- ✅ Good: Using v4 features -->
	<div
		class="bg-card dark:bg-card @container rounded-lg supports-[container-type:inline-size]:@md:flex"
	>
		<div class="p-4 @md:flex-1">Content</div>
	</div>
</template>
```

## Code Quality Standards

- **TypeScript**: Explicit types for all props, refs, function parameters, and return values
- **Error Handling**: Try-catch blocks for all async operations
- **Comments**: Minimal - only when code cannot be self-documenting
- **Function Length**: Max 30-40 lines, extract when complex
- **Performance**: Focus on code clarity over micro-optimizations
- **Accessibility**: Semantic HTML, alt tags, basic keyboard support
- **Console Logging**: Avoid unnecessary logging. Only log for debugging

## Development Workflow & Architectural Decisions

**Ask First About:**

- Component structure decisions
- State organization (component vs. composable vs. store)
- Data relationships and API design
- New interaction patterns

**Implement Directly:**

- Bug fixes following established patterns
- New components using existing conventions
- Styling adjustments
- Form validation

**Process:**

1. Read existing code to understand current patterns
2. Use established conventions from similar components
3. You must ask about architecture rather than assume

This is an active project with established patterns. When in doubt, follow existing code examples and ask for clarification.
