# Supabase & Auth Security Audit

Status: **verified and decisions recorded — ready for implementation.** Every finding has been cross-checked against current source by a verification subagent. All four items that initially needed user input have been resolved and are documented in the "Decisions recorded" table below.

**Target hosting platform: Cloudflare Pages** (free tier, `cloudflare-pages` Nitro preset). This materially changes H5 — see that finding for details.

Scope reviewed:

- `supabase/config.toml`
- every migration in `supabase/migrations/`
- every edge function in `supabase/functions/`
- Nuxt/Supabase wiring: `nuxt.config.ts`, `app/middleware/auth.global.ts`, `app/stores/userStore.ts`, `app/stores/discogsAuthStore.ts`, `app/stores/discogsStore.ts`
- Auth pages: `app/pages/login.vue`, `signup.vue`, `reset-password.vue`, `update-password.vue`, `auth/**`
- One authenticated server route: `server/api/beatport/search.get.ts`

How to use this doc:

1. Work through findings in order of severity, then the implementation order at the bottom.
2. Each finding has **Evidence**, **Why it matters**, **Proposed fix**, and **Verification** sections.
3. Before writing code: re-open the cited files, confirm the evidence still holds on the current branch, and flag any deviation.
4. Three findings are marked **needs user input** — they cannot be resolved from the repo alone. Coordinate with the user before touching those.

---

## Findings index

| ID  | Title                                                                                         | Severity | Status                                                                     |
| --- | --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| H1  | `handle_new_user()` is `SECURITY DEFINER` without a pinned `search_path`                      | High     | **verified**                                                               |
| H2  | Email confirmation disabled (local) + client doesn't handle confirmation-required signup      | High     | **verified**, decision made: enable + add UI branch                        |
| H3  | Discogs OAuth tokens are readable by the session user via RLS                                 | High     | **verified**                                                               |
| H4  | `authenticated-discogs-request` is an unrestricted Discogs proxy                              | High     | **verified**                                                               |
| H5  | Rate limiter broken on Cloudflare isolates + `X-Forwarded-For` trusted as-is                  | High     | **verified**, target platform: Cloudflare Pages                            |
| M1  | `profiles` / `records` policies have no explicit `WITH CHECK`                                 | Medium   | **verified** (non-exploitable)                                             |
| M2  | Legacy `import_record_with_tracks` body still in init migration                               | Medium   | **verified** (superseded)                                                  |
| M3  | `get-discogs-access-token` doesn't verify the returned token matches the stored request token | Medium   | **verified**                                                               |
| M4  | CORS fallback defaults to production host when `SITE_URL` unset                               | Medium   | **verified**                                                               |
| M5  | Demo route exemption uses bare `startsWith('/demo')`                                          | Medium   | **verified**                                                               |
| M6  | Password minimum enforced only client-side                                                    | Medium   | **verified**, decision made: bump CLI + add `[auth.password_requirements]` |
| M7  | `fetchAndSetIdentity` sends avatar fetch without `User-Agent`                                 | Medium   | **verified**                                                               |
| L1  | Anonymous sign-ins / manual linking disabled                                                  | Info     | positive                                                                   |
| L2  | `additional_redirect_urls` has `https://127.0.0.1:3000` entry                                 | Low      | **verified** as scaffolded default, drop                                   |
| L3  | Client `select()`s return Discogs secret columns                                              | Low      | **verified** (4 call sites, all unmitigated)                               |
| L4  | `crates.records` / `sets.played_tracks` can hold cross-tenant UUIDs                           | Low      | **verified** (hygiene only)                                                |
| L5  | Refresh-token rotation defaults are correct                                                   | Info     | positive                                                                   |
| L6  | `max_rows` and signup email `max_frequency` values                                            | Low      | **verified**                                                               |
| L7  | No Content-Security-Policy header set                                                         | Low      | **verified**                                                               |
| L8  | No audit log on destructive RPCs                                                              | Low      | **verified**                                                               |
| X1  | Middleware session fallback                                                                   | Info     | **verified fine-by-design**                                                |
| X2  | Login redirect race                                                                           | Info     | **verified no race**                                                       |

---

## High-priority findings

### H1. `handle_new_user()` is `SECURITY DEFINER` without a pinned `search_path`

**Evidence**

