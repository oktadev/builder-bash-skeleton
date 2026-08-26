# Architecture — flow diagrams

The kit doesn't prescribe a deployment shape — your app may be a server,
a serverless bundle, a CLI, or a TUI. The diagrams below show the *flow
between roles*, which is invariant.

**v3 note.** Two login paths (OIDC, SAML) converge on a refresh token,
which is then the session anchor for everything downstream. The paths
diverge only in the first two diagrams below; the XAA exchange is shared.

---

## System overview

```
                                ┌──────────────────────────────┐
                                │  Browser / client            │
                                └──────────────┬───────────────┘
                                               │
                              ${APP_URL}
                                               │
                  ┌────────────────────────────▼──────────────────────────────┐
                  │  Requesting App (your build)                              │
                  │                                                           │
                  │  Pages / endpoints                                        │
                  │    /                       redirect by session            │
                  │    /login                  start of flow                  │
                  │    /dashboard              authenticated landing          │
                  │    /logs                   observability                  │
                  │    /api/auth/login         start login (OIDC or SAML)     │
                  │    /api/auth/callback      OIDC only — state/nonce        │
                  │    /api/auth/saml/acs      SAML only — SAMLResponse POST  │
                  │    /api/auth/logout        destroy session                │
                  │    /api/auth/session       safe-to-render session view    │
                  │    /api/call               run XAA flow + fetch resource  │
                  │    /api/logs               read/clear ring buffer         │
                  │                                                           │
                  │  Modules                                                 │
                  │    config           env validation + XAA_PROTOCOL        │
                  │    session          encrypted cookie; holds refresh token│
                  │    login            oidc.ts and/or saml.ts               │
                  │    token-exchange   RFC 8693 + RFC 7523                  │
                  │    resource-call    error mapping                        │
                  │    logger           redacted ring buffer                 │
                  └─────────────────┬───────────────────────────┬─────────────┘
                                    │                           │
                        login + token grants            resource fetch
                                    │                           │
       ┌────────────────────────────▼──────────┐    ┌───────────▼──────────────┐
       │ https://idp.xaa.dev                    │    │ https://api.resource     │
       │   /.well-known/openid-configuration    │    │       .xaa.dev           │
       │   /authorize            (OIDC)         │    │   ${RESOURCE_PATH}       │
       │   /saml/metadata        (SAML)         │    │   Bearer-token validated │
       │   /saml/sso  /saml/slo  (SAML)         │    │   /.well-known/oauth-    │
       │   /token   auth-code | token-exchange  │    │       protected-resource │
       │   /jwks                                │    └──────────────────────────┘
       └────────────────────────────────────────┘
                                    │
                          ID-JAG (delegation)
                                    │
       ┌────────────────────────────▼──────────┐
       │ https://auth.resource.xaa.dev          │
       │   /.well-known/oauth-authorization-…   │   ◀── grant profile lives HERE,
       │   /token (jwt-bearer)                  │       not in openid-configuration
       │   /jwks                                │
       └────────────────────────────────────────┘
```

---

## The two axes

`XAA_PROTOCOL` converges at Step 1. `APP_TYPE` diverges at Step 3. The
middle is shared by all four combinations.

```
  ┌─ OIDC ────────────────────────────────────────────┐
  │  Step 0  authorize(+offline_access) → /token       │
  │          ⇒ ID Token  +  REFRESH TOKEN              │
  └───────────────────────────────────┬───────────────┘
                                      │
  ┌─ SAML ───────────────────────────┐│
  │  Step 0   SAML SSO → assertion   ││
  │  Step 0b  assertion → /token     ││
  │           ⇒ REFRESH TOKEN        ││
  └──────────────────┬───────────────┘│
                     └────────────────┤
                                      ▼
                     ══ shared by every build ══
                     Step 1  refresh token → ID-JAG
                     Step 2  ID-JAG → access token
                                      │
                     ═════ APP_TYPE diverges here ═════
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   Step 3a  standalone                             Step 3b  MCP client
   GET api.resource.xaa.dev/…                      POST mcp.xaa.dev/mcp
   Authorization: Bearer                           via OFFICIAL MCP SDK
   → JSON body                                     → resources/read
```

---

## Step 0 — user login

### ▸ OIDC path (Authorization Code + PKCE)

