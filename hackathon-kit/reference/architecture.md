# Architecture — flow diagrams

The kit doesn't prescribe a deployment shape — your app may be a server,
a serverless bundle, a CLI, or a TUI. The diagrams below show the *flow
between roles*, which is invariant.

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
                  │    /api/auth/login         PKCE + 302 → IdP              │
                  │    /api/auth/callback      validate state/nonce, store   │
                  │    /api/auth/logout        destroy session                │
                  │    /api/auth/session       safe-to-render session view   │
                  │    /api/call               run XAA flow + fetch resource │
                  │    /api/logs              read/clear ring buffer         │
                  │                                                           │
                  │  Modules                                                 │
                  │    config           env validation                       │
                  │    session          encrypted cookie                     │
                  │    oidc             discovery + login URL                │
                  │    token-exchange   RFC 8693 + RFC 7523                  │
                  │    resource-call    error mapping                        │
                  │    logger           redacted ring buffer                 │
                  └─────────────────┬───────────────────────────┬─────────────┘
                                    │                           │
                            OIDC + token grants         resource fetch
                                    │                           │
       ┌────────────────────────────▼──────────┐    ┌───────────▼──────────────┐
       │ https://idp.xaa.dev                    │    │ https://api.resource     │
       │   /.well-known/openid-configuration    │    │       .xaa.dev           │
       │   /authorize                           │    │   ${RESOURCE_PATH}       │
       │   /token (auth-code, token-exchange)   │    │   Bearer-token validated │
       │   /jwks                                │    └──────────────────────────┘
       └────────────────────────────────────────┘
                                    │
                          ID-JAG (delegation)
                                    │
       ┌────────────────────────────▼──────────┐
       │ https://auth.resource.xaa.dev          │
       │   /.well-known/oauth-authorization-…   │
       │   /token (jwt-bearer)                  │
       │   /jwks                                │
       └────────────────────────────────────────┘
```

---

## Authentication (Step 0 — OIDC + PKCE)

```
Browser                Requesting App                    IdP
   │  GET /api/auth/login │                              │
   │ ───────────────────▶ │                              │
   │                      │ build authorize URL          │
   │                      │  • code_verifier+challenge  │
   │                      │  • state                    │
   │                      │  • nonce                    │
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
   │                      │ verify state + nonce         │
   │                      │ POST /token (auth_code+PKCE) │
   │                      │ ────────────────────────────▶│
   │                      │ ← {id_token, access_token}   │
   │                      │ store id_token + claims      │
   │ 302 /dashboard       │                              │
   │ ◀────────────────────│                              │
```

The browser only ever sees the encrypted session cookie. The raw ID
Token never leaves the server.

---

## XAA exchange (Steps 1–3)

```
Browser     Requesting App           IdP /token        AuthServer /token        Resource API
   │  POST /api/call    │                    │                       │                         │
   │ ─────────────────▶ │                    │                       │                         │
   │                    │  STEP 1            │                       │                         │
   │                    │  POST /token       │                       │                         │
   │                    │   grant=token-exchange                     │                         │
   │                    │   subject_token=<ID Token>                 │                         │
   │                    │   subject_token_type=…id_token             │                         │
   │                    │   requested_token_type=…id-jag             │                         │
   │                    │   audience=https://auth.resource.xaa.dev  │                         │
   │                    │   resource=https://api.resource.xaa.dev   │                         │
   │                    │   scope=todos.read                         │                         │
   │                    │ ──────────────────▶│                       │                         │
   │                    │ ← {access_token: <ID-JAG>}                 │                         │
   │                    │                                            │                         │
   │                    │  STEP 2                                    │                         │
   │                    │  POST /token                               │                         │
   │                    │   grant=jwt-bearer                                                   │
   │                    │   assertion=<ID-JAG>                                                 │
   │                    │   scope=todos.read                                                   │
   │                    │ ─────────────────────────────────────────▶ │                         │
   │                    │ ← {access_token: <Bearer>, expires_in}     │                         │
   │                    │                                            │                         │
   │                    │  STEP 3                                                              │
   │                    │  GET https://api.resource.xaa.dev${RESOURCE_PATH}                    │
   │                    │   Authorization: Bearer <access_token>                               │
   │                    │ ───────────────────────────────────────────────────────────────────▶│
   │                    │ ← 200 {…body…}                                                       │
   │ 200 CallResult     │                                                                      │
   │ ◀──────────────────│                                                                      │
```

Two distinct OAuth client identities:

- `CLIENT_ID/SECRET` authenticates the **token-exchange** call (Step 1).
- `RESOURCE_CLIENT_ID/SECRET` authenticates the **jwt-bearer** call (Step 2).

The resource call (Step 3) is unauthenticated client-wise; only the
Bearer access token from Step 2 grants access.

---

## Failure surfaces

```
Step 1 fail   →  expired_token | token_exchange_failure
Step 2 fail   →  expired_token | token_exchange_failure | insufficient_scope
Step 3 200    →  ok
Step 3 401/403→  unauthorized | invalid_token | expired_token | insufficient_scope
Step 3 5xx/net→  resource_failure
```

See `error-mapping.md` for the full decision table.
