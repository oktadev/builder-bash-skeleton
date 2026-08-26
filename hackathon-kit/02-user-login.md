# 02 — User login (OIDC or SAML)

> **This file branches.** Read § Both paths, then **only** the section
> for your `XAA_PROTOCOL`. Don't read the other one — it wastes context
> and invites mixing the two.
>
> Whichever path you take, the output is the same: **a refresh token in
> the session.** That is the goal of this step.

## Prompt

> Implement user login against the xaa.dev IdP at
> `https://idp.xaa.dev`, ending with an IdP **refresh token** stored in
> the server-side session. Use whatever OIDC or SAML library is
> idiomatic in your stack — but do not skip *any* of the security steps
> below.
>
> ### Both paths
>
> 1. **Persist a login transaction** server-side before redirecting the
>    user out, keyed by an httpOnly cookie. Include a `created_at`.
> 2. **Reject stale returns**: if `created_at` is older than 10
>    minutes, redirect to `/login?error=expired_transaction`.
> 3. **On success, store on the session:**
>    - `refreshToken` — **the session anchor.** Server-side only.
>    - `claims` — for rendering (`sub` or `sub_id`, `email`, `name`).
>    - `loggedInAt` — server clock at completion, ISO-8601. This is
>      *not* any token's `iat`; it's how long the user has had a local
>      session.
> 4. **No raw token reaches the browser.** `/api/auth/session` returns
>    only safe-to-render data — claims plus a redacted token state.
> 5. **Logout** destroys only the local session. Do **not** call the
>    IdP's `end_session_endpoint` (OIDC) or `/saml/slo` (SAML) — for the
>    kit's scope a local logout is enough, and single-sign-out adds
>    redirect bouncing that isn't worth the complexity.
>
>    Be honest in the UI about what logout does: xaa.dev has **no
>    revocation endpoint**, so the refresh token stays valid upstream
>    until it expires. `end_session_endpoint` exists
>    (`https://idp.xaa.dev/session/end`, or `/saml/slo`) and *might*
>    invalidate outstanding refresh tokens, but that is `TODO(confirm)` —
>    undocumented and untested. Don't claim it in your UI unless you've
>    verified it.
>
> Provide:
>
> - `GET /api/auth/login` — start flow, 302 (or form-POST) to the IdP.
> - `POST /api/auth/logout` — destroy session, return JSON.
> - `GET /api/auth/session` — `{authenticated, claims?, tokenState?}`.
> - Plus **one** of:
>   - `GET /api/auth/callback` — **OIDC path.**
>   - `POST /api/auth/saml/acs` — **SAML path.**

---

### ▸ OIDC path — Authorization Code + PKCE

> 1. **Discover** the IdP at
>    `https://idp.xaa.dev/.well-known/openid-configuration`.
>    Cache the result for **process lifetime** (no TTL — xaa.dev's
>    metadata is stable). Invalidate the cache only on a discovery
>    fetch failure, not on per-request failures. Expose a
>    `__resetOidcCache()` helper so tests can flush between cases.
>
>    Note `https://idp.xaa.dev/.well-known/oauth-authorization-server`
>    returns **404** — the IdP publishes OIDC discovery only.
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
>    `reference/xaa-spec.md` § Step 0 → OIDC path):
>    `client_id, redirect_uri, response_type=code,
>     scope=openid+profile+email+offline_access, prompt=consent, state,
>     nonce, code_challenge, code_challenge_method=S256`.
>
>    **`offline_access` is what makes the IdP return a refresh token.**
>    Omit it and this whole step produces nothing durable — the session
>    dies with the ID Token in ~10 minutes. This is the single most
>    important parameter on this page.
>
>    `prompt=consent` is what xaa.dev's own demo sends alongside
>    `offline_access`. `TODO(confirm)` whether it is *required* to obtain
>    a refresh token or merely conventional — if you drop it and still
>    get a `refresh_token`, it wasn't required.
> 5. **Persist** `{code_verifier, state, nonce, created_at}` in the
>    session before issuing the redirect.
> 6. On callback: verify `state` matches the session's, exchange `code`
>    for tokens (auth code + PKCE), verify the `id_token`'s `nonce`
>    claim equals the session's nonce.
> 7. **Store the `refresh_token`** from the token response as the
>    session anchor. Store the ID Token's *claims*; keep the raw ID
>    Token only if you want it for diagnostics, and don't build anything
>    that depends on it surviving.
>
>    **Assert the response actually contained a `refresh_token`.** If it
>    did not, fail loudly with a message naming `offline_access` — a
>    silent absence here resurfaces ten minutes later as a mystery
>    `invalid_grant`, which is a miserable thing to debug.
> 8. **Skip Step 0b.** You already have a refresh token; `03` goes
>    straight to Step 1.