```
Browser                Requesting App                    IdP
   │  GET /api/auth/login │                              │
   │ ───────────────────▶ │                              │
   │                      │ build authorize URL          │
   │                      │  • code_verifier+challenge  │
   │                      │  • state                    │
   │                      │  • nonce                    │
   │                      │  • scope=…+offline_access   │
   │                      │  → save in session          │
   │ 302 https://idp.xaa.dev/authorize?…                 │
   │ ◀───────────────────────────────────────────────────│
   │                                                     │
   │  GET https://idp.xaa.dev/authorize?…                │
   │ ──────────────────────────────────────────────────▶ │
   │  ← consent page → user approves                     │
   │  302 ${REDIRECT_URI}?code=…                         │
   │ ◀───────────────────────────────────────────────────│
   │  GET ${REDIRECT_URI}?code=…&state=…                 │
   │ ───────────────────▶ │                              │
   │                      │ verify state                 │
   │                      │ POST /token (auth_code+PKCE) │
   │                      │ ────────────────────────────▶│
   │                      │ ← {id_token, refresh_token,  │
   │                      │    access_token}             │
   │                      │ verify id_token.nonce        │
   │                      │ STORE refresh_token ◀── anchor
   │                      │ (id_token → claims only)     │
   │ 302 /dashboard       │                              │
   │ ◀────────────────────│                              │
```

The browser only ever sees the encrypted session cookie. Neither the
refresh token nor the ID Token leaves the server.

### ▸ SAML path (SP-initiated Web Browser SSO) + Step 0b

```
Browser                Requesting App                    IdP
   │  GET /api/auth/login │                              │
   │ ───────────────────▶ │                              │
   │                      │ build <AuthnRequest>         │
   │                      │  • RelayState  (≈ state)    │
   │                      │  • request ID   (→ InResponseTo)
   │                      │  → save in session          │
   │ 302/form-POST → https://idp.xaa.dev/saml/sso        │
   │ ◀───────────────────────────────────────────────────│
   │ ──────────────────────────────────────────────────▶ │
   │  ← login page → user authenticates                  │
   │  form-POST ${SAML_ACS_URL}  SAMLResponse=…          │
   │ ◀───────────────────────────────────────────────────│
   │  POST ${SAML_ACS_URL}│                              │
   │ ───────────────────▶ │                              │
   │                      │ verify XML signature          │
   │                      │ verify InResponseTo           │
   │                      │ verify AudienceRestriction    │
   │                      │ verify NotBefore/NotOnOrAfter │
   │                      │ extract bare <saml:Assertion> │
   │                      │ base64url-unpadded            │
   │                      │                               │
   │                      │  STEP 0b                      │
   │                      │  POST /token                  │
   │                      │   grant=token-exchange        │
   │                      │   subject_token_type=…saml2   │
   │                      │   requested_token_type=       │
   │                      │        …refresh_token         │
   │                      │   scope=openid offline_access…│
   │                      │ ────────────────────────────▶ │
   │                      │ ← {refresh_token}             │
   │                      │ STORE refresh_token ◀── anchor
   │                      │ discard the assertion         │
   │ 302 /dashboard       │                               │
   │ ◀────────────────────│                               │
```

No PKCE, no `nonce` on this path. `RelayState` and `InResponseTo` do
those jobs. Note Step 0b asks for a **refresh token**, not an ID-JAG —
there is no direct `saml2 → id-jag` route on xaa.dev.

---

## XAA exchange (Steps 1–3) — identical on both paths

```
Browser     Requesting App           IdP /token        AuthServer /token        Resource API
   │  POST /api/call    │                    │                       │                         │
   │ ─────────────────▶ │                    │                       │                         │
   │                    │  STEP 1            │                       │                         │
   │                    │  POST /token       │                       │                         │
   │                    │   grant=token-exchange                     │                         │
   │                    │   subject_token=<REFRESH TOKEN>            │                         │
   │                    │   subject_token_type=…refresh_token        │                         │
   │                    │   requested_token_type=…id-jag             │                         │
   │                    │   audience=https://auth.resource.xaa.dev  │                         │
   │                    │   resource=https://api.resource.xaa.dev   │                         │
   │                    │   scope=todos.read                         │                         │
   │                    │ ──────────────────▶│                       │                         │
   │                    │ ← {access_token: <ID-JAG>, expires_in:300} │                         │
   │                    │   (refresh token NOT consumed)             │                         │
   │                    │                                            │                         │
   │                    │  STEP 2                                    │                         │
   │                    │  POST /token                               │                         │
   │                    │   grant=jwt-bearer                                                   │
   │                    │   assertion=<ID-JAG>                                                 │
   │                    │   scope=todos.read                                                   │
   │                    │   client_id/secret in body (client_secret_post)                       │
   │                    │ ─────────────────────────────────────────▶ │                         │
   │                    │ ← {access_token: <Bearer>, expires_in:7200}│                         │
   │                    │   (no refresh_token — by design)           │                         │
   │                    │                                            │                         │
   │                    │  STEP 3a  (APP_TYPE=standalone)                                      │
   │                    │  GET https://api.resource.xaa.dev${RESOURCE_PATH}                    │
   │                    │   Authorization: Bearer <access_token>                               │
   │                    │ ───────────────────────────────────────────────────────────────────▶│
   │                    │ ← 200 {…body…}                                                       │
   │ 200 CallResult     │                                                                      │
   │ ◀──────────────────│                                                                      │
```

