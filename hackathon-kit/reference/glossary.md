# Glossary

Quick definitions for the terms used throughout the kit. If you've
done OAuth/OIDC before, skim. If not, read once before starting.

---

## Identities and clients

- **User / End-user** — the human signing in. Owns the session.
- **Requesting App** — what you're building. Acts on behalf of the user
  to call a protected resource.
- **IdP (Identity Provider)** — `https://idp.xaa.dev`. Authenticates
  the user, issues ID Tokens, mints ID-JAGs.
- **Resource auth server** — `https://auth.resource.xaa.dev`. Validates
  an ID-JAG and mints resource access tokens.
- **Resource server** — `https://api.resource.xaa.dev` (default Todo0).
  The bearer-protected API your app calls.
- **OAuth client** — a registered identity at an authorization domain.
  This kit uses **two** clients per developer: one at the IdP
  (`CLIENT_*`), one at the resource auth server (`RESOURCE_CLIENT_*`).

---

## Tokens

- **ID Token** — a JWT issued by the IdP that proves *who* the user
  is. Contains `sub`, `email`, `name`, `nonce`, etc. Stays
  server-side, never reaches the browser. Long-lived (≈1 h).
- **Access token (resource)** — a bearer token issued by the resource
  auth server (Step 2). Used in `Authorization: Bearer …` to call the
  resource API. Short-lived. Re-mint per call.
- **Refresh token** — not used in this kit. xaa.dev's resource client
  doesn't typically issue them; if yours does, ignore them and re-mint
  from the ID Token.
- **ID-JAG (ID-Token JWT-Assertion-Grant)** — the *delegation
  assertion* the IdP mints in Step 1. A signed JWT that says "user U
  delegates access to resource R via auth server A". Treat as opaque
  on the client side; the resource auth server validates it in Step 2.

---

## Wire-format pieces

- **`audience`** — who the token is intended for. On Step 1, set to the
  resource auth server (`https://auth.resource.xaa.dev`).
- **`resource`** — RFC 8707 indicator of *which* protected resource the
  token will call. On Step 1, set to the resource server URL
  (`https://api.resource.xaa.dev` for Todo0).
- **`scope`** — space-separated permissions the user grants. Must be a
  subset of what the resource registered (`todos.read` for Todo0
  default).
- **`claims`** — the JSON fields inside a JWT (e.g. `sub`, `email`,
  `exp`, `nonce`).
- **`grant_type`** — what kind of token exchange this is. Step 1 uses
  `urn:ietf:params:oauth:grant-type:token-exchange`; Step 2 uses
  `urn:ietf:params:oauth:grant-type:jwt-bearer`. URNs are
  case-sensitive and hyphenated — see `06-debugging-playbook.md` § D-3.
- **`subject_token` / `subject_token_type`** — the input token to a
  Step-1 exchange (the ID Token) and its type URN
  (`…token-type:id_token`, with underscore).
- **`requested_token_type`** — what to mint in Step 1
  (`…token-type:id-jag`, with hyphen).

---

## Crypto / OIDC machinery

- **PKCE** — RFC 7636. Adds a `code_verifier` (server-secret) +
  `code_challenge` (sent to IdP) so an intercepted auth code can't be
  redeemed without the verifier. Always S256, never `plain`.
- **`state`** — CSRF protection on the OIDC redirect. Random per
  login; verified on callback.
- **`nonce`** — replay protection for the ID Token. Random per login;
  the ID Token's `nonce` claim must match the session-stored value.
- **JWKS (`jwks_uri`)** — the IdP's published JSON Web Key Set. Used
  to verify ID Token / ID-JAG signatures. Most OIDC libraries fetch
  and cache this for you.
- **Discovery** — RFC 8414 / OIDC discovery. The
  `/.well-known/openid-configuration` (IdP) or
  `/.well-known/oauth-authorization-server` (resource auth server)
  endpoint that lists `authorization_endpoint`, `token_endpoint`,
  `jwks_uri`, supported algorithms, etc.

---

## XAA-specific

- **Cross-App Access (XAA)** — the umbrella name for the two-grant
  flow this kit implements. RFC 8693 Token Exchange (Step 1) +
  RFC 7523 JWT-Bearer Grant (Step 2).
- **Step 0** — OIDC Authorization Code + PKCE login. Yields an ID
  Token in the session.
- **Step 1** — ID Token → ID-JAG (RFC 8693, at the IdP).
- **Step 2** — ID-JAG → resource access token (RFC 7523, at the
  resource auth server).
- **Step 3** — call the resource API with the access token (RFC 6750
  Bearer).
- **BYOR (Bring Your Own Resource)** — registering a custom resource
  at xaa.dev instead of using Todo0. Overrides
  `RESOURCE_URL/PATH/SCOPES` only; discovery and login still go
  through the fixed IdP.

---

## Why two clients?

The IdP and the resource auth server are **separate OAuth domains**.
Each requires its own client registration. This is what makes XAA a
*delegated* pattern: the IdP can mint a delegation assertion for any
resource without itself controlling that resource's access policy.

| Pair                   | Authenticates at                       | For      |
| ---------------------- | -------------------------------------- | -------- |
| `CLIENT_*`             | `https://idp.xaa.dev/token`            | Step 0 + Step 1 |
| `RESOURCE_CLIENT_*`    | `https://auth.resource.xaa.dev/token`  | Step 2          |

Mixing them is the most common cause of opaque `invalid_client`
failures. See `06-debugging-playbook.md` § D-2.