The token response you are parsing:

```json
{
  "access_token":  "<IdP access token — this kit never uses it>",
  "id_token":      "<JWT — verify nonce, take claims, then done>",
  "refresh_token": "<THE SESSION ANCHOR>",
  "token_type":    "Bearer",
  "expires_in":    600
}
```

That `expires_in: 600` belongs to the IdP access token, and the ID
Token's life is similar (~10 min). Neither is your session's lifetime.
The refresh token's lifetime is `TODO(confirm)` — undocumented by
xaa.dev.

---

### ▸ SAML path — SP-initiated Web Browser SSO, then Step 0b

> **This path has two hops before you hold a refresh token.** SSO gets
> you an assertion; Step 0b trades it for the refresh token. Both belong
> to this step — the user is not logged in, for our purposes, until the
> refresh token is stored.
>
> **1. Fetch and cache the IdP's SAML metadata**, the analogue of OIDC
> discovery:
>
> ```
> GET https://idp.xaa.dev/saml/metadata
> ```
>
> | Property                  | Value                                   |
> | ------------------------- | --------------------------------------- |
> | `entityID`                | `https://idp.xaa.dev/saml`              |
> | SSO endpoint              | `https://idp.xaa.dev/saml/sso` (HTTP-Redirect + HTTP-POST) |
> | SLO endpoint              | `https://idp.xaa.dev/saml/slo`          |
> | Signing cert CN           | `IdenX SAML IdP`                        |
> | `WantAuthnRequestsSigned` | `false` — you need **no SP signing key** to send an `<AuthnRequest>` |
>
> Extract the signing certificate; you need it at step 4.
>
> **2. Build and send an `<AuthnRequest>`** to the SSO endpoint.
> - Carry your CSRF/transaction token in **`RelayState`** — SAML's
>   analogue of OIDC `state`.
> - Record the request's `ID` in the session; you verify the response's
>   `InResponseTo` against it. This is the closest analogue of `nonce`.
> - Set the requested NameID format from `SAML_NAMEID_FORMAT`
>   (`emailAddress` or `persistent`). **Never `transient`** — your
>   resource server keys users by NameID, so a per-session random value
>   creates a new user on every login.
> - Persist `{relayState, authnRequestId, created_at}` before redirecting.
>
> **3. Receive the `SAMLResponse`** at `SAML_ACS_URL` via **HTTP-POST**
> (form field `SAMLResponse`, standard base64). Note this is a
> cross-site POST — see the cookie note under Issues.
>
> **4. Validate the response before trusting anything in it.** All of
> these are mandatory:
> - **XML signature** against the metadata signing cert. Use a real
>   library; do not hand-roll XML-DSIG. Verify the signature covers the
>   assertion you are about to use — signature-wrapping attacks work by
>   signing one element and substituting another.
> - **`InResponseTo`** equals the session's `authnRequestId`.
> - **`RelayState`** equals the session's `relayState`.
> - **`Conditions/AudienceRestriction`** names your SP entityID.
> - **`NotBefore` / `NotOnOrAfter`** bracket now, with a small skew
>   allowance.
> - **`Status`** is `urn:oasis:names:tc:SAML:2.0:status:Success`.
>
> **5. Extract the bare `<saml:Assertion>` element** — *not* the whole
> `SAMLResponse` document — then base64url-encode it **unpadded**.
>
> RFC 8693 § 3 specifies base64url for `…token-type:saml2`. (Draft-04's
> own § 4.5 example shows *standard padded* base64, which would not
> survive form-encoding — a literal `+` decodes to a space. Follow
> RFC 8693.)
>
> Prefer your XML library's serialiser. If you must do it textually, the
> element is matched by `/<saml2?:Assertion[\s\S]+?<\/saml2?:Assertion>/`
> — but a regex over signed XML is fragile, and re-serialising can break
> the signature's canonicalisation if you alter so much as whitespace.
> Extract the exact bytes.
>
> **6. Step 0b — exchange the assertion for a refresh token** (per
> `reference/xaa-spec.md` § Step 0b):
>
> ```
> POST https://idp.xaa.dev/token
> grant_type=urn:ietf:params:oauth:grant-type:token-exchange
> subject_token=<base64url-unpadded bare assertion>
> subject_token_type=urn:ietf:params:oauth:token-type:saml2
> requested_token_type=urn:ietf:params:oauth:token-type:refresh_token
> scope=openid offline_access email <RESOURCE_SCOPES>
> client_id=<CLIENT_ID>
> client_secret=<CLIENT_SECRET>
> ```
>
> `requested_token_type` is **`refresh_token`**, not `id-jag`. There is
> no direct `saml2 → id-jag` route on xaa.dev. The IdP advertises both
> mintable types in `identity_chaining_requested_token_types_supported`.
>
> **7. Store the `refresh_token`. Discard the assertion.** It has done
> its only job. Keeping it will overflow a cookie-based session (see
> `01-project-skeleton.md` § Issues) and buys you nothing.
>
> From here the SAML path is identical to OIDC. `03` onward makes no
> distinction.

