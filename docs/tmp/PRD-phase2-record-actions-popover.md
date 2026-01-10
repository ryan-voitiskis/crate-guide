# PRD: Phase 2 - Record Actions Popover

## Overview

Add a dropdown menu to `CardRecordShort.vue` that provides quick actions for records: view, edit, add to crate, open in Discogs, and remove from collection. This phase depends on Phase 1 (Crate Management) being complete.

## Prerequisites

- Phase 1 (Crate Management) must be complete
- Users must be able to create crates before they can add records to them
- DropdownMenu component must be added to shadcn-vue

## Features

### 1. Add DropdownMenu Component

Add the shadcn-vue DropdownMenu component to the project.

**Installation:**

```bash
npx shadcn-vue@latest add dropdown-menu
```

This will create components in `app/components/ui/dropdown-menu/`.

### 2. Record Actions Dropdown Menu

**Location:** Replace the Discogs button in `CardRecordShort.vue`

**Trigger Button:**

- Icon: `MoreVertical` from lucide-vue-next
- Variant: `ghost`
- Size: `icon`
- Positioned in the right column of the card

**Menu Items:**

| Label                  | Icon          | Action                                           |
| ---------------------- | ------------- | ------------------------------------------------ |
| View record            | `Eye`         | Opens `DialogRecordDetails` in view mode         |
| Edit record            | `Pencil`      | Opens `DialogRecordDetails` in edit mode         |
| Add to crate           | `FolderPlus`  | Opens `DialogAddToCrate`                         |
| Open in Discogs        | `IconDiscogs` | Opens Discogs URL in new tab (existing behavior) |
| ---                    | ---           | Separator                                        |
| Remove from collection | `Trash2`      | Opens `AlertConfirmRemoveRecord`                 |

**Notes:**

- "Open in Discogs" only shown if `record.discogs_release_url` exists
- "Remove from collection" should have destructive styling (red text)
- Use `DropdownMenuSeparator` before destructive action

### 3. Dialog: Add to Crate

**Component:** `DialogAddToCrate.vue`

**Trigger:** "Add to crate" menu item

**Dialog Content:**

- Title: "Add to Crate"
- Subtitle: Record title (muted, truncated)
- Content:
  - If no crates exist: Show message "No crates yet" with "Create Crate" button
  - If crates exist: List of crates with checkboxes - Each row: Color indicator, crate name, checkbox
    G - Crates already containing this record should be pre-checked - Scroll area if many crates
  - "Create new crate" button at bottom (opens `DialogCrateForm`)
- Actions:
  - Cancel button
  - Save button (primary) - applies changes

**Behavior:**

- Track initial state of which crates contain the record
- On save, add record to newly checked crates, remove from unchecked crates
- Use `cratesStore.addRecordToCrate(crateId, recordId, { silent: true })` for additions
- Use `cratesStore.removeRecordFromCrate(crateId, recordId)` for removals (already silent)
- Show single toast on success summarizing changes

**Create New Crate Inline:**

- Button opens `DialogCrateForm` (from Phase 1)
- After crate creation, auto-check the new crate in the list

### 4. Alert: Confirm Remove Record

**Component:** `AlertConfirmRemoveRecord.vue`

**Trigger:** "Remove from collection" menu item

**Dialog Content:**

- Title: "Remove Record"
- Description (dynamic based on crate membership):
  - If in 0 crates: "Are you sure you want to remove '{record title}' from your collection? This will also remove all tracks on this record."
  - If in 1+ crates: "Are you sure you want to remove '{record title}' from your collection? This record is in {N} crates: {crate names}. It will be removed from all crates and all tracks on this record will be deleted."
- Actions:
  - Cancel button
  - Remove button (destructive variant)

**Behavior on Confirm:**

1. Get list of crates containing this record: `cratesStore.getCratesContainingRecord(recordId)`
2. Remove record from all crates: loop through and call `cratesStore.removeRecordFromCrate()` (already silent)
3. Delete the record: `recordsStore.deleteRecord(recordId)`
4. Close any open dialogs (record details if open)
5. Show single success toast: "Record removed from collection"

**Note:** Tracks are deleted automatically via database CASCADE on `record_id` foreign key.

**State Management Pattern:** Use store-based dialog state (like `AlertConfirmDeleteTrack.vue`), not props-based. Add `recordToRemove: DatabaseRecord | null` to `recordDetailsStore`. The alert reads this state and controls its own visibility via computed property.

### 5. Update DialogRecordDetails for Edit Mode Opening

**Current behavior:** Dialog opens in view mode, user clicks "Edit" to switch.

**Required update:** Allow opening directly in edit mode.

**Implementation:**

Update `recordDetailsStore.openRecord()` to accept optional second parameter:

```typescript
function openRecord(recordId: string, editMode = false) {
	selectedRecordId.value = recordId
	isEditMode.value = editMode
}
```

Usage:

- View mode: `recordDetails.openRecord(recordId)`
- Edit mode: `recordDetails.openRecord(recordId, true)`

### 6. State Management

**Extend `recordDetailsStore`:**

- Add `recordToRemove: DatabaseRecord | null` for delete confirmation
- Add `recordToAddToCrate: DatabaseRecord | null` for add-to-crate dialog

**Store-based Alert Dialog Pattern (Convention):**

Alert/confirmation dialogs should use store state rather than props when the dialog can be triggered from multiple places. This pattern:

- Keeps triggering components simple (just set store state)
- Centralizes dialog logic
- Makes it easy to close dialogs from anywhere (e.g., after successful operation)

Example from `AlertConfirmDeleteTrack.vue`:

