-- ============================================================================
-- ADD DESCRIPTION AND COLOR TO CRATES
-- ============================================================================
-- Adds optional description and color fields to the crates table for
-- better organization and visual identification of crates.
-- ============================================================================

-- Add description column (nullable, for short descriptions)
ALTER TABLE public.crates
ADD COLUMN description text;

-- Add color column (nullable, stores hex color like '#FF5733')
ALTER TABLE public.crates
ADD COLUMN color varchar(7);

-- Add comment for documentation
COMMENT ON COLUMN public.crates.description IS 'Optional short description for the crate';
COMMENT ON COLUMN public.crates.color IS 'Optional hex color code for visual identification (e.g., #FF5733)';
