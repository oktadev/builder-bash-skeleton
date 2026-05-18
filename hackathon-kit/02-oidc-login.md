# 02 — OIDC login (Authorization Code + PKCE)

## Prompt

> Implement OIDC Authorization Code + PKCE login against the xaa.dev
> IdP at `https://idp.xaa.dev`. Use whatever OIDC client library is
> idiomatic in your stack — but do not skip *any* of the security steps
> below.
>
> The login flow must:
>
> 1. **Discover** the IdP at
>    `https://idp.xaa.dev/.well-known/openid-configuration`.
>    Cache the result for **process lifetime** (no TTL — xaa.dev's
>    metadata is stable). Invalidate the cache only on a discovery
>    fetch failure, not on per-request failures. Expose a
>    `__resetOidcCache()` helper so tests can flush between cases.
> 2. **Generate** PKCE material. Concrete recipe: 32 random bytes →
>    base64url **unpadded** = a 43-char `code_verifier`. Then
>    `code_challenge = base64url(SHA-256(verifier))`, also unpadded.
>    Method `S256`. Stdlib hints:
>    - Python: `secrets.token_urlsafe(32)`
>    - Node: `crypto.randomBytes(32).toString('base64url')`
>    - Go: 32 bytes from `crypto/rand` + `base64.RawURLEncoding.EncodeToString`
>    - Rust: 32 bytes from `rand::rngs::OsRng` + `base64::engine::general_purpose::URL_SAFE_NO_PAD`
> 3. **Generate** `state` and `nonce` — independent, 32 random bytes
>    each (csprng), base64url unpadded. Same helpers as above.
> 4. **Build** the authorize URL with these query params (per
>    `reference/xaa-spec.md` § Step 0):
>    `client_id, redirect_uri, response_type=code,
>     scope=openid+profile+email, state, nonce, code_challenge,
>     code_challenge_method=S256`.
> 5. **Persist** `{code_verifier, state, nonce, created_at}` in the
>    server-side session before issuing the redirect.
> 6. **Reject** stale callbacks: if `created_at` is older than 10
>    minutes, redirect to `/login?error=expired_pkce`.
> 7. On callback: verify `state` matches the session's, exchange `code`
>    for tokens (auth code + PKCE), verify the `id_token`'s `nonce`
>    claim equals the session's nonce, then store on the session:
>    - `idToken` (raw JWT — server-side only)
>    - `claims` from the decoded ID Token (`sub`, `email`, `name`, `exp`)
>    - `loggedInAt` — server clock at callback completion, ISO-8601
>      (e.g. `new Date().toISOString()`). This is *not* the ID Token's
>      `iat`; it's how long the user has had a local session.
> 8. The ID Token MUST stay server-side. The `/api/auth/session`
>    endpoint returns only safe-to-render data — claims and a
>    redacted token state.
> 9. **Logout** destroys only the local session (clear the cookie /
>    server-stored session). Do **not** call the IdP's
>    `end_session_endpoint` — for the kit's scope, a local logout is
>    enough; an IdP-wide single-sign-out adds redirect bouncing that
>    isn't worth the complexity. (If you need it later, the discovery
>    doc exposes `end_session_endpoint`.)
>
> Provide:
>
> - `GET /api/auth/login` — start flow, 302 to IdP authorize URL.
> - `GET /api/auth/callback` — complete flow, 302 to `/dashboard`.
> - `POST /api/auth/logout` — destroy session, return JSON.
> - `GET /api/auth/session` — `{authenticated, claims?, tokenState?}`.

## Objective

Authenticated session backed by a real ID Token from xaa.dev. The
browser only ever sees an encrypted session cookie.

## Output (capabilities, not files)

| Capability                                | Notes                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `oidc.discover()` (cached)                | One per process, invalidated on failure.                               |
| `oidc.buildLoginUrl()`                    | Returns the authorize URL **and** the PKCE bundle for the session.     |
| `oidc.completeLogin(code, sessionPkce)`   | Returns `{idToken, claims}`.                                           |
| Session adapter holds `{user, pkce}`      | `user = {sub, email, name, loggedInAt}` plus the raw `idToken`.        |
| Login route                               | Saves PKCE in session before redirect; surfaces `?error=` on failure.  |
| Callback route                            | Validates state + nonce, ≤10 min PKCE age, then redirect to /dashboard. |
| Logout route                              | Destroys session.                                                      |
| Session-view route                        | Never returns the raw token.                                           |

## Issues you may hit

- **`redirect_uri` mismatch.** `Error: redirect_uri does not match
  registered URI` from the IdP. The path, port, and scheme must be
  byte-exact with the value registered at xaa.dev.
- **`nonce` missing in ID Token.** Some libraries omit `nonce` from the
  authorize URL by default. Verify the URL with curl.
- **PKCE base64url with padding.** RFC 7636 requires unpadded. Strip
  `=` from the challenge or your IdP will reject the verifier.
- **Stale cache during dev hot-reload.** If you hot-reload modules,
  the cached discovery may persist across reloads. Provide a
  `__resetOidcCache()` for tests so each scenario starts fresh.
- **Cookie not sent on callback.** If your dev server is on a different
  origin from the IdP redirect (rare, but happens with proxies), the
  session cookie may not survive. Confirm `SameSite=Lax`, not `Strict`.

## Fixes

- Print the assembled authorize URL once at boot with a redacted
  client_id and visually compare against the registered URI.
- Use a known-good library helper for PKCE (most languages have one
  in their standard crypto module: `secrets.token_urlsafe`,
  `crypto.randomBytes(32).toString('base64url')`, `rand.Read`, etc.).
- Add `nonce` explicitly to the authorize URL builder; don't trust
  defaults.

## Verification

```bash
# Boot
<your dev command>

# 1. Login route returns 307/302 with the IdP authorize URL.
curl -sS -i http://localhost:<port>/api/auth/login \
  | grep -i '^location:'
# Expect: location: https://idp.xaa.dev/authorize?client_id=…&redirect_uri=…&scope=openid+profile+email&code_challenge=…&code_challenge_method=S256&state=…&nonce=…&response_type=code

# 2. Session route returns unauthenticated by default.
curl -sS http://localhost:<port>/api/auth/session
# Expect: {"authenticated":false}
```

Plus a unit test that asserts `buildLoginUrl()` produces a URL
containing `client_id`, `redirect_uri`, `scope=openid…`,
`code_challenge_method=S256`, `state`, `nonce`, and a base64url
`code_challenge` of the correct length (43 chars for SHA-256).

End-to-end: open `/api/auth/login` in a browser, approve consent on
xaa.dev, confirm you land on `/dashboard` and `/api/auth/session`
returns `{authenticated: true, claims: {sub, email, …}}`.
