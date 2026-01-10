# PRD: Phase 1 - Crate Management UI

## Overview

Implement the crate management interface on the `/crates` page. This is the foundation that must be completed before Phase 2 (Record Actions Popover) can be built, as users need to create and manage crates before they can add records to them.

## Prerequisites

- Run migration `20260110175817_add_crate_description_and_color.sql` to add `description` and `color` columns to the crates table
- Regenerate Supabase types: `npm run genTypes`
- Update `cratesStore.ts` to include the new fields

## Database Schema Changes

The migration adds two new columns to `public.crates`:

- `description` (text, nullable) - Short description for the crate
- `color` (varchar(7), nullable) - Hex color code (e.g., `#FF5733`)

## Features

### 1. Crate List View (`/crates` page)

Replace the current "Coming soon" placeholder with a full crate management interface.

**Empty State:**

- Icon: `FolderOpen` (already used)
- Heading: "No crates yet"
- Description: "Create your first crate to organize records for gigs"
- Primary action: "Create Crate" button

**Crate Cards:**

- Height: `h-32` (128px)
- Layout: Left side shows crate info, right side shows record previews
- Left side content:
  - Color indicator (small colored bar or dot using crate's color)
  - Crate name (bold, truncate if long)
  - Description (muted text, truncate, show placeholder if empty)
  - Record count badge (e.g., "12 records")
- Right side content:
  - Up to 4 record cover thumbnails in a row
  - Each thumbnail shows: cover image, catno, album name (truncated), year
  - If no records, show empty state placeholder
- Click action: Opens crate detail sheet/dialog

**Grid Layout:**

- Responsive grid similar to records page
- Cards should be full-width on mobile

### 2. Create Crate Dialog

**Trigger:** "Create Crate" button in header (teleported) + empty state button

**Dialog Content:**

- Title: "Create Crate"
- Form fields:
  - **Name** (required): Text input, max ~50 chars
  - **Description** (optional): Textarea, placeholder "Keep it short - a few words about this crate", max ~100 chars, show character count
  - **Color** (optional): Color picker with predefined palette (8-10 colors), plus option to clear/no color
- Actions:
  - Cancel button
  - Create button (primary, disabled until name entered)

**Color Palette Suggestions:**

```
#EF4444 (red)
#F97316 (orange)
#EAB308 (yellow)
#22C55E (green)
#14B8A6 (teal)
#3B82F6 (blue)
#8B5CF6 (purple)
#EC4899 (pink)
```

**Validation:**

- Name is required, trim whitespace
- Description max 100 characters

### 3. Crate Detail Sheet/Dialog

**Trigger:** Click on crate card

**Component:** Use `Sheet` component (slides in from right on desktop, bottom on mobile)

**Header:**

- Crate name (editable inline or via edit button)
- Color indicator
- Description (muted, below name)
- Record count
- Actions:
  - Edit button (pencil icon) - opens edit dialog
  - Delete button (trash icon) - opens confirmation

**Content:**

- List of records in the crate
- Each record shows: cover thumbnail, title, artist, catno, year
- Action per record: Remove from crate (X button or swipe)
- Empty state if no records: "No records in this crate yet. Add records from the Records page."

**Footer:**

- Close button

### 4. Edit Crate Dialog

**Trigger:** Edit button in crate detail sheet

**Dialog Content:**

- Title: "Edit Crate"
- Same form fields as Create (name, description, color)
- Pre-populated with current values
- Actions:
  - Cancel button
  - Save button (primary)

### 5. Delete Crate Confirmation

**Trigger:** Delete button in crate detail sheet

**Component:** `AlertDialog`

**Content:**

- Title: "Delete Crate"
- Description: "Are you sure you want to delete '{crate name}'? This will not delete the records in this crate, only the crate itself."
- Actions:
  - Cancel button
  - Delete button (destructive variant)

### 6. Remove Record from Crate

**Trigger:** Remove button on record item in crate detail sheet

**Behavior:**

- Optimistic update (remove immediately from UI)
- Call `cratesStore.removeRecordFromCrate(crateId, recordId)`
- Show toast on success/error
- No confirmation needed (easily reversible by re-adding)

## Component Structure

```
app/
  components/
    crates/
      CardCrate.vue           # Crate card for list view
      DialogCrateCreate.vue   # Create crate dialog
      DialogCrateEdit.vue     # Edit crate dialog (or combine with Create)
      SheetCrateDetail.vue    # Crate detail sheet
      ListCrateRecords.vue    # Record list within crate detail
      AlertConfirmDeleteCrate.vue  # Delete confirmation
      ColorPicker.vue         # Color selection component (reusable)
  pages/
    crates.vue                # Updated crates page
```

## Store Updates Required

Update `cratesStore.ts`:

1. Add `description` and `color` to type definitions (will come from regenerated types)
2. Include new fields in `createCrate` and `updateCrate` methods
3. No new methods needed - existing CRUD is sufficient

## UI Components Needed

- Existing: `Card`, `Button`, `Dialog`, `Sheet`, `Input`, `Textarea`, `AlertDialog`, `ScrollArea`
- New: `ColorPicker` (simple palette selector, can be built with buttons)

## Patterns to Follow

- Use `usePageActive()` composable for teleport support
- Follow existing dialog patterns from `DialogRecordDetails.vue`
- Follow existing sheet patterns from `NavMainMobile` (Sheet usage)
- Use `vue-sonner` toast for notifications
- Optimistic updates with rollback on error

## Accessibility

- All interactive elements must be keyboard accessible
- Color picker should have visible labels, not rely on color alone
- Proper ARIA labels on icon-only buttons

---

## Agent Prompt

```
Implement the Crate Management UI as described in /docs/tmp/PRD-phase1-crate-management.md

Before starting:
1. Run the migration: cd /Users/vz/projects/crate-guide && npx supabase db push (or apply locally)
2. Regenerate types: npm run genTypes
3. Read the current state of:
   - /app/pages/crates.vue (current placeholder)
   - /app/stores/cratesStore.ts
   - /app/pages/records.vue (for pattern reference)
   - /app/components/collection/DialogRecordDetails.vue (for dialog patterns)

Implementation order:
1. Update cratesStore.ts to handle description and color fields
2. Create ColorPicker.vue component
3. Create CardCrate.vue component
4. Create DialogCrateCreate.vue (or DialogCrateForm.vue for create/edit)
5. Create SheetCrateDetail.vue with record list
6. Create AlertConfirmDeleteCrate.vue
7. Update crates.vue page with full implementation
8. Test the full flow: create, view, edit, delete crates

Follow the existing codebase patterns:
- Use Tailwind utility classes only (no @apply, no <style> blocks)
- Auto-imports for Vue, Nuxt, stores, composables
- Component naming: Type-first PascalCase
- Use design tokens: bg-background, text-foreground, border-border, etc.
```
