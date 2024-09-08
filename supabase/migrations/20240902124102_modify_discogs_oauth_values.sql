alter table profiles
add column discogs_request_token varchar,
add column discogs_request_secret varchar,
add column discogs_access_token varchar,
add column discogs_access_secret varchar;

alter table profiles
drop column discogs_token,
drop column discogs_token_secret;
