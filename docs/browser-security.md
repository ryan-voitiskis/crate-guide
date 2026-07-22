# Browser security response policy

Crate Guide applies browser containment in the Nitro response path that is
compiled into the Cloudflare Pages Worker. It does not depend on an untracked
Cloudflare dashboard rule or a blanket `_headers` rule that misses Worker
responses.

HTML responses enforce frame, base-URL, and object containment alongside
`DENY` framing, MIME sniffing protection, a strict-origin referrer policy, and
least-privilege browser capabilities. HTTPS responses receive a deliberately
short `Strict-Transport-Security: max-age=86400`; local HTTP does not. Increasing
that duration or adding `includeSubDomains` or `preload` requires a separate
hosted/domain-ownership decision.

The resource policy remains report-only. Executable inline scripts emitted by
Nuxt, including the theme bootstrap, are hashed from the final HTML response.
Supabase HTTP/WebSocket origins and the Discogs image host are explicit. The
image policy also permits HTTPS because record editing intentionally accepts a
user-selected external cover URL; that allowance is confined to images. Vue's
dynamic visual controls require inline style attributes, while inline style
elements remain disallowed. Essentia's local WASM analysis requires
`wasm-unsafe-eval`; general `unsafe-eval`, wildcards, and inline scripts are not
allowed.

Before release, run:

```bash
npm run verify:full
```

After a separately authorized production deployment, verify the hosted
response without changing provider state:

```bash
curl --fail --silent --show-error --head --proto '=https' https://crate.guide/
```

Confirm the response has the enforced and report-only CSP headers,
`x-frame-options: DENY`, `x-content-type-options: nosniff`, the referrer and
permissions policies, and `strict-transport-security: max-age=86400`, with no
`x-powered-by`. A local green build is not proof that a particular hosted
release is current; repeat this read-only check after every deployment.
