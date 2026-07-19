# Plan 004: Move Discogs OAuth credentials and signatures into Authorization headers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 99a570f..HEAD -- supabase/functions/get-discogs-request-token supabase/functions/get-discogs-access-token supabase/functions/_shared/discogs/makeAuthenticatedRequest.ts supabase/functions/_shared/discogs/makeAuthenticatedRequest.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `99a570f`, 2026-07-19
- **Completed by**: commit `39f2134` (integrated as `f2c3eff`), 2026-07-19

## Why this matters

All three Discogs OAuth paths currently place consumer keys, tokens, verifiers,
and signatures in URLs. URLs are routinely retained by proxies, tracing,
network tooling, and error reports, expanding the exposure surface of secrets.
OAuth parameters belong in the `Authorization: OAuth ...` header while normal
Discogs pagination/query parameters remain in the request URL and signature
base string.

## Current state

- `supabase/functions/get-discogs-request-token/handler.ts:73-87` builds a
  `URLSearchParams` containing `oauth_signature` and fetches
  `request_token?${params}`.
- `supabase/functions/get-discogs-access-token/handler.ts:92-106` sends the
  request token, verifier, consumer key, and PLAINTEXT signature in the access
  token URL.
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.ts:41-77` merges
  OAuth fields with endpoint query fields, then serializes every field into the
  final GET URL:

  ```ts
  const finalParams = new URLSearchParams()
  for (const [key, value] of Object.entries(signatureParams)) {
    finalParams.append(key, value)
  }
  finalParams.append('oauth_signature', encodedSignature)
  return await fetcher(`${baseUrl}?${finalParams}`, { ... })
  ```

- `makeAuthenticatedRequest.test.ts:119-145` currently asserts the requested
  URL includes `oauth_signature=`. Request/access handler tests validate storage
  and safe errors but do not inspect the outbound URL/header.
- Credential repository behavior and endpoint allowlisting are already tested;
  preserve them.
- Edge code is formatted by Prettier. Do not run `deno fmt` and never add real
  credential values to fixtures or logs.

## Commands you will need

| Purpose             | Command                      | Expected on success |
| ------------------- | ---------------------------- | ------------------- | -------- | ----------------------------------------------- | -------------------------- |
| Edge tests          | `npm run test:edge`          | all Deno tests pass |
| Edge typecheck      | `npm run check:edge`         | exit 0              |
| Edge lint           | `npm run lint:edge`          | exit 0              |
| Full gate           | `npm run verify`             | exit 0              |
| Secret-in-URL check | `rg -n "oauth\_(consumer_key | token               | verifier | signature)=" supabase/functions --glob '\*.ts'` | no production-code matches |

## Scope

**In scope** (the only files you should modify):

- `supabase/functions/_shared/discogs/oauthAuthorization.ts` (create)
- `supabase/functions/_shared/discogs/oauthAuthorization.test.ts` (create)
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.ts`
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.test.ts`
- `supabase/functions/get-discogs-request-token/handler.ts`
- `supabase/functions/get-discogs-request-token/handler.test.ts`
- `supabase/functions/get-discogs-access-token/handler.ts`
- `supabase/functions/get-discogs-access-token/handler.test.ts`
- `plans/README.md` status row

**Out of scope**:

- Credential storage/RLS/RPC design
- OAuth callback route, endpoint allowlist, retry policy, or rate limiting
- Switching Discogs signature algorithms
- Discogs documentation; Plan 022 owns the final docs
- Logging any OAuth header, token, secret, verifier, signature, or raw response

## Git workflow

- Branch: `codex/004-discogs-oauth-headers`
- Prefer two logical commits only if needed: helper/tests, then callers. Example
  final commit: `fix(discogs): send OAuth credentials in headers`.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Add one RFC 5849 header encoder

Create `oauthAuthorization.ts` exporting:

```ts
export function encodeOAuthComponent(value: string): string
export function buildOAuthAuthorizationHeader(
	parameters: Readonly<Record<string, string>>
): string
```

Encode with `encodeURIComponent`, additionally escaping `!`, `'`, `(`, `)`, and
`*` using uppercase percent bytes. Sort keys, encode each key/value exactly once,
quote values, and return `OAuth key="value", ...`. Reject empty keys and any key
that does not start `oauth_`; this prevents business query fields entering the
header by accident. The helper must not log inputs.

Add unit tests for deterministic sorting, reserved characters, empty/invalid
keys, and a synthetic signature containing `+`, `/`, and `=`.

**Verify**: `cd supabase && deno test functions/_shared/discogs/oauthAuthorization.test.ts`
-> all new tests pass.

