# Security Enhancements - Crate Guide

## Overview

The application has a solid security foundation with Supabase Auth, RLS policies, and proper input validation. However, several areas need hardening, particularly around Edge Functions and HTTP security headers.

## Current Security Posture

| Area | Status | Notes |
|------|--------|-------|
| Authentication | ✅ Strong | Supabase Auth with email/OAuth |
| Authorization (RLS) | ✅ Strong | User isolation at DB level |
| Input Validation | ✅ Strong | Zod schemas, VeeValidate |
| XSS Prevention | ✅ Strong | Vue auto-escaping, no v-html |
| SQL Injection | ✅ Strong | Parameterized queries via Supabase SDK |
| Secrets Management | ✅ Good | Env vars, no hardcoded secrets |
| CORS | ⚠️ Needs Work | Wildcard origin in Edge Functions |
| CSP Headers | ❌ Missing | No Content Security Policy |
| Error Disclosure | ⚠️ Needs Work | Edge Functions expose stack traces |

## Priority 1: Critical Security Issues

### 1.1 Edge Function Error Information Disclosure

**Location**: All Edge Functions in `supabase/functions/`

**Current Code**:
```typescript
// get-discogs-request-token/index.ts
catch (e) {
  return new Response(JSON.stringify(e), { headers, status: 500 })
}
```

**Risk**: Exposes internal error messages, stack traces, and potentially sensitive information to clients.

**Fix**:
```typescript
catch (e) {
  console.error('Function error:', e)
  return new Response(JSON.stringify({ error: 'Internal server error' }),
    { headers, status: 500 })
}
```

**Files to Update**:
- `supabase/functions/get-discogs-request-token/index.ts`
- `supabase/functions/get-discogs-access-token/index.ts`
- `supabase/functions/authenticated-discogs-request/index.ts`

### 1.2 CORS Wildcard Origin

**Location**: `supabase/functions/_shared/cors.ts`

**Current Code**:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // ...
}
```

**Risk**: Allows any domain to call Edge Functions. While auth is required, this is overly permissive.

**Fix**:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') || 'https://crate.guide',
  // ...
}
```

### 1.3 Missing URL Validation in authenticated-discogs-request

**Location**: `supabase/functions/authenticated-discogs-request/index.ts`

**Risk**: No validation that the URL is a legitimate Discogs API endpoint. Could be exploited for SSRF attacks.

**Fix**:
```typescript
const ALLOWED_DISCOGS_HOSTS = ['api.discogs.com']

function validateDiscogsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_DISCOGS_HOSTS.includes(parsed.host)
  } catch {
    return false
  }
}

// In handler:
if (!validateDiscogsUrl(requestBody.url)) {
  return new Response('Invalid URL', { status: 400 })
}
```

## Priority 2: Important Security Improvements

### 2.1 Add Content Security Policy Headers

**Location**: `nuxt.config.ts` or server middleware

**Implementation**:
```typescript
// nuxt.config.ts
nitro: {
  routeRules: {
    '/**': {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' https://i.discogs.com https://geo-media.beatport.com data:",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          "frame-ancestors 'none'"
        ].join('; '),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    }
  }
}
```

### 2.2 Remove Edge Function Module-Level Caching

**Location**: `supabase/functions/_shared/supabaseHelpers.ts`

**Current Code**:
```typescript
let cachedSupabaseClient: SupabaseClient | null = null
let cachedUser: User | null = null
let cachedProfile: Profile | null = null
```

**Risk**: In serverless environments, module state can persist across invocations serving different users.

**Fix**: Create fresh client per request:
```typescript
export async function getAuthenticatedUser(authHeader: string) {
  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return { supabase, user, profile }
}
```

### 2.3 Add HSTS Header

**Add to CSP headers above**:
```typescript
'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
```

## Priority 3: Recommended Improvements

### 3.1 Encrypt Discogs OAuth Tokens at Rest

**Current**: Tokens stored in plaintext in `profiles` table.

**Recommendation**: Use Supabase Vault or application-level encryption for `discogs_access_token` and `discogs_access_secret`.

### 3.2 Add Rate Limiting to Edge Functions

**Implementation**: Use Supabase's built-in rate limiting or implement custom logic:
```typescript
// Check rate limit before processing
const rateLimitKey = `discogs_${user.id}`
const requests = await redis.incr(rateLimitKey)
if (requests === 1) await redis.expire(rateLimitKey, 60)
if (requests > 60) {
  return new Response('Rate limit exceeded', { status: 429 })
}
```

### 3.3 Add Audit Logging

**Implementation**: Log authentication events and sensitive operations:
```typescript
async function logSecurityEvent(userId: string, action: string, details: object) {
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    details,
    ip_address: request.headers.get('x-forwarded-for'),
    created_at: new Date().toISOString()
  })
}
```

### 3.4 OAuth Token Expiry Validation

**Current**: No check if Discogs tokens are still valid before use.

**Fix**: Add token validation before authenticated requests:
```typescript
// Check token freshness (Discogs tokens don't expire, but good practice)
if (!profile.discogs_access_token || !profile.discogs_access_secret) {
  throw new Error('Discogs not connected')
}
```

## Beatport Scraping Considerations

### Legal/ToS Risk
Web scraping Beatport may violate their Terms of Service. Consider:
1. Using Beatport's official API (if available for your use case)
2. Adding clear user consent for automated data fetching
3. Implementing aggressive rate limiting (1 req/sec max)
4. Caching results to minimize requests

### Technical Hardening
```typescript
// server/api/beatport/search.get.ts
// Add timeout and error handling
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 10000)

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ... other options
  })
} finally {
  clearTimeout(timeoutId)
}
```

## Implementation Checklist

- [ ] Fix error disclosure in all Edge Functions
- [ ] Restrict CORS to SITE_URL
- [ ] Add URL validation for Discogs proxy
- [ ] Remove module-level caching in Edge Functions
- [ ] Add CSP, HSTS, X-Frame-Options headers
- [ ] Add request timeouts to all fetch calls
- [ ] Consider Discogs token encryption
- [ ] Document Beatport scraping risks
