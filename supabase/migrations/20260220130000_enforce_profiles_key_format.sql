ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS key_format varchar;

UPDATE public.profiles
SET key_format = 'key'
WHERE key_format IS NULL
	OR key_format NOT IN ('key', 'camelot');

ALTER TABLE public.profiles
ALTER COLUMN key_format SET DEFAULT 'key',
ALTER COLUMN key_format SET NOT NULL;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_key_format_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_key_format_check
CHECK (key_format IN ('key', 'camelot'));