### Step 2: Move request-token OAuth parameters into the header

In `get-discogs-request-token/handler.ts`, build raw OAuth values in a plain
record. For PLAINTEXT, the raw signature is
`${consumerSecret}&` (no pre-encoded `%26`); the header helper performs the one
required encoding pass. Fetch the clean constant `requestTokenUrl`. Preserve
method `GET`, callback, nonce/timestamp, `User-Agent`, authentication, storage,
and public error handling.

Update the handler test to capture URL and `RequestInit`, then assert:

- URL equals `https://api.discogs.com/oauth/request_token`;
- URL has no `oauth_` query entries;
- `Authorization` starts `OAuth ` and contains encoded callback/signature fields;
- `User-Agent` remains present;
- no captured/logged URL contains the fixture consumer secret.

**Verify**: `cd supabase && deno test functions/get-discogs-request-token/handler.test.ts`
-> all tests pass.

### Step 3: Move access-token OAuth parameters into the header

In `get-discogs-access-token/handler.ts`, keep the POST and clean
`accessTokenUrl`. Build the PLAINTEXT raw signature as
`${consumerSecret}&${requestSecret}` and put consumer key, nonce, token,
signature method, timestamp, verifier, and signature only in the OAuth header.
Preserve callback-token validation, identity fetch ordering, and safe errors.

Extend its test to assert clean URL, POST method, OAuth header, preserved user
agent, and absence of the verifier/request secret in the URL and logs.

**Verify**: `cd supabase && deno test functions/get-discogs-access-token/handler.test.ts`
-> all tests pass.

### Step 4: Keep business query parameters in authenticated-read URLs only

In `makeAuthenticatedRequest.ts`, continue feeding both OAuth parameters and
every existing URL query parameter to `oauthSignature.generate`. Request an
unencoded signature from `oauth-signature` (`{ encodeSignature: false }`) so the
header helper performs the only output encoding. The fetched URL must be the
original parsed URL, including only its business query parameters. The OAuth
header contains only OAuth fields plus signature; preserve `User-Agent`, timeout,
GET-only behavior, and sanitized transport errors.

Update tests to use a URL containing `page=2&per_page=100` and assert those two
parameters remain, all `oauth_*` parameters are absent from the URL, the header
contains the synthetic token/signature, and an abort signal is still supplied.

**Verify**: `cd supabase && deno test functions/_shared/discogs/makeAuthenticatedRequest.test.ts`
-> all tests pass.

### Step 5: Run security regression searches and full gates

Do not search `.env` files or print their contents. Search only tracked
TypeScript for serialized OAuth query names, then format and run all gates.

**Verify**: `npm run format && npm run check:edge && npm run lint:edge && npm run test:edge && npm run check:conventions && npm run verify`
-> exit 0.

## Test plan

- New helper tests prove exact one-pass encoding and stable order.
- Each exchange handler test captures both URL and header and asserts sensitive
  OAuth fields are absent from the URL.
- Authenticated request tests preserve endpoint query signing while proving the
  outbound URL contains only endpoint/business parameters.
- Keep all existing missing-auth, timeout, transport, storage-order, callback
  validation, and redaction tests green.
- After local tests, perform one manually authorized Discogs connect/import
  walkthrough using a test account. Inspect only status codes and parameter
  names; never record header values.

## Done criteria

- [ ] Every outbound Discogs OAuth request uses an OAuth Authorization header.
- [ ] No outbound URL contains consumer key, token, verifier, or OAuth signature.
- [ ] Normal `page`/`per_page` query parameters remain in the URL and signature
      base string.
- [ ] Synthetic special-character tests prove no double encoding.
- [ ] Existing timeout, safe-error, callback-token, and storage tests pass.
- [ ] `npm run verify` exits 0.
- [ ] No files outside scope are modified.
- [ ] `plans/README.md` status row is updated.

## STOP conditions

Stop and report back if:

- `oauth-signature@1.5.0` cannot return an unencoded signature using its options
  API; do not guess or double encode.
- Discogs rejects standards-compliant Authorization headers in the manual smoke
  test. Capture only sanitized status/response classification; do not fall back
  to query credentials without approval.
- A required change touches credential storage, endpoint dispatch, or browser
  OAuth state.
- Any test/log output contains a real credential value.
- A verification command fails twice after a reasonable in-scope fix.

## Maintenance notes

- Any new Discogs OAuth step must use the shared header helper and must keep
  business parameters separate from OAuth parameters.
- Reviewers should scrutinize raw-vs-encoded signature handling; this is the
  highest regression risk.
- Plan 022 updates documentation only after this and the remaining Discogs
  security plans land.
