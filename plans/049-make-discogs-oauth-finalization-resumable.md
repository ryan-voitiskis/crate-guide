# Plan 049: Make Discogs OAuth finalization resumable

> **Executor instructions**: Treat every outbound Discogs request as a charged
> provider operation and every stored credential transition as a resumable
> state machine. Do not log or return token material. Reproduce identity failure
> after exchange before changing the flow, then commit conventionally.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: Plans 004, 006, and 022
- **Category**: OAuth / reliability / rate limiting
- **Planned at**: commit `aba27ff`, 2026-07-19
- **Status**: READY

## Why this matters

The access-token handler persists access credentials before identity/profile
finalization. If identity parsing, its upstream request, or the profile update
fails, the handler returns an error but leaves a usable token stored; repeating
the verifier exchange is not a dependable recovery path. The callback also
consumes one quota unit while performing the token exchange, authenticated
identity request, and usually a user-resource request.

## Scope

Modify:

- `supabase/functions/get-discogs-access-token/handler.ts`
- `supabase/functions/get-discogs-access-token/handler.test.ts`
- `supabase/functions/_shared/discogs/fetchAndSetIdentity.ts`
- `supabase/functions/_shared/discogs/makeAuthenticatedRequest.ts`
- `supabase/functions/_shared/discogs/credentials.ts`
- their focused tests
- `app/stores/discogsAuthStore.ts` and callback UI only if an explicit retry
  state must be represented
- `docs/discogs-integration.md` and its contract gate

A forward migration may add a non-secret connection/finalization status only if
the state cannot be derived safely from existing credentials/profile fields.

Do not expose credentials to browser roles, place OAuth parameters in URLs,
weaken callback-token validation, or log upstream response bodies.

## Drift check

```bash
git status --short
rg -n "consumeRequestQuota|setAccessCredentials|fetchIdentity|access_token|identity" supabase/functions/get-discogs-access-token supabase/functions/_shared/discogs
rg -n "identity.*fail|retry|stored" supabase/functions/get-discogs-access-token/*.test.ts app/stores
```

STOP if Discogs documents the exchanged access token as unusable for a safe
identity retry, or if resumption would allow one authenticated user to finalize
another user's credentials.

## Required implementation

1. Model exchange and identity as resumable phases.
   - A valid first callback exchanges and stores access credentials, then
     attempts identity finalization.
   - If finalization fails after storage, return a specific public retryable
     state without asking the client to re-exchange the verifier.
   - A subsequent authenticated finalization request detects that caller's
     stored complete access credentials and retries identity only. It never
     accepts a caller-selected user or token.
   - On success, clear obsolete request credentials and publish the connected
     profile state atomically enough that UI cannot report connection before
     identity is valid.

2. Charge every provider request through one transport boundary.
   - Token exchange, authenticated identity, and optional resource/avatar fetch
     each reserve their real cost before dispatch.
   - If a multi-request phase reserves atomically, refund only calls that are
     provably not dispatched; otherwise charge individually.
   - The global configured allowance must remain below the provider ceiling
     after worst-case callback traffic.

3. Make optional avatar retrieval non-fatal and quota-aware.
   - Identity/profile completion must not fail merely because an avatar request
     fails, but the request still counts if dispatched.
   - Preserve trusted-host validation and generic logging.

4. Add state-machine and quota tests.
   - Fail identity HTTP, JSON parsing, and profile update after credentials are
     stored; retry without another token exchange and complete successfully.
   - Reject resumption without complete credentials and across accounts.
   - Assert exact quota calls and no provider dispatch after quota denial for
     every phase.
   - Assert no secret appears in URLs, logs, or public errors.

## Test plan

```bash
npm run format
npm run check:edge
npm run lint:edge
npm run test:edge
npm run check:discogs-docs
npm run check:conventions
npm run verify
git diff --check
```

If a migration is added, also run `npm run test:db`, regenerate both type
copies, and finish with `npm run verify:full`.

## Done criteria

- [ ] Identity failure after exchange has a safe same-user retry path.
- [ ] Resumption never repeats the verifier exchange or crosses credential ownership.
- [ ] Every dispatched Discogs request is represented in quota accounting.
- [ ] Optional avatar failure cannot invalidate a completed identity.
- [ ] Edge, docs, schema-if-applicable, and full gates pass.

## STOP conditions

Stop if recovery requires exposing a token to the browser, if provider-call cost
cannot be reserved without a quota race, if stored partial state cannot be
distinguished safely, or if public errors reveal credential/provider bodies.

## Git workflow

- Branch: `codex/049-make-discogs-oauth-finalization-resumable`
- Commit: `fix(discogs): resume oauth identity finalization`
