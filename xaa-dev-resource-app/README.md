# xaa-dev-resource-app

A **Cross App Access (XAA / ID-JAG) resource app** for the
[xaa.dev playground](https://xaa.dev). Implements the Step-4 side of the XAA
flow: validate access tokens and serve protected data.

The app exposes a minimal **Box-style** API (files + folders) and ships two
pluggable auth modes so it works with the playground registration wizard in
either configuration:

| Mode | `AUTH_MODE` | Token issuer | Use when |
|------|-------------|--------------|----------|
| Playground | `playground` | `https://auth.resource.xaa.dev` | Wizard Step 2 = "Playground Auth Server" (recommended) |
| Own        | `own`        | This app's `/auth` | Wizard Step 2 = "Own Auth Server" |

Also ships an MCP interface (`POST /mcp`) with RFC 9728 protected-resource
metadata, so the same app can be registered as either a REST resource or an
MCP server.

## Endpoints

- `GET  /health` &mdash; 200 OK
- `GET  /api/files` &mdash; scope `files.read`
- `GET  /api/files/:id` &mdash; scope `files.read`
- `POST /api/files` &mdash; scope `files.write`
- `GET  /api/folders` &mdash; scope `folders.read`
- `GET  /api/folders/:id` &mdash; scope `folders.read`
- `POST /mcp` &mdash; MCP StreamableHTTP (same scopes as REST)
- `GET  /.well-known/oauth-protected-resource` &mdash; RFC 9728
- `GET  /auth/.well-known/oauth-authorization-server` &mdash; RFC 8414 (own mode)
- `GET  /auth/jwks` &mdash; JWKS of this app's own auth server (own mode)
- `POST /auth/token` &mdash; RFC 7523 jwt-bearer grant (own mode)

## Setup

```bash
cp .env.example .env
# For "own" mode only \u2014 generate RS256 keypair:
npm run keygen
npm install
npm run dev
```

Then at <https://xaa.dev/developer/test-resource>, register `http://localhost:4000`
as a custom resource (expose it via a tunnel like ngrok for the playground to
reach it), pick the matching auth mode, and run the 4-step XAA flow.

## Token validation rules (enforced by `src/auth/jwt.ts`)

1. Signature verified against the issuer's JWKS (RS256).
2. `iss` equals the configured issuer exactly.
3. `aud` equals `RESOURCE_URL` **including trailing slash**.
4. `exp` in the future (30s clock skew).
5. Required scope per endpoint, enforced via `requireScope()`.

Errors follow xaa.dev's error-codes doc:

- `401 unauthorized` &mdash; missing `Authorization` header
- `401 invalid_token` &mdash; bad signature, wrong iss, expired, etc.
- `403 insufficient_scope` &mdash; token lacks required scope

Each 401/403 includes a `WWW-Authenticate: Bearer` header with `error`,
`error_description`, and (for MCP 401s) a `resource_metadata` hint per RFC 9728.

## Layout

```
src/
  server.ts                 Express entrypoint
  config.ts                 Env loader
  data/store.ts             In-memory files + folders
  auth/
    jwt.ts                  Bearer-token middleware
    jwks.ts                 JWKS fetch + cache (jose remoteJWKSet)
    scopes.ts               requireScope() middleware
    errors.ts               401/403 helpers + WWW-Authenticate
  authServer/
    keygen.ts               One-shot RSA keypair generator
    keys.ts                 Load signing keys + expose JWKS
    metadata.ts             RFC 8414 discovery doc
    tokenEndpoint.ts        RFC 7523 jwt-bearer grant
    router.ts               Mounts /auth/*
  routes/
    health.ts
    files.ts
    folders.ts
  mcp/
    router.ts               POST /mcp (StreamableHTTP)
    metadata.ts             /.well-known/oauth-protected-resource
```