```typescript
const track = computed(() => recordDetails.trackToConfirmDelete)
const isOpen = computed(() => !!track.value)
```

**Documentation Task:** Add this pattern to `CLAUDE.md` conventions section. Also audit and refactor `AlertConfirmDeleteCrate.vue` to use store-based pattern for consistency (add `crateToDelete` to `cratesStore` or a dedicated UI store).

## Component Structure

```
app/
  components/
    ui/
      dropdown-menu/          # Added via shadcn-vue CLI
        DropdownMenu.vue
        DropdownMenuContent.vue
        DropdownMenuItem.vue
        DropdownMenuSeparator.vue
        ...
    collection/
      CardRecordShort.vue     # Updated with dropdown
      DialogAddToCrate.vue    # New - crate selection dialog
      AlertConfirmRemoveRecord.vue  # New - remove confirmation
      DialogRecordDetails.vue # Updated for edit mode opening
```

## Implementation Details

### CardRecordShort.vue Changes

Replace the current Discogs button section:

```vue
<!-- Before -->
<Button
	v-if="record.discogs_release_url"
	@click.stop="openInNewTab(record.discogs_release_url)"
	variant="ghost"
	size="icon"
>
  <IconDiscogs />
</Button>

<!-- After -->
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" @click.stop>
      <MoreVertical class="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem @click="viewRecord">
      <Eye class="mr-2 h-4 w-4" />
      View record
    </DropdownMenuItem>
    <DropdownMenuItem @click="editRecord">
      <Pencil class="mr-2 h-4 w-4" />
      Edit record
    </DropdownMenuItem>
    <DropdownMenuItem @click="openAddToCrate">
      <FolderPlus class="mr-2 h-4 w-4" />
      Add to crate
    </DropdownMenuItem>
    <DropdownMenuItem
      v-if="record.discogs_release_url"
      @click="openInDiscogs"
    >
      <IconDiscogs class="mr-2 h-4 w-4" />
      Open in Discogs
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      @click="confirmRemove"
      class="text-destructive focus:text-destructive"
    >
      <Trash2 class="mr-2 h-4 w-4" />
      Remove from collection
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Crate Cleanup on Record Removal

The removal flow must clean up crate references:

```typescript
async function removeRecord(recordId: string) {
	const cratesStore = useCratesStore()
	const recordsStore = useRecordsStore()
	const { toast } = useToast()

	// Get all crates containing this record
	const affectedCrates = cratesStore.getCratesContainingRecord(recordId)

	// Remove from all crates first (already silent, no toasts)
	for (const crate of affectedCrates) {
		await cratesStore.removeRecordFromCrate(crate.id, recordId)
	}

	// Then delete the record (tracks cascade automatically)
	await recordsStore.deleteRecord(recordId)

	// Single consolidated toast
	toast.success('Record removed from collection')
}
```

## Testing Checklist

**Convention & Refactoring:**

- [ ] Store-based dialog pattern documented in CLAUDE.md
- [ ] AlertConfirmDeleteCrate refactored to store-based pattern
- [ ] Crate deletion still works after refactor

**Record Actions Dropdown:**

- [ ] Dropdown menu opens on click
- [ ] "View record" opens dialog in view mode
- [ ] "Edit record" opens dialog in edit mode
- [ ] "Add to crate" opens dialog with crate list
- [ ] Pre-checked crates show correctly
- [ ] Can add record to multiple crates
- [ ] Can remove record from crates via unchecking
- [ ] "Create new crate" flow works
- [ ] "Open in Discogs" works (only shown when URL exists)
- [ ] "Remove from collection" shows confirmation
- [ ] Confirmation shows affected crate names
- [ ] Removal cleans up crate references
- [ ] Removal deletes record and tracks
- [ ] Single toast shown for multi-step operations

---

## Agent Prompt

```
Implement the Record Actions Popover as described in /docs/tmp/PRD-phase2-record-actions-popover.md

Prerequisites check:
1. Verify Phase 1 (Crate Management) is complete - check /app/pages/crates.vue has full implementation
2. Verify cratesStore has description and color fields working

Before starting:
1. Add DropdownMenu component: npx shadcn-vue@latest add dropdown-menu
2. Read the current state of:
   - /app/components/collection/CardRecordShort.vue
   - /app/components/collection/DialogRecordDetails.vue
   - /app/components/collection/AlertConfirmDeleteTrack.vue (reference pattern)
   - /app/components/crates/AlertConfirmDeleteCrate.vue (needs refactoring)
   - /app/stores/recordDetailsStore.ts
   - /app/stores/cratesStore.ts
   - /app/stores/recordsStore.ts

Implementation order:
1. Document store-based alert dialog pattern in CLAUDE.md conventions section
2. Refactor AlertConfirmDeleteCrate.vue to use store-based pattern (add crateToDelete to cratesStore)
3. Update recordDetailsStore:
   - Add optional editMode param to openRecord(recordId, editMode = false)
   - Add recordToRemove: DatabaseRecord | null
   - Add recordToAddToCrate: DatabaseRecord | null
4. Create DialogAddToCrate.vue component (store-based)
5. Create AlertConfirmRemoveRecord.vue component (store-based)
6. Update CardRecordShort.vue with dropdown menu
7. Test the full flow for each action

Follow the existing codebase patterns:
- Use Tailwind utility classes only (no @apply, no <style> blocks)
- Auto-imports for Vue, Nuxt, stores, composables
- Component naming: Type-first PascalCase
- Use design tokens: bg-background, text-foreground, border-border, etc.
- Store-based dialog state pattern (see AlertConfirmDeleteTrack.vue)
- Single consolidated toast for multi-step operations
```
