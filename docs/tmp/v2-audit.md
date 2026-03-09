# v2 Pre-Merge Audit

Audited 2026-03-09. All findings verified by independent subagents against source code.

---

## CRITICAL

### 1. `process.env.SITE_URL` undefined at runtime in browser

**`app/stores/userStore.ts:79,101`**

`process.env.SITE_URL` is used for OAuth redirect and password reset URLs. With `ssr: false` and no `runtimeConfig` or `vite.define` exposing this variable, it evaluates to `undefined` in the browser. Both redirect URLs become `"undefined/auth/finalising"` and `"undefined/update-password"` — breaking OAuth sign-in and password reset in all deployed environments.

**Fix:** Use `useRuntimeConfig().public.siteUrl` (and declare it in `nuxt.config.ts` under `runtimeConfig.public`), or use `window.location.origin`.

### 2. Silent auto-save failure — catch swallows all errors

**`app/stores/sessionStore.ts:317-319`**

`updateActiveSet()` catches all errors with only a comment — no `console.error`, no toast, no state update. A DJ could play an entire set believing it's saving when auto-save silently stopped working (network outage, auth expiration, DB constraint violation). The `isAutoSaving` flag resets to `false` in `finally` regardless, so the UI cannot distinguish success from failure.

**Fix:** At minimum add `console.error`. Better: set a reactive `autoSaveError` ref the UI can display as a non-blocking warning.

### 3. Discogs API relay returns 200 for all upstream errors

**`supabase/functions/authenticated-discogs-request/index.ts:42-44`**

`response.ok` is never checked after fetching from Discogs. HTTP 401, 429, 500 from Discogs are forwarded to the client as HTTP 200. The client's `makeDiscogsApiRequest` only checks for Supabase transport errors, so Discogs errors (rate limits, auth failures) are silently cast to the expected response type.

**Fix:** Check `response.ok` before parsing. Forward the Discogs status code or map it to appropriate error responses.

### 4. `httpMethod` not validated at runtime in Discogs relay

**`supabase/functions/authenticated-discogs-request/index.ts:24`**

`httpMethod` from the request body is passed directly to `makeAuthenticatedRequest` with no runtime validation. The TypeScript `'GET' | 'POST'` constraint is compile-time only. An authenticated user can send `"DELETE"` or `"PATCH"` and the function proxies it to the Discogs API using stored OAuth credentials.

**Fix:** Add a runtime allowlist check before proceeding:

```ts
const ALLOWED_METHODS = ['GET', 'POST'] as const
if (!ALLOWED_METHODS.includes(httpMethod)) {
	return new Response(JSON.stringify({ error: 'Invalid HTTP method' }), {
		headers,
		status: 400
	})
}
```

### 5. Unchecked Supabase error in duplicate detection

**`app/utils/discogs-database.ts:7-11`**

The `error` field from the Supabase query is destructured away. On failure, `data` is `null`, the `|| []` fallback produces an empty array, and `getExistingDiscogsIds` returns an empty `Set`. Downstream, every record is treated as new — causing duplicate imports.

**Fix:** Destructure and check `error`. Throw on failure so the calling import process can handle it.

### 6. Auth check ordering in `get-discogs-request-token`

**`supabase/functions/get-discogs-request-token/index.ts:26-74`**

The Discogs API call (request token fetch) happens before JWT validation via `getUser()`. The early `authHeader` presence check (line 22) only confirms the header is non-empty, not that the JWT is valid. Callers with expired tokens exhaust Discogs OAuth rate limits.

**Fix:** Move `createAuthedSupabaseClient(authHeader)` and `getUser(supabase)` before the Discogs fetch.

---

## HIGH

### 7. `slideFader` race condition

**`app/stores/sessionStore.ts:174-191`**

`slideFader` is an async function running a `while` loop with `setTimeout` delays. It is not cancellable. `loadTrack` (line 159) fire-and-forgets `slideFader` without `await`. Rapid track loading creates concurrent loops mutating the same `deck.faderPosition` and `deck.pitch`. The `faderSliding` flag does not guard against concurrent `slideFader` calls — only against manual `setPitch`.

**Fix:** Track the current animation per deck (e.g., via generation counter or AbortController) and cancel previous animations before starting new ones.

### 8. `private: false` in package.json

**`package.json:12`**

This is a web app, not a library. `npm publish` would succeed and expose the codebase including the hardcoded staging project ref.

**Fix:** Set `"private": true`.

### 9. Auth failures in stores silently return empty UI

**`recordsStore.ts:35-38`, `cratesStore.ts:23-26`, `tracksStore.ts:20-23`**

