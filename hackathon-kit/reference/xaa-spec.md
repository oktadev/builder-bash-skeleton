# XAA wire spec — canonical reference

This is the only place the kit specifies *exact* HTTP wire format. Every
prompt that performs an XAA exchange links here. If you change a field
name, change it here once.

---

## Roles

| Role                       | Default URL on xaa.dev               | What it does                                                  |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------- |
| **IdP**                    | `https://idp.xaa.dev`                | Authenticates the user. Issues ID Tokens. Mints **ID-JAG**s. |
| **Resource auth server**   | `https://auth.resource.xaa.dev`      | Validates an ID-JAG. Mints resource **access tokens**.       |
| **Resource server**        | `https://api.resource.xaa.dev`       | Bearer-protected REST/MCP API.                               |

The IdP and the resource auth server are **separate** OAuth domains. Two
client credential pairs are required — one registered at each.

---

## Discovery

Both authorization domains expose RFC 8414 metadata. Cache the result;
do not re-fetch per request.

```
GET https://idp.xaa.dev/.well-known/openid-configuration
GET https://auth.resource.xaa.dev/.well-known/oauth-authorization-server
```

The endpoints you care about from each document:

| Field                     | Used for                                    |
| ------------------------- | ------------------------------------------- |
| `authorization_endpoint`  | IdP only — drive PKCE login                |
| `token_endpoint`          | Both — Step 1 (IdP), Step 2 (auth server)  |
| `jwks_uri`                | Optional — verify ID-JAG/access-token sigs |

---

## Step 0 — OIDC Authorization Code + PKCE login

```
GET  https://idp.xaa.dev/authorize
       ?client_id=<CLIENT_ID>
       &redirect_uri=<REDIRECT_URI>
       &response_type=code
       &scope=openid+profile+email
       &state=<base64url csprng, ≥32 bytes entropy>
       &nonce=<base64url csprng, ≥32 bytes entropy>
       &code_challenge=<base64url(SHA-256(code_verifier))>
       &code_challenge_method=S256
```

Server side:
- `code_verifier` and `code_challenge` per RFC 7636 (S256, no padding).
- Store `{code_verifier, state, nonce, created_at}` server-side in an
  encrypted session keyed by an httpOnly cookie. Reject on callback if
  `created_at` is older than **10 minutes**.

Callback:

```
POST https://idp.xaa.dev/token
       grant_type=authorization_code
       code=<code from query>
       redirect_uri=<must equal authorize redirect_uri>
       code_verifier=<from session>
       client_id=<CLIENT_ID>
       client_secret=<CLIENT_SECRET>     # confidential client; or HTTP Basic
```

Verify the returned `id_token`'s `nonce` claim equals the session's
nonce. Verify the `state` query param equals the session's state.

**Store** the `id_token` in the session. **Do not** send it to the
browser.

---

## Step 1 — RFC 8693 token exchange (ID Token → ID-JAG)

```
POST https://idp.xaa.dev/token
Authorization: Basic base64(<CLIENT_ID>:<CLIENT_SECRET>)
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<the ID Token from Step 0>
subject_token_type=urn:ietf:params:oauth:token-type:id_token
requested_token_type=urn:ietf:params:oauth:token-type:id-jag
audience=https://auth.resource.xaa.dev
resource=https://api.resource.xaa.dev
scope=<space-separated requested scopes>
```

Response:

```json
{
  "access_token": "<ID-JAG, a signed delegation assertion>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:id-jag",
  "token_type": "N_A",
  "expires_in": 600
}
```

The `access_token` field carries the **ID-JAG**. Treat it as opaque from
the client's perspective; only the resource auth server validates it.

> Common mistake: omitting `audience` or `resource`. Both are required
> by xaa.dev. The IdP encodes them into the ID-JAG so the auth server
> can confirm the delegation target on Step 2.

---

## Step 2 — RFC 7523 jwt-bearer (ID-JAG → access token)

```
POST https://auth.resource.xaa.dev/token
Authorization: Basic base64(<RESOURCE_CLIENT_ID>:<RESOURCE_CLIENT_SECRET>)
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
assertion=<the ID-JAG from Step 1>
scope=<space-separated requested scopes>
```

Response:

```json
{
  "access_token": "<resource bearer token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "todos.read"
}
```

> Note the **client identity changes** between Step 1 and Step 2.
> `RESOURCE_CLIENT_ID/SECRET` is a separately registered pair the IdP
> issues alongside the main client.

---

## Step 3 — protected resource fetch

```
GET https://api.resource.xaa.dev${RESOURCE_PATH}     # default RESOURCE_PATH=/api/todos
Authorization: Bearer <access_token from Step 2>
Accept: application/json
```

Possible responses:

| Status | Headers                                                              | Maps to ErrorCode      |
| ------ | -------------------------------------------------------------------- | ---------------------- |
| `200`  | `Content-Type: application/json`                                     | success                |
| `401`  | `WWW-Authenticate: Bearer error="invalid_token", error_description="…expired…"` | `expired_token` |
| `401`  | `WWW-Authenticate: Bearer error="invalid_token", error_description="…"` (other)   | `invalid_token` |
| `401`  | `WWW-Authenticate: Bearer` (no `error=` param)                        | `unauthorized`         |
| `403`  | `WWW-Authenticate: Bearer error="insufficient_scope"`                 | `insufficient_scope`   |
| `5xx`  | any                                                                  | `resource_failure`     |
| —      | network error / timeout                                              | `resource_failure`     |

See `error-mapping.md` for the full mapping including upstream
token-exchange failures.

---

## Invariants you must not break

1. **PKCE S256 only** — never `plain`.
2. **State + nonce verification** — both required, both server-side
   compared.
3. **ID Token never reaches the browser** — server-side session only.
4. **Two distinct client credentials** — IdP client (Step 1) ≠ resource
   client (Step 2). Mixing them up is the most common cause of opaque
   `invalid_client` failures.
5. **Audience and resource on Step 1** — required form fields.
6. **Re-mint per call** — do not persist the resource access token. The
   ID Token in the session is the canonical state; re-run Steps 1 and 2
   on each protected call. Tokens are short-lived (typically ≤1 h).
7. **Redact in logs** — see `error-mapping.md` § Token redaction.
