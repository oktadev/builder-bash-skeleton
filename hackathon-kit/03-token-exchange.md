# 03 — Token exchange (the XAA core)

> **Path-neutral.** Everything in this file is identical on the OIDC and
> SAML paths. By now you hold a refresh token in the session; where it
> came from no longer matters.

## Prompt

> Implement the two-step Cross-App Access exchange. Read
> `reference/xaa-spec.md` § Steps 1–2 first — those tables are the
> source of truth for every form field below.
>
> **Step 1 — RFC 8693 Token Exchange at the IdP**
>
> Authenticate with `CLIENT_ID/CLIENT_SECRET`. POST to
> `https://idp.xaa.dev/token` with:
>
> - `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
> - `subject_token=<the refresh token from the session>`
> - `subject_token_type=urn:ietf:params:oauth:token-type:refresh_token`
> - `requested_token_type=urn:ietf:params:oauth:token-type:id-jag`
> - `audience=https://auth.resource.xaa.dev`
> - `resource=https://api.resource.xaa.dev`  (or your BYOR resource URL)
> - `scope=<space-separated requested scopes>`
>
> Return value: the response's `access_token` field carries the
> **ID-JAG** (a signed delegation assertion). Treat as opaque. Validate
> `issued_token_type` is `…token-type:id-jag`.
>
> **The refresh token is not consumed by this exchange.** xaa.dev is
> explicit: *"Not single-use — unlike the ID-JAG, the Refresh Token
> isn't consumed by this exchange — reuse it to mint more ID-JAGs until
> it expires or is revoked."* So do not clear it from the session on
> success. **Do** write your storage layer so that if a response ever
> carries a new `refresh_token`, replacing the stored one is harmless —
> whether xaa.dev rotates is `TODO(confirm)`.
>
> **Step 2 — RFC 7523 JWT-Bearer at the resource auth server**
>
> Discover
> `https://auth.resource.xaa.dev/.well-known/oauth-authorization-server`
> (cache like the IdP discovery). Authenticate with
> `RESOURCE_CLIENT_ID/RESOURCE_CLIENT_SECRET` using
> **`client_secret_post`** — credentials in the form body. POST to the
> auth server's `token_endpoint` with:
>
> - `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`
> - `assertion=<the ID-JAG from Step 1>`
> - `scope=<space-separated requested scopes>`
> - `client_id=<RESOURCE_CLIENT_ID>`
> - `client_secret=<RESOURCE_CLIENT_SECRET>`
>
> Return value: a resource access token in `access_token` (~2 h).
>
> **Use `oauth-authorization-server`, not `openid-configuration`.** Both
> URLs return 200 on this host and are byte-identical *except* that
> `openid-configuration` omits `authorization_grant_profiles_supported`.
> A library that defaults to `openid-configuration` never sees the
> id-jag grant profile advertised.
>
> **No `refresh_token` comes back from Step 2, and you should not want
> one.** See § Decisions below.
>
> Wrap both calls in a single
> `exchangeForResourceAccessToken(refreshToken, resourceUrl, scopes)`
> function returning `{idJag, accessToken, scopes, expiresIn}`.
>
> Log every request and response with redacted token values, plus the
> non-secret context (audience, resource, scope, `expires_in`, and which
> step raised any error).

## Objective

Mint a fresh resource access token on demand from the session's refresh
token, with full diagnostic visibility into the wire format and the two
distinct auth domains.

## Output (capabilities, not files)

| Capability                                 | Notes                                                                |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Cached discovery for the resource auth server | Mirror the pattern from the IdP discovery in 02. Use the `oauth-authorization-server` URL. |
| `exchangeForResourceAccessToken()`         | Orchestrates Steps 1 + 2.                                            |
| Step-1 helper                              | Takes the refresh token, returns the ID-JAG, validates `issued_token_type=…id-jag`. |
| Step-2 helper                              | Returns the access token, surfaces `expires_in` for the UI.          |
| `upstream_step` on every error             | `step1` or `step2`. The UI's re-mint-vs-re-auth decision depends on it — see `reference/error-mapping.md`. |
| Logger redaction                           | Redact `token \| secret \| assertion \| jag \| jwt` keys per `reference/error-mapping.md` § Token redaction. |

## Decisions to make (and their default answers)

- **Persist the access token or the ID-JAG?** Default: **no.** Re-mint
  per call from the session's refresh token. The ID-JAG lives 5 minutes
  and xaa.dev says it *may be single-use*, so caching it is not merely
  untidy — it may simply fail. The access token lives ~2 h and could be
  cached, but re-minting keeps one code path and shrinks blast radius on
  a session leak. If you do cache the access token, key it by a hash of
  the refresh token so a logout invalidates it implicitly, and set a TTL
  well under the upstream `expires_in`.

