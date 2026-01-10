# Refactor: Crate Management Components

## Overview

The Phase 1 crate management implementation is functional but introduced some technical debt. This document outlines specific improvements to align the new code with existing codebase quality standards.

## Priority 1: Extract Shared Schema

### Problem

`DialogCrateDetails.vue` and `DialogCrateForm.vue` both define identical `crateSchema`:

```typescript
const crateSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(50, 'Name is too long')
		.trim(),
	description: z.string().max(100, 'Description is too long').optional()
})
```

### Solution

Create `app/utils/schemas/crate.ts`:

```typescript
import { z } from 'zod'

export const crateSchema = z.object({
	name: z
		.string()
		.min(1, 'Name is required')
		.max(50, 'Name is too long')
		.trim(),
	description: z.string().max(100, 'Description is too long').optional()
})

export type CrateFormValues = z.infer<typeof crateSchema>
```

Then import in both components. This is auto-imported so just use `crateSchema` directly.

**Reference:** Check if similar patterns exist elsewhere. If not, this establishes the pattern for future schemas.

---

## Priority 2: Extract ListCrateRecords Component

### Problem

`DialogCrateDetails.vue` is ~400 lines and handles too many concerns. The PRD specified a `ListCrateRecords.vue` component that was never created.

### Solution

Extract `app/components/crates/ListCrateRecords.vue`:

```vue
<script setup lang="ts">
import { ImageOff, X } from 'lucide-vue-next'

const props = defineProps<{
	records: DatabaseRecord[]
}>()

const emit = defineEmits<{
	remove: [recordId: string]
}>()
</script>

<template>
	<div class="space-y-2">
		<div
			v-for="record in records"
			:key="record.id"
			class="bg-card hover:bg-accent group flex items-center gap-3 rounded-lg border p-2 transition-colors"
		>
			<!-- Cover -->
			<div
				class="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-cover bg-center"
				:style="
					record.cover ? { backgroundImage: `url('${record.cover}')` } : {}
				"
			>
				<ImageOff v-if="!record.cover" class="text-muted-foreground size-4" />
			</div>

			<!-- Info -->
			<div class="min-w-0 flex-1">
				<p class="text-foreground truncate text-sm font-medium">
					{{ record.title }}
				</p>
				<p class="text-muted-foreground truncate text-xs">
					{{ record.artists.map((a) => a.name).join(', ') }}
				</p>
				<div class="text-muted-foreground flex items-center gap-2 text-xs">
					<span v-if="record.labels[0]?.catno" class="font-medium">
						{{ record.labels[0].catno }}
					</span>
					<span v-if="record.year">{{ record.year }}</span>
				</div>
			</div>

			<!-- Remove Button -->
			<Button
				variant="ghost"
				size="icon"
				class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				@click="emit('remove', record.id)"
				title="Remove from crate"
				aria-label="Remove from crate"
			>
				<X class="size-4" />
			</Button>
		</div>
	</div>
</template>
```

**Reference:** See `SectionRecordTracks.vue` for how DialogRecordDetails delegates list rendering.

---

## Priority 3: Simplify DialogCrateDetails

### Problem

The component handles view mode, edit mode, form state, and record list all in one file.

### Solution

After extracting ListCrateRecords, consider whether edit mode should be a separate dialog (like DialogCrateForm) rather than inline. This would:

- Reduce DialogCrateDetails to ~200 lines
- Remove form validation logic from the details view
- Match the pattern where "details" components are read-only viewers

**Decision needed:** Is inline editing preferred UX, or would opening DialogCrateForm be acceptable?

If keeping inline edit, at minimum:

1. Extract the form fields into a `FormCrateEdit.vue` component
2. Use ListCrateRecords for the record list
3. Keep DialogCrateDetails as an orchestrator only

---

## Priority 4: Document Form Validation Pattern

### Problem

The codebase has two patterns for form submit buttons:

