# Glossary

Quick definitions for the terms used throughout the kit. If you've
done OAuth/OIDC before, skim. If not, read once before starting.

---

## Identities and clients

- **User / End-user** — the human signing in. Owns the session.
- **Requesting App** — what you're building. Acts on behalf of the user
  to call a protected resource.
- **IdP (Identity Provider)** — `https://idp.xaa.dev`. Authenticates
  the user, issues Identity Assertions and refresh tokens, mints
  ID-JAGs. Speaks both OIDC and SAML 2.0.
- **Resource auth server** — `https://auth.resource.xaa.dev`. Validates
  an ID-JAG and mints resource access tokens.
- **Resource server** — `https://api.resource.xaa.dev` (default Todo0).
  The bearer-protected REST API your app calls when
  `APP_TYPE=standalone`.
- **MCP server** — `https://mcp.xaa.dev/mcp` (default `todo0-mcp`). The
  bearer-protected MCP endpoint your app drives when `APP_TYPE=mcp`. A
  **fourth host**, a separate origin from the REST resource — there is no
  MCP endpoint on `api.resource.xaa.dev`.
- **OAuth client** — a registered identity at an authorization domain.
  This kit uses **two** clients per developer: one at the IdP
  (`CLIENT_*`), one at the resource auth server (`RESOURCE_CLIENT_*`).
- **SP (Service Provider)** — *SAML path only.* Your app, in SAML's
  vocabulary. Registered at xaa.dev with an entityID and an ACS URL.

---

## Tokens

- **Identity Assertion** — the umbrella term for what the IdP issues to
  prove *who* the user is: an **ID Token** on the OIDC path, a **SAML
  assertion** on the SAML path. Used once, early, to obtain a refresh
  token. Stays server-side.
- **ID Token** — a JWT issued by the IdP. Contains `sub`, `email`,
  `name`, `nonce`, etc. Lifetime on xaa.dev is **~10 minutes**, and
  xaa.dev's docs describe it as *"only good for one exchange right after
  login."* **Not a session anchor** — verify its `nonce`, read its
  claims, then stop depending on it.
- **SAML assertion** — the `<saml:Assertion>` element inside a
  `SAMLResponse`. The SAML path's Identity Assertion. Exchanged once at
  Step 0b for a refresh token, then discarded.
- **Refresh token** — **the session anchor in this kit.** Issued by the
  **IdP** when `offline_access` is requested (OIDC path: at the Step 0
  token call; SAML path: as the output of Step 0b). Presented as the
  `subject_token` on every Step 1 exchange to mint a fresh ID-JAG,
  without re-authenticating the user. Not consumed by that exchange —
  reusable until it expires or is revoked. This is the long-lived
  credential in your session; treat it accordingly.
- **Access token (resource)** — a bearer token issued by the resource
  auth server (Step 2). Used in `Authorization: Bearer …` to call the
  resource API. ~2 h on xaa.dev. Re-mint per call; don't persist.
- **ID-JAG (Identity Assertion JWT Authorization Grant)** — the
  *delegation assertion* the IdP mints in Step 1. A signed JWT that says
  "user U delegates access to resource R via auth server A". Header `typ`
  is `oauth-id-jag+jwt`. 5 min lifetime, may be single-use. Treat as
  opaque on the client side; the resource auth server validates it.

> **There is no resource-side refresh token.** The resource auth server
> does not issue one at Step 2, by design — draft-04 § 4.4.3 says it
> SHOULD NOT, because *"the ID-JAG replaces the use of Refresh Token for
> the Resource Authorization Server."* When your access token expires,
> mint a new ID-JAG from your IdP refresh token.

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
- **`offline_access`** — the scope that makes the IdP issue a refresh
  token. Required on Step 0 (OIDC) / Step 0b (SAML). Omit it and you
  have no session anchor.
- **`claims`** — the JSON fields inside a JWT (e.g. `sub`, `email`,
  `exp`, `nonce`).
- **`grant_type`** — what kind of token exchange this is. Steps 0b and 1
  use `urn:ietf:params:oauth:grant-type:token-exchange`; Step 2 uses
  `urn:ietf:params:oauth:grant-type:jwt-bearer`. URNs are
  case-sensitive and hyphenated — see `06-debugging-playbook.md` § D-3.
- **`subject_token` / `subject_token_type`** — the input token to a
  token exchange and its type URN. xaa.dev accepts three types:
  `…token-type:id_token` (underscore), `…token-type:saml2`, and
  `…token-type:refresh_token`. **This kit uses `refresh_token` on
  Step 1** and `saml2` on Step 0b.
- **`requested_token_type`** — what to mint.
  `…token-type:refresh_token` on Step 0b; `…token-type:id-jag` (hyphen)
  on Step 1.
- **`sub_id`** — RFC 9493 Subject Identifier, present on SAML-derived
  ID-JAGs. See below.
- **`saml-nameid`** — the `sub_id` format that carries a SAML
  `<NameID>`. Members: `format`, `issuer`, `nameid` (required);
  `nameid_format`, `name_qualifier`, `sp_name_qualifier`,
  `sp_provided_id` (optional, included exactly when present on the
  `<NameID>`). New in draft-04.

---

## Crypto / OIDC machinery

*OIDC path only.*

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
  `jwks_uri`, supported algorithms, etc. On the resource auth server the
  two URLs differ by one field — see `xaa-spec.md` § Discovery.

---

## SAML machinery

*SAML path only.* These are the SAML counterparts to the OIDC machinery
above — same jobs, different mechanisms.

- **`<AuthnRequest>`** — what your SP sends to the IdP's SSO endpoint to
  start login. xaa.dev sets `WantAuthnRequestsSigned="false"`, so you
  need no SP signing key to send one.
