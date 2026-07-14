-- Restore the authenticated data access expected by the application while
-- keeping PostgreSQL privileges narrower than the row-level security policies.
--
-- Supabase's postgres role creates public tables with Dxt privileges for anon
-- and authenticated by default (TRUNCATE, REFERENCES, and TRIGGER), but without
-- the SELECT / INSERT / UPDATE / DELETE privileges the app needs. TRUNCATE is
-- especially unsafe here because it is not governed by row-level security.

-- Make future application tables created by the postgres migration role
-- deny-by-default. Migrations that add a table to the public API must still
-- revoke inherited access and grant required operations explicitly after adding
-- an appropriate RLS policy.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
	REVOKE ALL ON TABLES FROM anon, authenticated;

-- Reassert RLS before exposing any row operations. These statements also make
-- the migration fail if an expected application table is missing.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Remove every inherited privilege first, including TRUNCATE. Anonymous users
-- have no direct access to private library data.
REVOKE ALL ON TABLE
	public.profiles,
	public.records,
	public.tracks,
	public.crates,
	public.sets
FROM PUBLIC, anon, authenticated;

-- Profiles are created by the auth trigger and may be recreated by the
-- settings upsert fallback. The client never directly deletes a profile.
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- Records, tracks, crates, and sets all have authenticated CRUD flows. Their
-- existing RLS policies restrict every operation to rows owned by auth.uid().
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
	public.records,
	public.tracks,
	public.crates,
	public.sets
TO authenticated;

-- OAuth credentials remain inaccessible to browser roles. Edge Functions
-- validate the caller, then use a service-role query scoped to that user ID.
REVOKE ALL ON TABLE public.discogs_credentials FROM PUBLIC, anon, authenticated;

-- Fail the migration if role inheritance or a platform default defeats these
-- security boundaries. RLS governs row ownership; these checks keep broader
-- table operations and the credential store outside browser roles.
DO $$
DECLARE
	app_table REGCLASS;
BEGIN
	FOREACH app_table IN ARRAY ARRAY[
		'public.profiles'::REGCLASS,
		'public.records'::REGCLASS,
		'public.tracks'::REGCLASS,
		'public.crates'::REGCLASS,
		'public.sets'::REGCLASS
	]
	LOOP
		IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = app_table) THEN
			RAISE EXCEPTION 'RLS must be enabled on %', app_table;
		END IF;

		IF has_table_privilege(
			'anon',
			app_table,
			'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
		) THEN
			RAISE EXCEPTION 'anon must not access %', app_table;
		END IF;

		IF has_table_privilege(
			'authenticated',
			app_table,
			'TRUNCATE, REFERENCES, TRIGGER'
		) THEN
			RAISE EXCEPTION 'authenticated has unsafe privileges on %', app_table;
		END IF;
	END LOOP;

	IF has_table_privilege(
		'anon',
		'public.discogs_credentials',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	) OR has_table_privilege(
		'authenticated',
		'public.discogs_credentials',
		'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
	) THEN
		RAISE EXCEPTION 'browser roles must not access Discogs credentials';
	END IF;
END;
$$;