The IdP maps your SAML Audience / SPEntityID to a client ID and requires
it to match the authenticated client — draft-04 § 4.5: *"the IdP
Authorization Server MUST verify that the Audience / SPEntityID maps to
the OAuth Client ID that is authenticated for the token request. This
prevents a client from presenting an assertion issued for a different
SAML SP."* So a mismatch between your registered SP and your `CLIENT_ID`
fails here, not at SSO.

> **Provenance.** xaa.dev's prose docs at `/docs` do not cover SAML at
> all as of **2026-08-26** — `/docs/step2/` lists only `id_token` and
> `refresh_token` as subject types. The flow above is derived from
> xaa.dev's live SAML metadata, its discovery fields
> (`token_exchange_subject_token_types_supported` includes
> `…token-type:saml2`), and its shipped browser client. Don't expect
> `/docs` to corroborate it.

---

## Objective

An authenticated session anchored on a real IdP **refresh token**. The
browser only ever sees an encrypted session cookie.

## Output (capabilities, not files)

| Capability                                | Notes                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Cached IdP metadata discovery             | OIDC: `openid-configuration`. SAML: `/saml/metadata` + extracted cert. One per process, invalidated on failure. |
| `buildLoginUrl()` / `buildAuthnRequest()` | Returns the redirect target **and** the transaction bundle for the session. |
| `completeLogin(…)`                        | Returns `{refreshToken, claims}`. OIDC: from the code exchange. SAML: from Step 0b. |
| Session adapter holds `{user, txn}`       | `user = {claims, loggedInAt}` plus the raw `refreshToken`.              |
| Login route                               | Saves the transaction in session before redirect; surfaces `?error=` on failure. |
| Callback / ACS route                      | Validates the path's full checklist, ≤10 min transaction age, then redirects to `/dashboard`. |
| Logout route                              | Destroys local session. Documents that upstream revocation isn't possible. |
| Session-view route                        | Never returns a raw token.                                             |
| Refresh-token presence assertion          | Fails loudly at login if no refresh token came back.                   |

## Issues you may hit

### Both paths

- **Cookie not sent on the return leg.** The return from the IdP is
  cross-site. Confirm `SameSite=Lax`, not `Strict`.

  On the **SAML path this is sharper**: the ACS return is a cross-site
  **POST**, and `SameSite=Lax` does *not* send cookies on cross-site
  POST — only on top-level GET navigations. If your transaction lookup
  comes back empty on the SAML path, this is almost certainly why.
  Options: carry the session id in `RelayState` and look the transaction
  up server-side, or use a separate `SameSite=None; Secure` cookie for
  the transaction only. Do not weaken the main session cookie to `None`
  to fix this.
- **No `refresh_token` in the response.** OIDC: `offline_access` missing
  from the authorize scope, or (`TODO(confirm)`) consent not prompted.
  SAML: `offline_access` missing from the Step 0b `scope`. Assert on it
  at login rather than discovering it ten minutes later.
- **Stale cache during dev hot-reload.** Cached discovery/metadata may
  persist across reloads. Provide a `__resetOidcCache()` (and a SAML
  equivalent) so tests start fresh.

### ▸ OIDC path

- **`redirect_uri` mismatch.** `Error: redirect_uri does not match
  registered URI`. Path, port, and scheme must be byte-exact with what
  is registered at xaa.dev.
- **`nonce` missing in ID Token.** Some libraries omit `nonce` from the
  authorize URL by default. Verify the URL with curl.
- **PKCE base64url with padding.** RFC 7636 requires unpadded. Strip
  `=` from the challenge or the IdP will reject the verifier.
- **Library strips unknown scopes.** A few OIDC clients filter the scope
  list against `scopes_supported` or a hardcoded set. `offline_access`
  *is* in xaa.dev's `scopes_supported`, so this shouldn't bite — but if
  your authorize URL comes out without it, that's the cause. Verify the
  assembled URL; don't trust the config object.

### ▸ SAML path

- **ACS URL mismatch.** Unlike OIDC's explicit `redirect_uri_mismatch`,
  a wrong ACS URL often fails *silently* — the IdP POSTs somewhere else
  and your app simply never hears back. Verify byte-exactness first when
  nothing arrives.