- **Refresh tokens?** **Yes — the refresh token is the whole basis of
  this step.** It is the `subject_token` on Step 1, and it is what lets
  you mint ID-JAGs for hours without sending the user back through
  login.

  Two things participants get wrong here:

  1. **Don't use the ID Token as the `subject_token`.** The IdP accepts
     it (`…token-type:id_token` is in
     `token_exchange_subject_token_types_supported`), so it *works* —
     for about ten minutes. xaa.dev's docs describe the ID Token as
     *"only good for one exchange right after login"* and the refresh
     token as *"recommended […] lets you mint new ID-JAGs later without
     repeating it."* Using the ID Token is the v2 pattern that v3
     replaces.
  2. **Don't look for a refresh token from Step 2.** The resource auth
     server does not issue one, deliberately. Draft-04 § 4.4.3: *"The
     Resource Authorization Server SHOULD NOT return a Refresh Token
     […] The ID-JAG replaces the use of Refresh Token for the Resource
     Authorization Server."* xaa.dev's documented Step 2 response body
     has exactly four fields — `access_token`, `token_type`,
     `expires_in`, `scope`. When the access token expires, come back
     here and mint a new ID-JAG.

- **When to re-mint vs re-authenticate.** The entire rule:

  ```
  Need an access token       → refresh token → ID-JAG → access token
  Step 1 returns invalid_grant → refresh token is dead → re-authenticate
  ```

  A rejected refresh token cannot be repaired — expired, revoked, and
  invalidated are indistinguishable and none are retryable. **Do not
  build a retry loop around Step 1.** Send the user to `/login`. On the
  SAML path that means Step 0 *and* Step 0b again.

- **Where to log?** Stdout in dev plus an in-memory ring buffer the
  observability surface reads. See 05.

## Issues you may hit

- **`invalid_client` on Step 1.** You're sending `RESOURCE_CLIENT_ID/SECRET`
  to the IdP, or vice versa on Step 2. The pairs are not interchangeable.
  Note the resource client ID is derived as
  `{CLIENT_ID}-at-{resource_id}` — don't strip the suffix.
- **`invalid_request: missing audience` on Step 1.** xaa.dev requires
  *both* `audience` and `resource` form fields. Some libraries default
  to omitting one — set it explicitly.
- **`unsupported_grant_type`.** Spelling. The URN is
  `urn:ietf:params:oauth:grant-type:token-exchange` (Step 1) and
  `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2). It is *not*
  `jwt_bearer`, not `urn:…token_exchange`, not anything else.
- **`invalid_grant` on Step 1.** Your refresh token is expired, revoked,
  or invalid. This is a **re-authenticate**, not a retry. Map to
  `expired_token` with `upstream_step: "step1"`.
- **`invalid_grant` on Step 2 mentioning `iat` or clock.** The ID-JAG's
  `iat` is outside xaa.dev's **30 s** skew tolerance. Fix your system
  clock — no amount of code change helps. See `06` § D-18.
- **Token type confusion.** Step 1's `subject_token_type` ends in
  `refresh_token` (underscore). Its `requested_token_type` ends in
  `id-jag` (hyphen). The old `id_token` (underscore) value still works
  but is the v2 pattern. Copy them; don't retype.
- **Sending Step 2 credentials as HTTP Basic.** It works — both methods
  are in `token_endpoint_auth_methods_supported` — but xaa.dev's docs
  prescribe `client_secret_post` for developer-registered clients, and
  xaa.dev's own demo app confusingly uses Basic. Follow the docs.
- **You see a vendor URN in the wild.** `urn:okta:params:oauth:token-type:id-jag`
  exists in xaa.dev's frontend as a display label only. The IETF
  spelling `urn:ietf:params:oauth:token-type:id-jag` is what goes on the
  wire. Don't "correct" it.

## Fixes

Verify with curl independently of your library. Export `REFRESH_TOKEN`
from a real session first (log it redacted, then pull the full value
from your session store — don't paste it into a shared terminal).

```bash
# Step 1 — refresh token → ID-JAG
curl -sS \
     -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
     -d "subject_token=${REFRESH_TOKEN}" \
     -d "subject_token_type=urn:ietf:params:oauth:token-type:refresh_token" \
     -d "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
     -d "audience=https://auth.resource.xaa.dev" \
     -d "resource=https://api.resource.xaa.dev" \
     -d "scope=${RESOURCE_SCOPES}" \
     -d "client_id=${CLIENT_ID}" \
     -d "client_secret=${CLIENT_SECRET}" \
     "https://idp.xaa.dev/token"

