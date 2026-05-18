# 03 — Token exchange (the XAA core)

## Prompt

> Implement the two-step Cross-App Access exchange. Read
> `reference/xaa-spec.md` § Steps 1–2 first — those tables are the
> source of truth for every form field below.
>
> **Step 1 — RFC 8693 Token Exchange at the IdP**
>
> Authenticate with `CLIENT_ID/CLIENT_SECRET` (HTTP Basic, or as form
> fields if your library prefers). POST to
> `https://idp.xaa.dev/token` with:
>
> - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
> - `subject_token=<the ID Token from the session>`
> - `subject_token_type=urn:ietf:params:oauth:token-type:id_token`
> - `requested_token_type=urn:ietf:params:oauth:token-type:id-jag`
> - `audience=https://auth.resource.xaa.dev`
> - `resource=https://api.resource.xaa.dev`  (or your BYOR resource URL)
> - `scope=<space-separated requested scopes>`
>
> Return value: the response's `access_token` field carries the
> **ID-JAG** (a signed delegation assertion). Treat as opaque.
>
> **Step 2 — RFC 7523 JWT-Bearer at the resource auth server**
>
> Discover
> `https://auth.resource.xaa.dev/.well-known/oauth-authorization-server`
> (cache like the IdP discovery). Authenticate with
> `RESOURCE_CLIENT_ID/RESOURCE_CLIENT_SECRET`. POST to the auth server's
> `token_endpoint` with:
>
> - `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
> - `assertion=<the ID-JAG from Step 1>`
> - `scope=<space-separated requested scopes>`
>
> Return value: a short-lived resource access token in `access_token`.
>
> Wrap both calls in a single `exchangeForResourceAccessToken(idToken,
> resourceUrl, scopes)` function returning `{idJag, accessToken,
> scopes}`.
>
> Log every request and response with redacted token values, plus the
> non-secret context (audience, resource, scope, expires_in).

## Objective

Mint a fresh resource access token on demand from the cached ID Token,
with full diagnostic visibility into the wire format and the two
distinct auth domains.

## Output (capabilities, not files)

| Capability                                 | Notes                                                                |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Cached discovery for the resource auth server | Mirror the pattern from the IdP discovery in 02.                  |
| `exchangeForResourceAccessToken()`         | Orchestrates Steps 1 + 2.                                            |
| Step-1 helper                              | Returns the ID-JAG, validates `issued_token_type=…id-jag`.           |
| Step-2 helper                              | Returns the access token, surfaces `expires_in` for the UI.          |
| Logger redaction                           | Redact `token | secret | assertion | jag | jwt` keys per `reference/error-mapping.md` § Token redaction. |

## Decisions to make (and their default answers)

- **Persist the access token?** Default: **no.** Re-mint per call from
  the session's ID Token. This shrinks blast radius on a session leak
  and matches xaa.dev's intended pattern (ID-JAGs and access tokens are
  ephemeral). If you really need caching, key it by the ID Token's
  `jti` or hash so a logout invalidates it implicitly.
- **Refresh tokens?** xaa.dev typically does not issue them for the
  resource client. If yours does, ignore them — re-mint from the ID
  Token instead. Adding refresh-token handling here multiplies the
  state machine without adding capability.
- **Where to log?** Stdout in dev plus an in-memory ring buffer the
  observability surface reads. See 05.

## Issues you may hit

- **`invalid_client` on Step 1.** You're sending `RESOURCE_CLIENT_ID/SECRET`
  to the IdP, or vice versa on Step 2. The pairs are not interchangeable.
- **`invalid_request: missing audience` on Step 1.** xaa.dev requires
  *both* `audience` and `resource` form fields. Some libraries default
  to omitting one — set it explicitly.
- **`unsupported_grant_type`.** Spelling. The URN is
  `urn:ietf:params:oauth:grant-type:token-exchange` (Step 1) and
  `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2). It is *not*
  `jwt_bearer`, not `urn:…token_exchange`, not anything else.
- **`invalid_grant: subject_token expired`.** The ID Token in your
  session has crossed its `exp`. Map to `expired_token` and prompt
  re-auth.
- **Token type confusion.** The `subject_token_type` URN ends in
  `id_token` (underscore). The `requested_token_type` URN ends in
  `id-jag` (hyphen). They look similar; copy them.

## Fixes

- Verify with curl independently of your library:
  ```bash
  curl -sS -u "${CLIENT_ID}:${CLIENT_SECRET}" \
       -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
       -d "subject_token=${ID_TOKEN}" \
       -d "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
       -d "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
       -d "audience=https://auth.resource.xaa.dev" \
       -d "resource=https://api.resource.xaa.dev" \
       -d "scope=${RESOURCE_SCOPES}" \
       "https://idp.xaa.dev/token"
  ```
  If this works and your code doesn't, the bug is in your client,
  not the IdP.

## Verification

Hermetic unit tests with stubbed HTTP must assert:

1. Step 1 hits `https://idp.xaa.dev/token` with `grant_type=…token-exchange`,
   `requested_token_type=…id-jag`, the ID Token in `subject_token`,
   the audience, the resource, and the scope.
2. Step 2 hits the auth-server's `token_endpoint` with
   `grant_type=…jwt-bearer`, the ID-JAG in `assertion`, and the scope.
3. An IdP `invalid_grant` response on Step 1 propagates as a thrown
   error (which the next layer maps to `expired_token`).
4. Two separate Authorization headers are used — Step 1 with
   `CLIENT_*`, Step 2 with `RESOURCE_CLIENT_*`.

End-to-end: with a real session, watch the observability log show:
`token-exchange POST → received ID-JAG → jwt-bearer POST → received
access_token`. The next prompt covers the resource fetch that
consumes this token.

### What "good" looks like

A successful E1 should produce a redacted log block roughly like this
(timestamps, ids, and durations vary):

```
2026-05-18T11:42:01Z  INFO  auth                user signed in (sub=auth0|abc123, scopes=openid+profile+email)
2026-05-18T11:42:14Z  INFO  token-exchange      POST https://idp.xaa.dev/token  audience=https://auth.resource.xaa.dev  resource=https://api.resource.xaa.dev  scope=todos.read
2026-05-18T11:42:14Z  INFO  token-exchange      ← 200  id_jag=eyJhbGc…3Q4xZ  expires_in=600
2026-05-18T11:42:14Z  INFO  jwt-bearer          POST https://auth.resource.xaa.dev/token  scope=todos.read
2026-05-18T11:42:15Z  INFO  jwt-bearer          ← 200  access_token=eyJraWQ…aB7Cd  expires_in=3600  scope=todos.read
2026-05-18T11:42:15Z  INFO  resource-call       GET https://api.resource.xaa.dev/api/todos
2026-05-18T11:42:15Z  INFO  resource-call       ← 200  duration=142ms  bytes=384
```

If your log block looks like this and the UI rendered the response
body, E1 is passing. If any of those four `→/←` pairs is missing, work
backwards: the missing line is where the bug lives.
