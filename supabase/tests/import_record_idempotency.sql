BEGIN;

SELECT plan(12);

INSERT INTO auth.users (id)
VALUES
	('00000000-0000-0000-0000-000000000011'),
	('00000000-0000-0000-0000-000000000012');

CREATE FUNCTION pg_temp.record_payload(
	owner_id UUID,
	release_id INTEGER,
	record_title TEXT DEFAULT 'Fixture record'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_build_object(
		'user_id', owner_id,
		'discogs_id', release_id,
		'discogs_release_url', 'https://www.discogs.com/release/' || coalesce(release_id::TEXT, 'manual'),
		'title', record_title,
		'artists', '[]'::JSONB,
		'labels', '[]'::JSONB,
		'year', 2026,
		'cover', NULL
	);
$$;

CREATE FUNCTION pg_temp.track_payload()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT '[{"title":"Fixture track","artists":[],"extraartists":[],"genres":[]}]'::JSONB;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000011',
	true
);

SELECT is(
	(
		public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000011',
				101
			),
			pg_temp.track_payload()
		)->>'already_exists'
	)::BOOLEAN,
	false,
	'the first Discogs import creates a record'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.records
		WHERE user_id = '00000000-0000-0000-0000-000000000011'
		  AND discogs_id = 101
	),
	1::BIGINT,
	'the first import creates one record row'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.tracks
		WHERE record_id = (
			SELECT id
			FROM public.records
			WHERE user_id = '00000000-0000-0000-0000-000000000011'
			  AND discogs_id = 101
		)
	),
	1::BIGINT,
	'the first import creates its track rows'
);

SELECT is(
	(
		public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000011',
				101
			),
			pg_temp.track_payload()
		)->>'already_exists'
	)::BOOLEAN,
	true,
	'an exact retry reports the existing record'
);
SELECT is(
	(
		public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000011',
				101
			),
			pg_temp.track_payload()
		)->>'record_id'
	)::UUID,
	(
		SELECT id
		FROM public.records
		WHERE user_id = '00000000-0000-0000-0000-000000000011'
		  AND discogs_id = 101
	),
	'an exact retry returns the original record id'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.records
		WHERE user_id = '00000000-0000-0000-0000-000000000011'
		  AND discogs_id = 101
	),
	1::BIGINT,
	'a retry does not duplicate the record row'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.tracks
		WHERE record_id = (
			SELECT id
			FROM public.records
			WHERE user_id = '00000000-0000-0000-0000-000000000011'
			  AND discogs_id = 101
		)
	),
	1::BIGINT,
	'a retry does not duplicate track rows'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000012',
	true
);
SELECT is(
	(
		public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000012',
				101
			),
			'[]'::JSONB
		)->>'already_exists'
	)::BOOLEAN,
	false,
	'the same Discogs release remains importable by another user'
);

SELECT set_config(
	'request.jwt.claim.sub',
	'00000000-0000-0000-0000-000000000011',
	true
);
SELECT lives_ok(
	$$
		SELECT public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000011',
				NULL,
				'Manual one'
			),
			'[]'::JSONB
		);
		SELECT public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000011',
				NULL,
				'Manual two'
			),
			'[]'::JSONB
		);
	$$,
	'multiple manual records with null Discogs ids remain valid'
);
SELECT is(
	(
		SELECT count(*)
		FROM public.records
		WHERE user_id = '00000000-0000-0000-0000-000000000011'
		  AND discogs_id IS NULL
	),
	2::BIGINT,
	'manual records are not collapsed by the unique index'
);

SELECT throws_like(
	$$
		SELECT public.import_record_with_tracks(
			pg_temp.record_payload(
				'00000000-0000-0000-0000-000000000012',
				202
			),
			'[]'::JSONB
		)
	$$,
	'%record.user_id must match authenticated user%',
	'the RPC still rejects a client-supplied tenant mismatch'
);
SELECT throws_like(
	$$
		INSERT INTO public.records (user_id, discogs_id, title, artists, labels)
		VALUES (
			'00000000-0000-0000-0000-000000000011',
			101,
			'Duplicate fixture',
			'[]'::JSONB,
			'[]'::JSONB
		)
	$$,
	'%duplicate key value violates unique constraint%',
	'the database rejects direct same-user Discogs duplicates'
);

SELECT * FROM finish();
ROLLBACK;