# Step 2 — ID-JAG → access token (client_secret_post, per xaa.dev docs)
curl -sS \
     -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
     -d "assertion=${ID_JAG}" \
     -d "scope=${RESOURCE_SCOPES}" \
     -d "client_id=${RESOURCE_CLIENT_ID}" \
     -d "client_secret=${RESOURCE_CLIENT_SECRET}" \
     "https://auth.resource.xaa.dev/token"
```

If these work and your code doesn't, the bug is in your client, not the
server.

Inspect the ID-JAG's header and payload to confirm what you got (this
only base64url-decodes — it does not verify the signature, which is the
auth server's job):

```bash
# Header — typ MUST be oauth-id-jag+jwt
echo "${ID_JAG}" | cut -d. -f1 | tr '_-' '/+' | base64 -d 2>/dev/null; echo
# Payload — check iss, aud, client_id, exp, and sub or sub_id
echo "${ID_JAG}" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null; echo
```

On the SAML path the payload carries a `sub_id` with
`"format": "saml-nameid"`. On the OIDC path it carries a plain `sub`.

## Verification

Hermetic unit tests with stubbed HTTP must assert:

1. Step 1 hits `https://idp.xaa.dev/token` with `grant_type=…token-exchange`,
   `subject_token_type=…refresh_token`, `requested_token_type=…id-jag`,
   the **refresh token** in `subject_token`, the audience, the resource,
   and the scope.
2. Step 2 hits the auth server's `token_endpoint` with
   `grant_type=…jwt-bearer`, the ID-JAG in `assertion`, the scope, and
   credentials **in the form body**.
3. An IdP `invalid_grant` on Step 1 propagates as an error tagged
   `upstream_step: "step1"` (which the next layer maps to
   `expired_token` → re-authenticate).
4. An auth-server `invalid_grant` on Step 2 propagates tagged
   `upstream_step: "step2"`.
5. Two separate credential pairs are used — Step 1 with `CLIENT_*`,
   Step 2 with `RESOURCE_CLIENT_*`.
6. **The refresh token is still in the session after a successful
   exchange.** It is not single-use; clearing it would force a
   needless re-login.
7. Discovery for the resource auth server requests the
   `oauth-authorization-server` URL, not `openid-configuration`.

End-to-end: with a real session, watch the observability log show
`token-exchange POST → received ID-JAG → jwt-bearer POST → received
access_token`. The next prompt covers the resource fetch that consumes
this token.

### What "good" looks like

A successful E1 should produce a redacted log block roughly like this
(timestamps, ids, and durations vary):

```
2026-08-26T11:42:01Z  INFO  auth                user signed in (sub=user_7f3a91c2, scopes=openid+profile+email+offline_access)
2026-08-26T11:42:01Z  INFO  auth                refresh_token stored  refresh_token=eyJhbGc…9pQ2w
2026-08-26T11:42:14Z  INFO  token-exchange      POST https://idp.xaa.dev/token  step=1  subject_token_type=…refresh_token  audience=https://auth.resource.xaa.dev  resource=https://api.resource.xaa.dev  scope=todos.read
2026-08-26T11:42:14Z  INFO  token-exchange      ← 200  id_jag=eyJhbGc…3Q4xZ  issued_token_type=…id-jag  expires_in=300
2026-08-26T11:42:14Z  INFO  jwt-bearer          POST https://auth.resource.xaa.dev/token  step=2  scope=todos.read
2026-08-26T11:42:15Z  INFO  jwt-bearer          ← 200  access_token=eyJraWQ…aB7Cd  expires_in=7200  scope=todos.read
2026-08-26T11:42:15Z  INFO  resource-call       GET https://api.resource.xaa.dev/api/todos
2026-08-26T11:42:15Z  INFO  resource-call       ← 200  duration=142ms  bytes=384
```

On the **SAML path** you'd see two extra lines before the first
`token-exchange`, from Step 0b:

```
2026-08-26T11:41:58Z  INFO  saml                ACS received  InResponseTo=_a1b2c3  audience=OK  signature=OK
2026-08-26T11:42:00Z  INFO  token-exchange      POST https://idp.xaa.dev/token  step=0b  subject_token_type=…saml2  requested_token_type=…refresh_token
2026-08-26T11:42:00Z  INFO  token-exchange      ← 200  refresh_token=eyJhbGc…9pQ2w  sub_id.format=saml-nameid
```

If your log block looks like this and the UI rendered the response body,
E1 is passing. If any `→/←` pair is missing, work backwards: the missing
line is where the bug lives.

**A second `/api/call` minutes later should reproduce every line from
`token-exchange` onward with no `auth` lines at all.** If it sends the
user back to login, your refresh token isn't being reused — that's E6
failing, and it's the most common v3 mistake.
