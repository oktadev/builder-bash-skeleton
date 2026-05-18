# 06 — Debugging playbook

These are the failure shapes every XAA implementation hits. Each entry
gives the symptom, the probable root cause, and a diagnostic prompt you
can paste back into your AI assistant.

---

## D-1 — `redirect_uri does not match registered URI`

### Symptom

The IdP returns the user to `/login?error=redirect_uri_mismatch` (or
similar). Browser DevTools network tab shows the IdP's authorize page
returning a 400.

### Root cause

`REDIRECT_URI` in `.env.local` is not byte-exact with the value
registered at xaa.dev. Common drift points:

- `http` vs `https`.
- `localhost` vs `127.0.0.1` vs `0.0.0.0`.
- Trailing slash.
- Path: the kit uses `/api/auth/callback`; the reference Express app
  used `/auth/callback`. Whichever you pick, register *that* one.
- Port mismatch (3000 vs 3001 vs whatever your dev server bound to).

### Debugging prompt

> Print the assembled authorize URL at startup and visually compare its
> `redirect_uri` query param to what's registered at xaa.dev. Pick one
> source of truth (the registration page) and conform `.env.local` to
> it.

---

## D-2 — `invalid_client` on Step 1 or Step 2

### Symptom

```
{"error":"invalid_client","error_description":"client authentication failed"}
```

### Root cause

Two possibilities, both about the *which* of two client pairs:

1. You sent `RESOURCE_CLIENT_ID/SECRET` to the IdP `/token`, or
   `CLIENT_ID/SECRET` to the auth server `/token`. The pairs are
   *not* interchangeable.
2. Authentication method mismatch (HTTP Basic vs form params). Most
   xaa.dev clients accept Basic; some require `client_secret_post`.
   Discovery's `token_endpoint_auth_methods_supported` tells you.

### Debugging prompt

> Print the authentication mode and client ID being used for each
> token endpoint. Confirm Step 1 uses `CLIENT_ID/CLIENT_SECRET` and
> Step 2 uses `RESOURCE_CLIENT_ID/RESOURCE_CLIENT_SECRET`. Adjust the
> auth method to whatever the discovery doc lists first.

---

## D-3 — `unsupported_grant_type`

### Symptom

```
{"error":"unsupported_grant_type"}
```

### Root cause

URN spelling. Almost always one of:

- `urn:ietf:params:oauth:grant-type:token-exchange` (Step 1) — note
  hyphen between `token` and `exchange`.
- `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2) — note hyphen
  between `jwt` and `bearer`.

It is **not** `jwt_bearer`, **not** `urn:ietf:params:oauth:grant_type:jwt-bearer`
(grant**_**type), **not** `token_exchange`.

### Debugging prompt

> Log the exact form-encoded body you POST to the token endpoint, then
> diff it against `reference/xaa-spec.md` § Step 1 and § Step 2. The
> URNs are case-sensitive and hyphenated.

---

## D-4 — `invalid_grant: subject_token expired` on Step 1

### Symptom

Step 1 returns `{"error":"invalid_grant", "error_description":"…"}`
where the description references expiry.

### Root cause

The ID Token in your session has crossed its `exp` (typically 1 h on
xaa.dev).

### Debugging prompt

> The IdP says my subject_token is expired. Map this to the
> `expired_token` ErrorCode and surface a re-auth prompt in the UI per
> `reference/error-mapping.md` § Token-exchange failure decoding.

---

## D-5 — Step 1 succeeds but Step 2 fails with `invalid_grant`

### Symptom

ID-JAG arrives, but the auth-server rejects it as
`{"error":"invalid_grant", "error_description":"audience mismatch"}` (or
similar).

### Root cause

The `audience` and/or `resource` form fields on Step 1 didn't match
what the auth server expects. The IdP encodes both into the ID-JAG; the
auth server checks them.

### Debugging prompt

> The auth server rejects my ID-JAG with audience/resource mismatch.
> Confirm `audience=https://auth.resource.xaa.dev` and
> `resource=https://api.resource.xaa.dev` (or your BYOR resource URL)
> on Step 1 are the exact strings the auth server is configured with —
> no trailing slash drift, no scheme drift. The resource registration
> at xaa.dev is canonical.

---

## D-6 — `nonce` missing or mismatched on callback

### Symptom

Callback throws on `nonce` validation.

### Root cause

Either (a) the authorize URL was built without a `nonce` parameter, or
(b) the session-stored nonce wasn't compared to the ID Token's `nonce`
claim.

### Debugging prompt

> Add an explicit `nonce` parameter to the authorize URL builder and a
> verification step on callback that compares the session's stored
> nonce to `id_token.nonce`. Reject the callback if they differ.

---

## D-7 — PKCE base64url padding

### Symptom

`code_verifier` is rejected by the IdP at the auth-code → tokens step,
even though discovery and authorize succeeded.

### Root cause

The `code_challenge` includes `=` padding. RFC 7636 requires
**unpadded** base64url.

### Debugging prompt

> My PKCE verifier is rejected. Strip `=` padding from
> `base64url(SHA-256(verifier))` before sending as the
> `code_challenge`. Most language stdlibs have an "url-safe, no
> padding" base64 helper (`base64.urlsafe_b64encode().rstrip(b"=")` in
> Python; `base64url` in Node 16+; `base64.RawURLEncoding` in Go).