- `supabase/migrations/20250823004226_init.sql:353-365` defines the function `LANGUAGE plpgsql SECURITY DEFINER` with no `SET search_path = …`.
- Compare with the later `import_record_with_tracks` (`20260223143000_fix_import_record_with_tracks_auth_uid.sql:9`) and the cleanup RPCs (`20260309234500_add_cleanup_rpcs.sql:7,58`) which pin `search_path = pg_catalog, public, auth`.
- No subsequent migration redefines `handle_new_user`, so the live definition is still the init one.

**Why it matters**
Supabase's own linter flags this as `function_search_path_mutable`. A role that could create objects in a schema earlier in the search path could shadow `public.profiles`. On a managed Supabase project the practical risk is low, but the fix is mechanical and matches the pattern already applied to every other `SECURITY DEFINER` function in the repo.

**Proposed fix**
Add a new migration:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
    INSERT INTO public.profiles (id, name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
    RETURN NEW;
END;
$$;
```

No policy or trigger re-creation needed; `CREATE OR REPLACE` is enough.

**Verification** — verified. `handle_new_user` is defined only once (init migration) and never redefined. The proposed fix matches the `SET search_path` clause already used by every other `SECURITY DEFINER` function in the repo.

**Implementation:** `bc0fa64` — `supabase/migrations/20260417120000_pin_handle_new_user_search_path.sql`; applied cleanly via `supabase db reset`.

---

### H2. Email confirmation disabled (local) + client doesn't handle confirmation-required signup

**Evidence**

- `supabase/config.toml:110` → `enable_confirmations = false` under `[auth.email]`.
- `supabase/config.toml:97, 105` → signups enabled.
- `app/stores/userStore.ts:56-76` — `signUpWithEmail` pushes to `/` on success regardless of whether `data.session` is null. If the hosted project has `enable_confirmations = true`, the signup succeeds but no session is created, and the UI will bounce to `/` which then redirects back to `/login` via middleware — a confusing dead-end for the user.
- `app/stores/userStore.ts:62-66` surfaces a "user already registered" toast, which is an email-existence oracle.

**Why it matters**
With confirmations off: anyone can register an arbitrary email and sign in immediately. An attacker can pre-register a victim's email, connect Discogs, and hold that account until the victim attempts to reset. Password reset (the only email-ownership proof) kicks them out of the app, but Discogs OAuth activity performed in the interim persists.

With confirmations on (if the hosted project has it enabled): the signup UI silently fails — it never tells the user to check their inbox.

Either way, the code + config need work.

**Decision**: project is currently dormant (hosted prod may have been shut down). We configure `config.toml` so that any future re-provisioning starts correct, and we fix the client flow so the signup UX works when confirmations are on.

**Proposed fix**

1. In `supabase/config.toml:110`, set `enable_confirmations = true`.
2. Update `signUpWithEmail` in `app/stores/userStore.ts:56-76`: when the response has no error but `data.session` is null, route to a new `/auth/check-inbox` page instead of pushing to `/`. Leave the `'User already registered'` branch as-is for now (the enumeration concern is accepted for this project's scale).
3. Create a minimal `app/pages/auth/check-inbox.vue` that instructs the user to open their email and click the link. The existing `app/pages/auth/confirm.vue` already handles the verifier → `verifyOtp` flow.
4. Bump `[auth.email].max_frequency` from `"1s"` to `"60s"` at the same time (see L6).

**Verification** — verified. `config.toml:110` confirmed; `userStore.ts:56-76` confirmed to ignore the `data.session == null` case.

---

### H3. Discogs OAuth tokens are readable by the session user via RLS

**Evidence**

- `supabase/migrations/20250823004226_init.sql:212-215` — `profiles` columns include `discogs_request_token`, `discogs_request_secret`, `discogs_access_token`, `discogs_access_secret`.
- `supabase/migrations/20250823004226_init.sql:291-293` — policy `FOR ALL USING (auth.uid() = id)`, no column restrictions.

**Why it matters**
Any XSS in the Nuxt SPA can exfiltrate not just the Supabase session JWT but the user's Discogs access token + secret, giving the attacker out-of-app access to the user's Discogs account until manually revoked. Pinia state also keeps them in memory where a rogue third-party package can read them.

**Exhaustive call-site inventory** (required for the fix plan)

Reads / writes of the four secret columns from the client:

- **Reads (via `select()`):** `app/stores/userStore.ts:161` (`fetchProfile` — full row, no column list)
- **Writes (via `update()` / `upsert()`):**
  - `app/stores/userStore.ts:191-194` (settings update, `.select().single()` roundtrip — returns secrets too)
  - `app/stores/userStore.ts:199-208` (settings upsert fallback)
  - `app/stores/discogsStore.ts:81-86` (disconnect: nulls all four token columns)
- **Column references in type/test code:**
  - `app/stores/discogsAuthStore.ts:18` (`isOAuthed` reads `profile.discogs_access_secret`, `profile.discogs_access_token`)
  - `app/stores/__tests__/userStore.test.ts:49-53`, `app/stores/__tests__/discogsAuthStore.test.ts:10-11, 111, 118, 126-127`, `app/stores/__tests__/discogsStore.test.ts:388-391` (mocks — will need updating if columns move).

**Proposed fix — one of**

1. **Cheap**: narrow every client `.from('profiles').select()` to an explicit column list that excludes the four secrets; change `discogsStore.ts` disconnect to call an edge-function RPC that nulls them server-side. `isOAuthed` becomes an RPC call or a derived boolean column exposed on the profile (e.g. `discogs_connected boolean`).
2. **Better**: move the four columns into a new `public.discogs_credentials` table with `user_id` PK, RLS on, and **no** `SELECT` policy. Reads and writes only through `SECURITY DEFINER` RPCs / edge functions. Expose a `discogs_connected` boolean view on `profiles` or a dedicated RPC for the UI's `isOAuthed` check.
3. **Best**: option 2 + column-level encryption with `pgsodium`/`pgcrypto`, decrypted only inside edge functions.

Option 2 is the proportionate choice and uses the existing edge-function pattern.

**Verification** — verified. All read/write sites enumerated; the four columns are read via unfiltered `.select()` in every client call site.

---

### H4. `authenticated-discogs-request` is an unrestricted Discogs proxy

**Evidence**

- `supabase/functions/authenticated-discogs-request/index.ts:6-7` — `ALLOWED_DISCOGS_HOSTS = ['api.discogs.com']` is the only path constraint.
- Lines 27, 42-48 — allows `GET` and `POST` indiscriminately.
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.ts:31-49` — only `oauth_*`, `page`, `per_page` are included in the OAuth signature base string. Query parameters inside the `url` argument are not signed (line 69 concatenates `url` as-is).

**Real-world allow-list** (derived from `app/composables/useDiscogsApi.ts:24-48`, the only caller)

1. `GET https://api.discogs.com/users/{username}/collection/folders` (line 29)
2. `GET https://api.discogs.com/users/{username}/collection/folders/{id}/releases` (line 41, paginated via `page`/`per_page`)
3. `GET https://api.discogs.com/releases/{id}` (line 46)

The UI never uses `POST` and never embeds query params inside `url`. The signature-omission risk is latent today but would bite the moment a caller adds query params. POST support can be removed without regressing existing features.

**Why it matters**

1. Authorisation scope: the proxy signs requests with the user's own OAuth creds, so the blast radius is scoped to the caller's Discogs account. But an attacker controlling the client (XSS, coerced user) can call any Discogs endpoint, including write endpoints the UI never exposes, and trash the user's collection/wantlist.
2. Signature correctness: OAuth 1.0a requires every request parameter (including URL query params) in the signature base string. Discogs currently tolerates the partial signature; if they tighten validation, paginated calls break silently.

**Proposed fix**

- Replace the generic proxy with a per-endpoint dispatcher accepting structured arguments (folder_id, release_id, page, per_page) rather than raw URLs.
- Restrict methods to `GET` only until a concrete write use case appears.
- In `makeAuthenticatedRequest`, when constructing the signature base string, parse the input URL, extract its query params, merge them with `page`/`per_page`, and sign the union. Rebuild the final URL from the signed params so the client sees a canonical form.

**Verification** — verified. Single caller (`useDiscogsApi.ts`) with three distinct endpoints. POST path unused. Query-param signature gap confirmed but currently unexercised.

---

### H5. Rate limiter broken on Cloudflare isolates + `X-Forwarded-For` trusted as-is

**Target platform: Cloudflare Pages** (user decision, free tier, Nuxt has a first-class `cloudflare-pages` Nitro preset).

**Evidence**

- `server/api/beatport/search.get.ts:41-42` — module-level `const rateLimitStore = new Map<string, RateLimitEntry>()`.
- Lines 73-93 — rate-limit check keyed on `user.id` AND client IP.
- Lines 206-233 (`getClientIp`) — returns the first `X-Forwarded-For` value if present, otherwise `socket.remoteAddress`.
- Beatport endpoint is the only caller of `getClientIp` / reader of `x-forwarded-for` (grep-confirmed).

**Why it matters**

1. **Rate-limit store is a no-op on Cloudflare.** Pages Functions run in Workers isolates. Each invocation is a fresh V8 isolate — there is no shared module state across requests, and short-lived isolates are discarded. `rateLimitStore` resets on every request, so the limiter allows unlimited traffic. This is a functional break on the target platform, not just a hardening concern.
2. **XFF trust**: the helper trusts the first `X-Forwarded-For` value. On Cloudflare the correct trusted header is `cf-connecting-ip`; raw XFF can be spoofed by any client.

**Proposed fix**

1. Replace the in-memory `Map` with a **Supabase-table-backed limiter**. New table `public.rate_limits (key text primary key, count int, reset_at timestamptz)` with an RLS policy that only the service role writes. The Beatport route calls a `SECURITY DEFINER` RPC `check_rate_limit(key text, max_requests int, window_ms int) returns boolean` that atomically upserts and returns whether the request is allowed. Single round-trip, no advisory lock needed if we use `INSERT … ON CONFLICT … DO UPDATE … RETURNING`.
2. Replace `getClientIp` with a Cloudflare-aware helper that reads `cf-connecting-ip` first, then falls back to `socket.remoteAddress`. **Never** fall back to raw `X-Forwarded-For`. Put the helper in a shared utility so a future route can reuse it.
3. In `nuxt.config.ts`, add `nitro: { preset: 'cloudflare-pages' }` so local `nuxi build` produces the right output.
4. If the table-backed limiter feels heavyweight for a single low-traffic endpoint, the acceptable interim is: rate-limit by `user.id` only (drop IP key entirely), using a `Map` that we accept is per-isolate and therefore effectively disabled on Cloudflare. Document this trade-off explicitly in the file.

Recommend (1) over (4): once the table exists, any future abuse-prone endpoint gets atomic, platform-portable rate limiting for free.

**Verification** — verified. No other consumer of `getClientIp`. Platform confirmed as Cloudflare Pages.

---

## Medium-priority findings

### M1. `profiles` / `records` policies have no explicit `WITH CHECK`

**Evidence**

- `supabase/migrations/20250823004226_init.sql:291-298` — both policies are `FOR ALL USING (…)` with no `WITH CHECK`.
- Compare `crates` (315-318) and `sets` (321-324) which do have explicit `WITH CHECK`.

**Why it matters**
**Not exploitable.** Per PostgreSQL 15 semantics, when a `FOR ALL` policy omits `WITH CHECK`, the `USING` expression is reused for the check clause. A `UPDATE profiles SET id = <other_user_id> WHERE id = <self_id>` under an authenticated role is still blocked (the `USING` evaluates `auth.uid() = <other_user_id>` → false).

This is purely a readability / future-proofing concern: a future edit to `USING` could change the write contract without the author realising.

**Proposed fix**
One migration that `DROP POLICY` + `CREATE POLICY` for both policies with explicit `WITH CHECK (auth.uid() = …)` mirroring the `USING` clause. Zero behaviour change.

**Verification** — verified. Fallback behaviour confirmed against Postgres 15 spec. Finding is non-exploitable but worth normalising.

**Implementation:** `f088b3d` — `supabase/migrations/20260417120100_explicit_with_check_profiles_records.sql`; applied cleanly via `supabase db reset`.

---

### M2. Legacy `import_record_with_tracks` body still visible in init migration

**Evidence**

- `supabase/migrations/20250823004226_init.sql:429-432` — signature `public.import_record_with_tracks(record JSONB, tracks JSONB DEFAULT '[]'::JSONB) RETURNS JSONB` with a body that accepts `record->>'user_id'` from the client.
- `supabase/migrations/20260223143000_fix_import_record_with_tracks_auth_uid.sql:2-5` — byte-identical signature, fixed body using `auth.uid()`.
- No `DROP FUNCTION` anywhere in the migration directory.

**Why it matters**
**Runtime: live function is the fixed one** (same signature → `CREATE OR REPLACE` fully supersedes). Risk is code-reading only: anyone skimming `init.sql` in isolation will misjudge the security posture.

**Proposed fix**
On the next schema consolidation, replace the init body with a short comment pointing to the fix migration. Do not re-run migrations.

**Verification** — verified superseded.

---

### M3. `get-discogs-access-token` doesn't verify submitted `oauth_token` matches stored `discogs_request_token`

**Evidence**

- `supabase/functions/get-discogs-access-token/index.ts:30-50` — `oauth_token` comes from the client request body and is passed through to Discogs (line 48) without comparison against `profile.discogs_request_token`.
- `supabase/functions/get-discogs-request-token/index.ts:65-72` persists the request token, so `profile.discogs_request_token` is reliably populated for an in-flight OAuth dance.
- Signature at line 107-114 uses stored `discogs_request_secret`.

**Why it matters**
Defence in depth: Discogs enforces the `oauth_verifier`→`oauth_token` binding server-side and will reject mismatches. Adding the local check short-circuits cheaper, makes the intent explicit, and closes the door against oddities if Discogs ever relaxes server-side validation.

**Proposed fix**
After loading the profile, before constructing the signature:

```ts
if (profile.discogs_request_token !== oauth_token) {
	throw new PublicOAuthError(
		'Discogs callback does not match the pending request. Please restart the Discogs connection.'
	)
}
```

Field type is `string | null` on `Profile`.

**Verification** — verified.

**Implementation:** `bce93d9` — guard added in `supabase/functions/get-discogs-access-token/index.ts` after `getUserProfile`, before signature construction.

---

### M4. CORS fallback defaults to production host when `SITE_URL` unset

**Evidence**

- `supabase/functions/_shared/cors.ts:2-3` — `Deno.env.get('SITE_URL') || 'https://crate.guide'`.
- All three edge functions import this module:
  - `get-discogs-request-token/index.ts:1` (uses at lines 13, 20)
  - `get-discogs-access-token/index.ts:1` (uses at lines 16, 24)
  - `authenticated-discogs-request/index.ts:1` (uses at lines 4, 18, 37)

**Why it matters**
If `SITE_URL` is ever unset in a staging/preview environment, the header is silently set to `https://crate.guide`, which (a) blocks that environment's browser from calling the edge function, and (b) would permit a hypothetical attacker origin if someone stood up a proxy that forwarded through.

`get-discogs-request-token/index.ts:93-107` already fails closed on missing `SITE_URL` — the CORS module is the odd one out.

**Proposed fix**
Make `cors.ts` throw at module load if `SITE_URL` is missing, matching the request-token function's posture. Any caller of `cors.ts` that already bootstraps before responding will surface the error once, loudly, rather than silently mis-CORS.

**Verification** — verified. All three edge functions import the module.

**Implementation:** `09c305e` — `supabase/functions/_shared/cors.ts` now throws at module load if `SITE_URL` is missing.

---

### M5. Demo route exemption uses bare `startsWith('/demo')`

**Evidence**

- `app/middleware/auth.global.ts:6-9`:
  ```ts
  to.path.startsWith('/auth/') || to.path.startsWith('/demo')
  ```
- `app/pages` contains only legitimate `/demo/…` subpaths today (`index`, `settings`, `records`, `crates`, `tracks`).

**Why it matters**
Also exempts `/demon-…`, `/demo-admin`, etc. Currently no such pages exist, but the guard is one character away from silently exempting a future page.

**Proposed fix**

```ts
to.path === '/demo' || to.path.startsWith('/demo/')
```

**Verification** — verified.

**Implementation:** `aa47d37` — `app/middleware/auth.global.ts:6-10` switched to exact + slash match.

---

### M6. Password minimum enforced only client-side

**Evidence**

- `app/pages/signup.vue:13-17` and `app/pages/update-password.vue:9-13` enforce `min(8)`, `max(64)` via Zod.
- `supabase/config.toml` has no password-policy block (confirmed by reading 1-150).

**Why it matters**
Zod is bypassable by calling `supabase.auth.signUp` from a non-UI client (e.g., a curl command against the Supabase Auth endpoint). The server must enforce its own minimum.

**Decision**: bump the Supabase CLI so `config.toml` supports `[auth.password_requirements]`, then configure it there. Declarative provisioning rather than hoping someone remembers a dashboard toggle on reactivation.

**Proposed fix**

1. Bump `@supabase/cli` in `package.json` to a version that supports `[auth.password_requirements]` (CLI ≥ 1.176 per Supabase release notes). Run `supabase init --with-vscode-settings=false` against a scratch dir if needed to grab the latest default `config.toml` shape.
2. In `supabase/config.toml`, add:
   ```toml
   [auth.password_requirements]
   minimum_length = 8
   required_characters = "lower_upper_letters_digits"
   ```
   (Values per Supabase CLI docs; confirm exact key names against the bumped CLI version before committing.)
3. Remove Zod's `max(64)` from client forms or keep it as UX guard — server still has its own max.
4. If the `max(8)` client minimum is ever loosened, server will still enforce.

**Verification** — verified locally; hosted setting will be provisioned from `config.toml` after CLI bump.

---

### M7. `fetchAndSetIdentity` sends avatar fetch without `User-Agent`

**Evidence**

- `supabase/functions/_shared/discogs/fetchAndSetIdentity.ts:51-60` — `fetch(identity.resource_url)` with no headers.

**Why it matters**
Discogs requires a `User-Agent` on all API requests. Today they may still respond; tomorrow they may 403 and the code silently logs a warning and stores `null` for the avatar. Not a security issue, but a silent-failure risk in the profile backfill.

**Proposed fix**
Read `DISCOGS_USER_AGENT` at module scope in `fetchAndSetIdentity.ts` and add `headers: { 'User-Agent': userAgent }` to the fetch. The env var is already read in `makeAuthenticatedRequest.ts:11` in the same folder.

**Verification** — verified.

**Implementation:** pending commit — `supabase/functions/_shared/discogs/fetchAndSetIdentity.ts` reads `DISCOGS_USER_AGENT` at module scope and passes it as `User-Agent` header on the avatar fetch.

---

## Low-priority / observations

### L1. Anonymous sign-ins / manual linking disabled — positive

`supabase/config.toml:99-101`. Keep.

### L2. `additional_redirect_urls` has `https://127.0.0.1:3000`

`supabase/config.toml:88`. Git blame (commit `c7d85459`, 2024-07-27) shows this was added in the initial `supabase init` scaffold — it's the Supabase CLI's default, not a deliberate loopback-HTTPS entry. **Drop it** and replace with the real dev/prod origins you want to allow redirects to (e.g. `["http://localhost:3000"]` plus whatever the Cloudflare Pages URL ends up being).

### L3. Client `select()`s return Discogs secret columns

All four client call sites that hit `profiles` issue bare `.select()` (no column list):

- `userStore.ts:161` (fetchProfile)
- `userStore.ts:191` (settings update)
- `userStore.ts:199` (settings upsert)
- `discogsStore.ts:80` (disconnect)

Every one of these needs to change (narrow to an explicit column list) either as H3's fix or as interim mitigation.

### L4. `crates.records` / `sets.played_tracks` can hold cross-tenant UUIDs

`supabase/migrations/20250823004226_init.sql:262, 272` — no FK on the UUIDs inside the `uuid[]` or JSONB, and no validation triggers exist (grep confirmed). RLS still prevents _reading_ those rows, so a malicious user can bloat their own collections with other users' IDs but cannot extract data. Hygiene issue. Consider a validation trigger if multi-tenant hardening becomes a priority.

### L5. `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10` — positive

`supabase/config.toml:92-95`. Standard defensive posture.

### L6. `max_rows = 1000`, signup `max_frequency = "1s"`

`supabase/config.toml:16, 112`. `max_rows` is fine. `max_frequency = "1s"` is very permissive for signup-confirmation email throttling (industry default ~60s); bump when H2 is addressed.

### L7. No Content-Security-Policy set

`nuxt.config.ts:1-67` has no `nitro`/`routeRules`/middleware emitting security headers. Out of Supabase scope but tightens XSS blast radius that interacts with H3.

### L8. No audit log on destructive RPCs

`supabase/migrations/20260309234500_add_cleanup_rpcs.sql` — confirmed no INSERTs into audit/log tables, and no audit infrastructure anywhere in the migrations directory. Acceptable at current scale; revisit if compliance or support cases ever require it.

---

## Cross-cutting items reviewed

### X1. Middleware session fallback — fine by design

`app/middleware/auth.global.ts:16-25` falls back to `supabase.auth.getSession()` when `useSupabaseUser()` is falsy and only blocks the route if the session call errors. An expired-but-not-errored session could transiently be let through, but Supabase's reactive auth state catches it on the next navigation. No change needed.

### X2. Login redirect race — no race

`app/pages/login.vue:39-45` redirects on `supaUser` truthy. `supaUser` is managed by `@nuxtjs/supabase` and flips truthy only after session restoration completes. Profile is lazily fetched on first authenticated route via `userStore.fetchProfile()`.

---

## Things that look correct and should stay that way

- All five user tables enable RLS; policies bind to `auth.uid()`.
- Write-path RPCs (`import_record_with_tracks` [live version], `remove_record_from_collection`, `delete_all_user_data`) re-derive identity from `auth.uid()`, never from the client body, and pin `search_path`.
- Edge functions create a per-request `SupabaseClient` bound to the caller's `Authorization` header (`supabase/functions/_shared/supabaseHelpers.ts:13-19`). No service-role key is used anywhere in the JS layer. No `service_role` string appears anywhere in the repo (grep-verified).
- OAuth callback URL is built server-side from `SITE_URL` (`supabase/functions/get-discogs-request-token/index.ts:92-117`), never accepted from the client.
- Public-route middleware fails closed for unknown routes.
- OAuth errors are sanitised before reaching the client toast (`app/stores/discogsAuthStore.ts:94-112`).
- Password reset uses standard Supabase flows (`resetPasswordForEmail` + `updateUser`).

---

## Decisions recorded (previously needed user input)

| ID  | Decision                                                                                                                                                                                            | Source                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| H2  | Set `enable_confirmations = true` in `config.toml` + add a `/auth/check-inbox` page. Project is dormant; provision correctly by default.                                                            | User, audit session             |
| H5  | Target **Cloudflare Pages**. Fix is (a) `nitro.preset = 'cloudflare-pages'`, (b) replace in-memory `Map` rate-limiter with a Supabase-table-backed RPC, (c) `getClientIp` reads `cf-connecting-ip`. | User, audit session             |
| M6  | Bump Supabase CLI so `config.toml` supports `[auth.password_requirements]`; configure `minimum_length = 8` there.                                                                                   | User, audit session             |
| L2  | `https://127.0.0.1:3000` was CLI scaffold default (commit `c7d85459`, 2024-07-27). Drop it; replace with real dev/prod origins once Cloudflare Pages URL is known.                                  | Git blame + user, audit session |

---

## Suggested implementation order

Grouped so each PR is focused and reviewable independently.

### Tier 1 — pure-SQL one-liners (do first)

1. **H1** — new migration adding `SET search_path` to `handle_new_user`.
2. **M1** — new migration rewriting `profiles` and `records` policies with explicit `WITH CHECK`.

### Tier 2 — tiny, isolated code fixes

3. **M3** — guard in `get-discogs-access-token`.
4. **M4** — fail-closed CORS.
5. **M5** — one-line middleware change.
6. **M7** — User-Agent header on avatar fetch.
7. **L2** — drop the `https://127.0.0.1:3000` line in `config.toml`.
8. **L3** — column-list narrowing on the four `profiles` selects (acts as interim mitigation for H3).

### Tier 3 — config / platform (all decisions recorded above)

9. **M6** — bump Supabase CLI, add `[auth.password_requirements]` block.
10. **H2** — set `enable_confirmations = true` in `config.toml`, add `/auth/check-inbox` page, update `signUpWithEmail` to branch on null session, bump `max_frequency` to `60s` (L6 rolls in here).
11. **H5** — add `nitro.preset = 'cloudflare-pages'`, write `check_rate_limit` RPC + `rate_limits` table migration, swap `beatport/search.get.ts` over to RPC + `cf-connecting-ip` helper.

### Tier 4 — design-required, highest blast radius

12. **M2** — doc-only clean-up of the superseded function body in the init migration.
13. **H4** — per-endpoint Discogs dispatcher + signature base-string fix.
14. **H3** — move Discogs credentials to a dedicated table with no RLS `SELECT` policy; update all four call sites and the tests enumerated above. Do last: touches the most surface; H4's dispatcher should land first so RPC boundaries are established.

### Tier 5 — observations worth deferring

15. **L4** — validation trigger for `crates.records` / `sets.played_tracks` UUIDs.
16. **L7** — add CSP header via Nitro `routeRules`.
17. **L8** — audit-log table for destructive RPCs.