- **`RelayState`** — SAML's opaque round-trip parameter. Carry your CSRF
  / transaction token here. **The SAML analogue of OIDC `state`.**
- **`InResponseTo`** — the `SAMLResponse` attribute echoing your
  `<AuthnRequest>` ID. Verify it. **The closest analogue of `nonce`.**
- **ACS (Assertion Consumer Service)** — the endpoint on *your* app that
  receives the `SAMLResponse` via HTTP-POST. SAML's callback URL.
- **`<NameID>`** — the assertion's subject identifier. xaa.dev offers
  `emailAddress` (recommended) and `persistent` formats; **`transient`
  is unsupported** because the resource server keys users by NameID and
  a per-session random value would create a new user every login.
- **`SPNameQualifier`** — scopes a `<NameID>` to one Service Provider.
  When present it is **part of the subject namespace**: the same
  `nameid` under two different qualifiers is two different users.
  Surfaces as `sp_name_qualifier` in `sub_id`.
- **`AudienceRestriction`** — the assertion condition naming which SP
  may consume it. Verify it names your entityID. **The analogue of
  checking `aud`.**
- **SAML IdP metadata** — `https://idp.xaa.dev/saml/metadata`. The XML
  document carrying the IdP's entityID, signing certificate, and
  endpoint bindings. **The analogue of OIDC discovery.**

---

## MCP machinery

*`APP_TYPE=mcp` only.* **The official MCP SDK owns every term in this
section** — they're here so you can read logs and error messages, not so
you can implement them. If you find yourself writing code that constructs
any of these by hand, you've crossed the boundary.

- **MCP (Model Context Protocol)** — the protocol an agent-facing client
  uses to consume resources, tools and prompts from a server. JSON-RPC
  2.0 over a transport.
- **Official MCP SDK** — `@modelcontextprotocol/sdk` (Node/TS) or `mcp`
  (Python). The kit integrates with it; it does not reimplement it.
- **StreamableHTTP** — the current HTTP transport: JSON-RPC over HTTP
  POST. What `mcp.xaa.dev/mcp` speaks. *SDK-owned.*
- **`initialize`** — the opening handshake that negotiates protocol
  version and capabilities, followed by a `notifications/initialized`.
  *SDK-owned.*
- **Protocol version** — a dated string, e.g. **`2025-03-26`**, which is
  what the xaa.dev playground speaks. Pin it; don't assume a newer one.
- **Resource (MCP sense)** — a readable item the server exposes, addressed
  by a URI like `todo0://todos`. Listed with `resources/list`, fetched
  with `resources/read`. **Not** the same word as the kit's "resource
  server" — see the warning below.
- **Tool** — a callable function a server exposes (`tools/list`,
  `tools/call`). `todo0-mcp` exposes **none**; it is resources-only.
- **RFC 9728 protected-resource metadata** — how an MCP server advertises
  its authorization server. On `mcp.xaa.dev` it lives at the
  **path-suffixed** `/.well-known/oauth-protected-resource/mcp`; the bare
  path 404s. Read it from the `WWW-Authenticate` header.

> ⚠️ **"Resource" means two different things in this kit.** The XAA sense
> is *the protected API you're reaching* (RFC 8707 `resource` parameter,
> the `aud` of your access token). The MCP sense is *one readable item
> inside an MCP server* (`todo0://todos`). They are unrelated. When the
> kit says `resource=` it always means the XAA sense.

---

## XAA-specific

- **Cross-App Access (XAA)** — the umbrella name for the delegation flow
  this kit implements. RFC 8693 Token Exchange (Steps 0b + 1) +
  RFC 7523 JWT-Bearer Grant (Step 2), per
  `draft-ietf-oauth-identity-assertion-authz-grant-04`.
- **Step 0** — user login. OIDC Authorization Code + PKCE, *or* SAML
  SP-initiated Web Browser SSO. Yields an Identity Assertion, and on the
  OIDC path a refresh token too.
- **Step 0b** — *SAML path only.* SAML assertion → refresh token
  (RFC 8693, at the IdP). The OIDC path skips this; its refresh token
  arrives in Step 0.
- **Step 1** — refresh token → ID-JAG (RFC 8693, at the IdP).
- **Step 2** — ID-JAG → resource access token (RFC 7523, at the
  resource auth server).
- **Step 3** — call the resource API with the access token (RFC 6750
  Bearer).
- **Session anchor** — the credential your session is built on, which in
  this kit is the **refresh token**. Everything downstream is re-minted
  from it per call.
- **BYOR (Bring Your Own Resource)** — registering a custom resource
  at xaa.dev instead of using Todo0. Overrides
  `RESOURCE_URL/PATH/SCOPES` only; discovery and login still go
  through the fixed IdP.

> **Step numbering differs from xaa.dev's docs.** This kit's Step 1 is
> xaa.dev's "Step 2", and so on — off by one throughout. Mapping table
> in `xaa-spec.md` § Step numbering.

---

## Why two clients?

The IdP and the resource auth server are **separate OAuth domains**.
Each requires its own client registration. This is what makes XAA a
*delegated* pattern: the IdP can mint a delegation assertion for any
resource without itself controlling that resource's access policy.

| Pair                   | Authenticates at                       | For                      |
| ---------------------- | -------------------------------------- | ------------------------ |
| `CLIENT_*`             | `https://idp.xaa.dev/token`            | Steps 0, 0b, 1           |
| `RESOURCE_CLIENT_*`    | `https://auth.resource.xaa.dev/token`  | Step 2                   |

Mixing them is the most common cause of opaque `invalid_client`
failures. See `06-debugging-playbook.md` § D-2.