- **Signature verification fails after re-serialisation.** XML-DSIG
  covers exact bytes including canonicalisation. Parsing and
  re-serialising an assertion can invalidate a signature that was fine
  on the wire. Verify *before* transforming, and extract original bytes.
- **Padded base64 sent to Step 0b.** The subject token must be base64url
  **unpadded**. Padded standard base64 will be rejected — and since `+`
  form-decodes to a space, you may see a confusing parse error rather
  than a clean `invalid_grant`.
- **Whole `SAMLResponse` sent instead of the assertion.** The
  `subject_token` is the bare `<saml:Assertion>` element.
- **`transient` NameID.** Creates a new user on every login. Use
  `emailAddress` or `persistent`.

## Fixes

- Print the assembled authorize URL (OIDC) or `<AuthnRequest>` (SAML)
  once at boot with credentials redacted, and compare against what is
  registered at xaa.dev.
- Add `offline_access` explicitly to the scope list and assert it
  survives into the final URL — don't trust library defaults.
- Use a known-good library helper for PKCE (`secrets.token_urlsafe`,
  `crypto.randomBytes(32).toString('base64url')`, `rand.Read`, …).
- Add `nonce` explicitly to the authorize URL builder.
- For SAML, use a maintained library for signature verification. This is
  the one place in the kit where hand-rolling is actively dangerous —
  signature-wrapping and XXE are both live risks.

## Verification

```bash
# Boot
<your dev command>
```

### Both paths

```bash
# Session route returns unauthenticated by default.
curl -sS http://localhost:<port>/api/auth/session
# Expect: {"authenticated":false}
```

### ▸ OIDC path

```bash
# 1. Login route returns 307/302 with the IdP authorize URL.
curl -sS -i http://localhost:<port>/api/auth/login | grep -i '^location:'
# Expect: location: https://idp.xaa.dev/authorize?client_id=…&redirect_uri=…&scope=openid+profile+email+offline_access&prompt=consent&code_challenge=…&code_challenge_method=S256&state=…&nonce=…&response_type=code

# 2. The scope MUST contain offline_access. This is the assertion that matters most.
curl -sS -i http://localhost:<port>/api/auth/login \
  | grep -io 'scope=[^& ]*' \
  | grep -q 'offline_access' \
  && echo "OK: offline_access present" \
  || echo "FAIL: no offline_access — session will die in ~10 min"
```

Plus a unit test asserting `buildLoginUrl()` produces a URL containing
`client_id`, `redirect_uri`, a scope including **`offline_access`**,
`code_challenge_method=S256`, `state`, `nonce`, and a base64url
`code_challenge` of the correct length (43 chars for SHA-256).

### ▸ SAML path

```bash
# 1. IdP SAML metadata is reachable and carries the expected entityID.
curl -sS https://idp.xaa.dev/saml/metadata | grep -o 'entityID="[^"]*"' | head -1
# Expect: entityID="https://idp.xaa.dev/saml"

# 2. Confirm the IdP advertises the saml2 subject token type.
curl -sS https://idp.xaa.dev/.well-known/openid-configuration \
  | grep -q 'token-type:saml2' \
  && echo "OK: saml2 subject token supported" \
  || echo "FAIL: saml2 not advertised"

# 3. Login route sends you to the SSO endpoint (302) or returns a self-POSTing form (200).
curl -sS -i http://localhost:<port>/api/auth/login | head -20
# Expect either: location: https://idp.xaa.dev/saml/sso?SAMLRequest=…&RelayState=…
#            or: 200 with an HTML form action="https://idp.xaa.dev/saml/sso"
```

Plus unit tests asserting: the `<AuthnRequest>` carries a `RelayState`
and a recorded `ID`; the requested NameID format is not `transient`;
assertion extraction returns the bare `<saml:Assertion>` element; and the
encoder produces base64url with **no `=` padding**.

### End-to-end (both paths)

Open `/api/auth/login` in a browser, authenticate on xaa.dev, confirm you
land on `/dashboard` and `/api/auth/session` returns
`{authenticated: true, claims: {…}}`.

**The specific thing to confirm in this step: the session holds a refresh
token.** Have `/api/auth/session` report it as a redacted `tokenState` —
e.g. `{"refreshToken": "eyJhbGc…3Q4xZ", "hasRefreshToken": true}`. If
that is false or absent, `offline_access` did not take effect and `03`
will fail in a way that looks unrelated.

On the SAML path, also confirm the log shows **two** IdP interactions
before `/dashboard`: the ACS POST arriving, then the Step 0b
token-exchange returning a refresh token.
