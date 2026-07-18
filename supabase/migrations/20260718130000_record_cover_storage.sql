ALTER TABLE public.records
ADD COLUMN cover_storage_path TEXT;

COMMENT ON COLUMN public.records.cover_storage_path IS
	'Immutable object path in the private record-covers bucket. When present, it takes precedence over the external cover URL.';

INSERT INTO storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
VALUES (
	'record-covers',
	'record-covers',
	FALSE,
	2097152,
	ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
	public = EXCLUDED.public,
	file_size_limit = EXCLUDED.file_size_limit,
	allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "users_select_own_record_covers" ON storage.objects;
CREATE POLICY "users_select_own_record_covers"
	ON storage.objects
	FOR SELECT
	TO authenticated
	USING (
		bucket_id = 'record-covers'
		AND owner_id = (SELECT auth.uid()::TEXT)
	);

DROP POLICY IF EXISTS "users_insert_own_record_covers" ON storage.objects;
CREATE POLICY "users_insert_own_record_covers"
	ON storage.objects
	FOR INSERT
	TO authenticated
	WITH CHECK (
		bucket_id = 'record-covers'
		AND (storage.foldername(name))[1] = (SELECT auth.uid()::TEXT)
		AND lower(storage.extension(name)) = 'webp'
		AND EXISTS (
			SELECT 1
			FROM public.records
			WHERE records.user_id = (SELECT auth.uid())
				AND records.id::TEXT = (storage.foldername(name))[2]
		)
	);

DROP POLICY IF EXISTS "users_delete_own_record_covers" ON storage.objects;
CREATE POLICY "users_delete_own_record_covers"
	ON storage.objects
	FOR DELETE
	TO authenticated
	USING (
		bucket_id = 'record-covers'
		AND owner_id = (SELECT auth.uid()::TEXT)
	);