---

## D-8 — Session cookie not present on callback

### Symptom

Callback can't find the PKCE transaction in the session — looks like a
fresh visit.

### Root cause

Cookie `SameSite` is `Strict`, blocking the cookie on the cross-site
return from the IdP. Or `secure: true` over HTTP localhost in some
browsers.

### Debugging prompt

> Set the session cookie with `SameSite=Lax` (the OIDC redirect is a
> top-level navigation; Lax allows it). For local HTTP dev set
> `secure: false`; flip back to `true` in production.

---

## D-9 — In-memory log buffer empties on every reload

### Symptom

Every dev hot-reload wipes the observability buffer.

### Root cause

The buffer lives in module-level state. Hot-reload re-imports the
module and resets it.

### Resolution

Two options:

1. Accept it. The buffer is a dev/playground convenience; persistence
   isn't a goal.
2. Lift the buffer to a process-singleton storage (Redis / sqlite /
   file) — only worth it if you want logs across reloads.

---

## D-10 — Discriminated-union narrowing fails (typed languages)

### Symptom

Your type checker says `error` doesn't exist on `CallResult |
ApiError` even though you're inside an `if (!result.ok)` branch.

### Root cause

You declared `ok: boolean` instead of `ok: true` (success arm) and
`ok: false` (error arm). Without literal types the union doesn't
narrow.

### Resolution

Use literals: `ok: true` on success, `ok: false` on error. Example for
TypeScript:

```ts
type ApiResponse<T> = { ok: true; ... } | { ok: false; error: ErrorCode; ... };
```

Equivalent patterns: Rust `Result<T, E>`, Kotlin sealed classes, F#
discriminated unions, Python `Literal[True]/Literal[False]` with
`mypy --strict`.

---

## D-11 — Tests load environment lazily but config validates at import

### Symptom

`pytest` / `vitest` / etc. fails to import any module that touches
config because the config module asserts env vars at import time, before
the test setup has populated them.

### Resolution

Wrap config validation in a function called on first use:

```
def load_config():    # not module-top-level
    ...validate and return...
```

Tests then populate env vars in their setup hook before any code calls
`load_config()`.

---

## D-12 — ID Token signature verification fails

### Symptom

Your OIDC library raises something like `JWSInvalidSignature`,
`UnknownKid`, or `JWTSignatureError` during the auth-code → tokens
exchange or on a later re-validation.

### Root cause

Three usual suspects:

1. **JWKS not fetched.** Your library expects you to provide a
   `jwks_uri` (or call `get_jwks()` once) before verifying. Some
   libraries auto-fetch from discovery; others don't.
2. **Cached JWKS is stale.** xaa.dev rotated keys, your cache still
   has the old `kid`.
3. **Wrong issuer.** You're verifying with one IdP's keys but the
   token was issued by another (e.g. a stale `IDP_URL` mock leaked
   into the test/prod path).

### Debugging prompt

> My ID Token fails signature verification. Confirm the OIDC client is
> using `jwks_uri` from the discovery document at
> `https://idp.xaa.dev/.well-known/openid-configuration`. If the
> failing token's `kid` header isn't in the cached JWKS, refetch
> `jwks_uri` and retry the verification once before failing.

---

## D-13 — Callback never returns / browser shows blank page

### Symptom

You click "Sign in", land on the xaa.dev consent screen, approve, and
the browser hangs at the redirect — no `/dashboard`, no `/login?error=`,
nothing in the server log.

### Root cause

Three usual suspects:

1. **Cookie blocked on cross-site return.** Browser is set to block
   third-party cookies, or your `SameSite=Strict` cookie didn't
   survive the IdP redirect. See D-8.
2. **Callback route crashed before responding.** Look at the server
   log; an uncaught exception in state/nonce verification can leave
   the request hanging if your stack doesn't have a default error
   handler.
3. **Redirect URI doesn't actually exist on your server.** You
   registered `/api/auth/callback` but your route is at
   `/auth/callback`. The IdP's redirect lands on a 404.

### Debugging prompt

> The OIDC callback never completes. Check (a) the server log for an
> uncaught exception in the callback handler, (b) the Network tab in
> DevTools — does the redirect from xaa.dev hit your server at all,
> and what does it return? (c) Confirm the registered redirect URI
> matches a route that actually exists in your app.

---

## Generic diagnostic recipes

### Reproduce on the wire with curl

```bash
# Step 1
curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
     -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
     -d "subject_token=${ID_TOKEN}" \
     -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
     -d "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
     -d "audience=https://auth.resource.xaa.dev" \
     -d "resource=https://api.resource.xaa.dev" \
     -d "scope=${RESOURCE_SCOPES}" \
     "https://idp.xaa.dev/token"

# Step 2
curl -sS -u "${RESOURCE_CLIENT_ID}:${RESOURCE_CLIENT_SECRET}" \
     -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
     -d "assertion=${ID_JAG}" \
     -d "scope=${RESOURCE_SCOPES}" \
     "https://auth.resource.xaa.dev/token"

# Step 3
curl -sS -i -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     "https://api.resource.xaa.dev${RESOURCE_PATH}"
```

If curl works and your code doesn't, the bug is in your client. If
curl fails too, the bug is in your registration / env / spec
understanding — not your code.