All three stores use `.catch(() => null)` on `resolveAuthenticatedUserId()`, then silently return on null. The loading spinner stops (via `finally`) but no toast or log is produced. The user sees an empty collection with no indication of failure.

**Fix:** Log auth errors. Show a toast differentiating "not logged in" from "auth error."

### 10. `toast.error` fires on normal defensive guard

**`app/composables/useUserData.ts:26-28`**

When `loadAllUserData` is called while data is already loaded (normal when both the reactive `watchEffect` and `bootstrapLoadFromSession` trigger), a `toast.error('User data already loaded')` is shown to the user.

**Fix:** Replace `toast.error` with a silent `return` (or `console.debug` at most).

### 11. Auth middleware misses `undefined` hydration state

**`app/middleware/auth.global.ts:15`**

`user.value === null` misses `undefined`, which `useSupabaseUser()` returns before session resolution. During hydration, both the redirect-to-login guard (line 15) and the redirect-away-from-login guard (line 11) fail for `undefined`, making behavior less predictable.

**Fix:** Use `!user.value` instead of `=== null` for the redirect check. The `getSession()` fallback currently saves the redirect-to-login path, but the redirect-away-from-login path has no fallback.

### 12. `fetchFolderReleases` has no concurrency guard

**`app/stores/discogsStore.ts:43-68`**

No `if (isLoadingSelectedFolder.value) return` guard at the top. The UI `:loading` prop may visually disable the button, but the store itself has no protection against concurrent calls. Two overlapping loops would both write to `releasesToImport`.

**Fix:** Add an early return guard on `isLoadingSelectedFolder.value`.

### 13. Non-null assertions on `user.profile`

**`app/stores/discogsStore.ts:84,149`**

Both `disconnectDiscogs` and `importSelectedReleases` use `user.profile!.id` with no prior null check. If `profile` is null at call time, these throw unhandled TypeErrors.

**Fix:** Add `if (!user.profile)` guard with early return and user feedback.

### 14. Multiple catch blocks discard error details

**`userStore.ts:93,153,193` and `sessionStore.ts:369,451`**

Five catch blocks use `catch {` with no binding — error details are completely discarded. No `console.error`, making production debugging impossible. Other catch blocks in the same files do log properly (e.g., `sessionStore.ts:300,430`), so this is inconsistent.

**Fix:** Bind the error variable and add `console.error` in each.

### 15. `Promise.allSettled` rejection detection is dead code

**`app/composables/useUserData.ts:39-53`**

`fetchAllRecords`, `fetchAllCrates`, and `fetchAllTracks` all have internal try/catch blocks that swallow errors — they never reject. `Promise.allSettled` always returns `'fulfilled'` for all three. The failure detection code (lines 47-52) can never trigger.

**Fix:** Either have the store functions re-throw after logging/toasting, or remove the dead `allSettled` rejection handling.

### 16. Edge function OAuth errors always return 500

**`get-discogs-request-token/index.ts:78-88`, `get-discogs-access-token/index.ts:96-103`**

Both `PublicOAuthError` (user-fixable, e.g., bad params) and unexpected errors return HTTP 500 indiscriminately. Clients cannot distinguish retryable server errors from permanent user errors.

**Fix:** Return 400 for `PublicOAuthError`, 500 for unexpected errors.

### 17. `isDiscogsConnecting` never resets on error

**`app/stores/discogsAuthStore.ts:22-30`**

Set to `true` at line 23 but never reset on the error path. On success, the page navigates away (irrelevant). On failure, the flag stays `true` permanently, leaving the UI button in a loading/disabled state until page refresh.

**Fix:** Add `isDiscogsConnecting.value = false` in the error branch, or wrap in try/finally.

---

## MEDIUM

### 18. Duplicate `database.ts` files

**`shared/types/database.ts` vs `supabase/functions/_shared/types/database.ts`**

Identical today (both 403 lines). The `genTypes` script generates both sequentially, but there's no CI enforcement. If one is regenerated manually without the other, they silently drift.

**Fix:** Add a CI check that diffs the two files, or symlink one to the other.

### 19. `beatport_data: any | null` on Track type

**`shared/types/supabase.ts:28`**

The only `any` in domain types. `BeatportTrackData` and `BeatportNotFoundMarker` interfaces exist in 4 separate files but are never shared. Code accessing `track.beatport_data` has zero type checking.

**Fix:** Move the interfaces to `shared/types/beatport.ts` and type `beatport_data` as `BeatportTrackData | BeatportNotFoundMarker | null`.

### 20. Profile type doesn't narrow `key_format` or `turntable_theme`

**`shared/types/supabase.ts:5-10`**