### Step 3b — MCP client (`APP_TYPE=mcp`)

Same access token, different consumer. The **official MCP SDK** owns
everything to the right of the kit boundary.

```
   Requesting App                                    mcp.xaa.dev/mcp
   │                                                        │
   │  ┌──────────────────────────────────────┐              │
   │  │ KIT: access token from Step 2        │              │
   │  └──────────────┬───────────────────────┘              │
   │                 │ inject (never let the SDK fetch one) │
   │  ┌──────────────▼───────────────────────┐              │
   │  │ OFFICIAL MCP SDK                     │              │
   │  │  StreamableHTTP transport            │              │
   │  │  protocolVersion 2025-03-26          │              │
   │  └──────────────┬───────────────────────┘              │
   │                 │  POST  initialize                    │
   │                 │   Authorization: Bearer <token>      │
   │                 │   Accept: application/json,          │
   │                 │           text/event-stream          │
   │                 │ ────────────────────────────────────▶│
   │                 │ ← InitializeResult (capabilities)    │
   │                 │  POST  notifications/initialized     │
   │                 │ ────────────────────────────────────▶│
   │                 │  POST  resources/list                │
   │                 │ ────────────────────────────────────▶│
   │                 │ ← todo0://todos, …/completed, …      │
   │                 │  POST  resources/read                │
   │                 │   {"uri":"todo0://todos"}            │
   │                 │ ────────────────────────────────────▶│
   │                 │ ← contents                           │
```

`todo0-mcp` exposes **resources, not tools** — `tools/list` returns
nothing useful here.

**Where the boundary sits.** The kit stops at "here is a valid access
token." The SDK does JSON-RPC framing, the `initialize` handshake,
capability negotiation, transport, and the `resources/*` calls. MCP's own
OAuth — RFC 9728 discovery, DCR, auth-code + PKCE — is used by **neither**,
deliberately: the token already exists.

Two distinct OAuth client identities:

- `CLIENT_ID/SECRET` authenticates Steps 0, 0b, and 1 at the IdP.
- `RESOURCE_CLIENT_ID/SECRET` authenticates the **jwt-bearer** call (Step 2).

The resource call (Step 3) is unauthenticated client-wise; only the
Bearer access token from Step 2 grants access.

---

## Token lifecycle

Where each credential comes from and how long it survives.

```
  SAML assertion ──┐                                   (single use, Step 0b)
                   ├──► REFRESH TOKEN ─────────────────  lifetime: TODO(confirm)
  ID Token ────────┘    │  reusable, not consumed        the session anchor
   ~10 min              │
   claims only          ├──► ID-JAG ────────────────────  5 min, may be single-use
                        │     │
                        │     └──► access token ────────  ~2 h
                        │             │
                        │             └──► resource call
                        │
                        └── re-mint per /api/call
```

Nothing below the refresh token is persisted. Every `/api/call` walks
`refresh token → ID-JAG → access token → resource` from scratch.

---

## Failure surfaces

```
Step 0  fail  →  unauthorized | token_exchange_failure
Step 0b fail  →  expired_token (assertion stale) | token_exchange_failure
Step 1  fail  →  expired_token (REFRESH TOKEN dead → re-auth) | token_exchange_failure
Step 2  fail  →  expired_token (ID-JAG stale/skew) | token_exchange_failure | insufficient_scope
Step 3  200   →  ok
Step 3  401/403→ unauthorized | invalid_token | expired_token (→ re-mint) | insufficient_scope
Step 3  5xx/net→ resource_failure
```

`expired_token` means two different things depending on which step raised
it — re-mint on Step 3, re-authenticate on Step 1. See
`error-mapping.md` § The two faces of `expired_token`.
