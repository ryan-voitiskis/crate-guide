BEGIN;

SELECT plan(6);

-- Owner policies must evaluate auth.uid() once per statement through an
-- initplan, never once per candidate row.
SELECT is(
	(
		SELECT array_agg(policyname::TEXT ORDER BY tablename, policyname)
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename IN ('profiles', 'records', 'tracks', 'crates', 'sets')
			AND (
				regexp_replace(coalesce(qual, ''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'g')
					~ 'auth\.uid\(\)'
				OR regexp_replace(coalesce(with_check, ''), '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'g')
					~ 'auth\.uid\(\)'
			)
	),
	NULL,
	'library owner policies wrap auth.uid() in a scalar subquery'
);

SELECT is(
	(
		SELECT count(*)::INTEGER
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename IN ('profiles', 'records', 'crates', 'sets')
			AND qual LIKE '%SELECT auth.uid()%'
			AND with_check LIKE '%SELECT auth.uid()%'
	),
	4,
	'profiles, records, crates and sets keep one owner policy each'
);

-- Column-scoped validation triggers: (trigger, table, column).
SELECT is(
	(
		SELECT count(*)::INTEGER
		FROM pg_trigger AS trigger
		INNER JOIN (
			VALUES
				('tracks_protect_evidence_generation_trigger', 'public.tracks'::regclass, 'audio_features'),
				('tracks_validate_artists_trigger', 'public.tracks'::regclass, 'artists'),
				('tracks_validate_extraartists_trigger', 'public.tracks'::regclass, 'extraartists'),
				('tracks_validate_genres_trigger', 'public.tracks'::regclass, 'genres'),
				('records_validate_artists_trigger', 'public.records'::regclass, 'artists'),
				('records_validate_labels_trigger', 'public.records'::regclass, 'labels'),
				('sets_validate_played_tracks_trigger', 'public.sets'::regclass, 'played_tracks')
		) AS expected(trigger_name, table_oid, column_name)
			ON trigger.tgname = expected.trigger_name
			AND trigger.tgrelid = expected.table_oid
		INNER JOIN pg_attribute AS attribute
			ON attribute.attrelid = expected.table_oid
			AND attribute.attname = expected.column_name
		WHERE NOT trigger.tgisinternal
			-- int2vector renders as space-separated column numbers.
			AND trigger.tgattr::TEXT = attribute.attnum::TEXT
	),
	7,
	'validation triggers fire on insert and on updates of their own column only'
);

-- A metadata edit on an enriched track must not run Evidence validation:
-- writing an untouched column cannot fail even if a guard would reject it.
SELECT ok(
	pg_get_triggerdef(
		(
			SELECT oid
			FROM pg_trigger
			WHERE tgname = 'tracks_protect_evidence_generation_trigger'
				AND tgrelid = 'public.tracks'::regclass
		)
	) LIKE '%BEFORE INSERT OR UPDATE OF audio_features ON public.tracks%',
	'Evidence protection is scoped to audio_features writes'
);

SELECT hasnt_index(
	'public',
	'records',
	'idx_records_user_id',
	'records owner lookups use the (user_id, id) unique index'
);
SELECT is(
	(
		SELECT count(*)::INTEGER
		FROM pg_indexes
		WHERE schemaname = 'public'
			AND indexname IN (
				'idx_crates_user_id',
				'idx_sets_user_id',
				'idx_records_artists_gin',
				'idx_records_labels_gin'
			)
	),
	0,
	'redundant owner prefixes and unused GIN indexes are absent'
);

SELECT * FROM finish();
ROLLBACK;