`ui_theme` is narrowed via `Omit + &` but `key_format` (should be `'key' | 'camelot'`) and `turntable_theme` (should be `'silver' | 'black'`) remain `string`. The narrowing types exist in the codebase (`KeyFormat`, `TurntableThemeOptions`) but aren't applied to `Profile`. Runtime guards compensate but the type is looser than it should be.

**Fix:** Extend the `Omit + &` pattern to include both fields.

### 21. Duplicate icon library

**`package.json:49,51` and `nuxt.config.ts:26`**

Both `lucide-vue-next` (explicit imports in 57 files) and `nuxt-lucide-icons` (auto-registration, used in at least `InputPassword.vue`) are installed. Both provide Lucide icons — `nuxt-lucide-icons` wraps `lucide-vue-next` internally. Having two mechanisms is redundant overhead.

**Fix:** Pick one approach. If keeping explicit imports (majority usage), remove `nuxt-lucide-icons` from deps and modules, and update `InputPassword.vue` to use explicit imports.

### 22. Duplicate animation libraries (both likely unused)

**`package.json:58-59`**

Both `tailwindcss-animate` and `tw-animate-css` are in dependencies. Neither is imported anywhere in application code — no references in `main.css`, `nuxt.config.ts`, or any source file. Both are dead weight.

**Fix:** Determine which (if either) is needed. Remove the unused one(s).

### 23. Build-time deps in `dependencies`

**`package.json`**

With `ssr: false`, these are only needed at build time: `@nuxt/eslint`, `@tailwindcss/vite`, `tailwindcss`, `tailwindcss-animate`, `tw-animate-css`, `shadcn-nuxt`. Placing them in `dependencies` inflates production `node_modules`.

**Fix:** Move to `devDependencies`.

### 24. `compatibilityDate` is 23 months stale

**`nuxt.config.ts:9`**

Set to `2024-04-03` while running Nuxt `^4.3.1`. Updating unlocks newer Nuxt 4 compatibility flags and default behavior improvements.

**Fix:** Update to a recent date (e.g., `2026-03-01`).

### 25. `<style>` blocks in 5 components

Violates CLAUDE.md "Tailwind utility classes only — no `<style>` blocks" rule:

| Component                                      | Line | Type                         |
| ---------------------------------------------- | ---- | ---------------------------- |
| `app/pages/index.vue`                          | 67   | `<style scoped>`             |
| `app/components/session/DeckPitchFader.vue`    | 242  | `<style scoped>`             |
| `app/components/utils/LogoCrateGuide.vue`      | 24   | `<style scoped lang="scss">` |
| `app/components/utils/AnimationTick.vue`       | 13   | `<style lang="scss" scoped>` |
| `app/components/import/CardDiscogsRelease.vue` | 51   | `<style scoped lang="scss">` |

Additionally, `app/assets/css/main.css` lines 144, 151-152 use `@apply`.

**Fix:** Migrate to Tailwind utilities or document as accepted exceptions. If all SCSS blocks are removed, the `sass` devDependency can also be removed.

### 26. `confirm.vue` missing OTP validation and error UI

**`app/pages/auth/confirm.vue:9-15`**

`token_hash` and `type` are extracted from `route.query` with no validation and passed directly to `verifyOtp`. The template only renders "Verifying..." while in progress — on failure, it renders nothing. No error state is shown.

**Fix:** Validate params before calling `verifyOtp`. Add an error state to the template.

### 27. Beatport HTML parse errors return null silently

**`server/api/beatport/search.get.ts:288-290`**

`extractTrackDataFromHTML` catches all exceptions and returns `null` with no logging. When Beatport changes their page structure, every search silently returns "no match found" with zero observability.

**Fix:** Add `console.error` in the catch block for server-side observability.

### 28. `engines` pins exact versions

**`package.json:8-11`**

`"node": "24.12.0"` and `"npm": "11.6.2"` cause warnings on any patch release.

**Fix:** Use ranges: `"node": ">=24.12.0"`, `"npm": ">=11.6.2"`.

### 29. Staging project ref hardcoded

**`package.json:34`**

Supabase project ref `luhufzpayswbgewenudn` is committed in the `setStagingSecrets` script.

**Fix:** Use an env var (e.g., `$SUPABASE_PROJECT_REF`) or move to a local script not committed.

### 30. Duplicate Beatport API contract types

**`server/api/beatport/search.get.ts:1-13` vs `app/composables/useBeatportScraper.ts:1-13`**

`BeatportTrackData` and `SearchTrackParams` are defined identically in both files with no shared source of truth.

**Fix:** Move to `shared/types/beatport.ts` and import from both locations.