1. **Always disable when invalid:** `DialogRecordDetails.vue`, `DialogTrackDetails.vue`

   ```vue
   :disabled="!meta.valid"
   ```

2. **Show errors on first submit:** `DialogTrackEdit.vue`, `DialogCrateForm.vue`
   ```vue
   <!-- No :disabled, uses showValidationErrors for error display -->
   ```

### Solution

Document the intended pattern in `CLAUDE.md` under a new "Form Patterns" section:

```markdown
### Form Validation UX

**Edit forms (modifying existing data):** Disable submit when invalid.

- User is editing known-valid data, immediate feedback is helpful
- Example: DialogRecordDetails, DialogTrackDetails

**Create forms (new data entry):** Allow submit, show errors after first attempt.

- User hasn't had chance to fill form yet
- Uses `showValidationErrors` ref pattern
- Example: DialogTrackEdit, DialogCrateForm
```

---

## Priority 5: Props Cleanup

### Problem

Several components accept `crate: Crate | null` but only render when crate exists:

```vue
<DialogCrateDetails :crate="selectedCrate" />
<!-- Can be null -->

<!-- Inside component -->
<DialogHeader v-if="crate"></DialogHeader>
```

### Solution

Either:

1. Make prop required and have parent handle null: `<DialogCrateDetails v-if="selectedCrate" :crate="selectedCrate" />`
2. Keep nullable but use a computed to simplify template guards

Option 1 is cleaner. Update:

- `DialogCrateDetails.vue`
- `DialogAddRecords.vue`
- `AlertConfirmDeleteCrate.vue`

**Reference:** Check how `DialogRecordDetails.vue` handles this with `recordDetails.selectedRecord`.

---

## Priority 6: Remove Animation Over-Engineering

### Problem

`DialogAddRecords.vue` has `poppingRecordId` logic for a subtle scale animation that:

- Adds complexity (ref, setTimeout, conditional class)
- Animation is barely noticeable at 150ms
- Items already animate out via TransitionGroup

### Solution

Remove `poppingRecordId` logic entirely. The `record-list-leave-active` transition handles the visual feedback adequately.

If the "pop before disappear" effect is desired, it can be done purely in CSS:

```css
.record-list-leave-active {
	animation: pop-out 150ms ease-out;
}

@keyframes pop-out {
	0% {
		transform: scale(1);
		opacity: 1;
	}
	30% {
		transform: scale(1.03);
	}
	100% {
		transform: scale(0.95);
		opacity: 0;
	}
}
```

---

## Testing Checklist

After refactoring, verify:

- [ ] Create crate with name only
- [ ] Create crate with name, description, and color
- [ ] Edit crate (all fields)
- [ ] Delete crate (confirm dialog works, loading state shows)
- [ ] Add records to crate from detail view
- [ ] Remove records from crate
- [ ] Unsaved changes alert triggers correctly
- [ ] Empty states display correctly
- [ ] Color picker selection/deselection works

---

## Files to Modify

| File                                           | Action                              |
| ---------------------------------------------- | ----------------------------------- |
| `app/utils/schemas/crate.ts`                   | Create (new)                        |
| `app/components/crates/ListCrateRecords.vue`   | Create (new)                        |
| `app/components/crates/DialogCrateDetails.vue` | Refactor (use extracted components) |
| `app/components/crates/DialogCrateForm.vue`    | Update (use shared schema)          |
| `app/components/crates/DialogAddRecords.vue`   | Simplify (remove poppingRecordId)   |
| `CLAUDE.md`                                    | Document form validation patterns   |

---

## Non-Goals

These are not problems worth solving now:

- **Sheet vs Dialog decision** - Already discussed, Dialog is fine
- **CSS variable changes** - Intentional design decision
- **Duplicated record item rendering** - ListCrateRecords and DialogAddRecords both render record items similarly, but they have different actions (remove vs add), so some duplication is acceptable
