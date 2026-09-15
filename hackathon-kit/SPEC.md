# SPEC — the only reference you need

Canonical wire format, env contract, and error taxonomy for a Cross-App
Access (XAA) **Requesting App** on the xaa.dev playground. **Kit v4.** Every
fact lives here once; never guess a value that isn't here — ask. *Requesting
App* = the app you're building. *ID-JAG* = Identity Assertion Authorization
Grant, a signed delegation assertion the IdP mints so a resource can trust
your app is acting for the user.

---

## Hosts

| Role | URL | Discovery |
| --- | --- | --- |
| IdP | `https://idp.xaa.dev` | `/.well-known/openid-configuration`. SAML metadata `/saml/metadata`. |
| Resource auth server | `https://auth.resource.xaa.dev` | `/.well-known/oauth-authorization-server` |
| Resource (REST, Todo0) | `https://api.resource.xaa.dev` | `/.well-known/oauth-protected-resource` |
| MCP server (`APP_TYPE=mcp` only) | `https://mcp.xaa.dev/mcp` | see below |

IdP and resource auth server are **separate OAuth domains** — two client
credential pairs, one registered at each. Cache discovery for process lifetime;
xaa.dev's metadata is stable.

Three discovery traps:

1. `idp.xaa.dev/.well-known/oauth-authorization-server` **404s** — the IdP
   publishes OIDC discovery only.
2. On the resource auth server use **`oauth-authorization-server`**, not
   `openid-configuration`. Both return 200 and are byte-identical *except*
   that `openid-configuration` **omits
   `authorization_grant_profiles_supported`** — so a library defaulting to
   it never sees the id-jag grant profile advertised.
3. *(mcp)* RFC 9728 metadata is **path-suffixed**:
   `https://mcp.xaa.dev/.well-known/oauth-protected-resource/mcp`. The bare
   path 404s — take the URL from the `WWW-Authenticate: Bearer
   resource_metadata="…"` header rather than constructing it. **Do not
   follow the chain further:** `mcp.xaa.dev/.well-known/oauth-authorization-server`
   exists but leaks unroutable internal hostnames — plain `http://`,
   Docker-internal, resolving nowhere:
   `"token_endpoint": "http://authorization-server:5001/token"`, same for
   `jwks_uri`. The same leak exists at `api.resource.xaa.dev/api`. Use the
   `authorization_servers` pointer to confirm the AS identity, then fetch
   its metadata from `auth.resource.xaa.dev` directly. This only bites if
   you let the SDK run its own OAuth — which you must not (§ Invariants 9).

Fields you'll actually check (the first three are non-standard, per
`draft-ietf-oauth-identity-assertion-authz-grant-04` §§ 7.1–7.2):
`token_exchange_subject_token_types_supported` (IdP;
`[…:id_token, …:saml2, …:refresh_token]`),
`identity_chaining_requested_token_types_supported` (IdP;
`[…:id-jag, …:refresh_token]`), `authorization_grant_profiles_supported`
(auth srv; `["urn:ietf:params:oauth:grant-profile:id-jag"]`),
`scopes_supported` (both; includes `offline_access`), and
`token_endpoint_auth_methods_supported` (both; `client_secret_basic` **and**
`client_secret_post`). Both hosts also expose `/token/introspection`.

**Field-name trap:** the standard-sounding `subject_token_types_supported` does
**not** exist on either host — only the `token_exchange_`-prefixed name above.
There is no discovery signal for SAML as a *grant profile*; the only SAML
signal anywhere is `…token-type:saml2` in the IdP's subject-token list.

**No revocation endpoint exists** — absent from both metadata documents, and
16 probes (`token/revoke`, `revocation`, `oauth2/revoke`, `logout`, … GET and
POST, both hosts) all 404. You can introspect a token but not kill it.
`end_session_endpoint` *does* exist (`https://idp.xaa.dev/session/end`, plus
`/saml/slo` on SAML).

---

## The flow

`XAA_PROTOCOL` changes **how you log in**; `APP_TYPE` changes **what you do
with the token**. They branch in different places and never interact — all
four combinations are one build with two swaps. There is no combined
"SAML+MCP" variant: it's the SAML Step 0 plus the MCP Step 3. `APP_TYPE`
reaches Step 1 only as **configuration** (MCP needs `mcp.access` in the
scope list), never as logic.

```
OIDC:  authorize(+offline_access) ─► ID Token + REFRESH TOKEN ─┐
SAML:  SSO ─► assertion ─► [0b] ──► REFRESH TOKEN ─────────────┤
                                                               ▼
       [1] refresh → ID-JAG  ──►  [2] ID-JAG → access token ──►┤
            RFC 8693, CLIENT_*      RFC 7523, RESOURCE_CLIENT_* │
            5 min                   ~2 h, no refresh token      │
                          standalone ─► [3a] REST Bearer fetch ─┤
                          mcp        ─► [3b] official MCP SDK ──┘
              └──── re-run 1+2 on every /api/call ────┘
```

> **Step numbering is offset by one from xaa.dev's own docs.** This kit's
> Step 1 is their "Step 2", throughout. Their Step 1 is our Step 0; our
> Step 0b is undocumented by them.

### URN strings — copy, never retype

| URN | Used as |
| --- | --- |
| `urn:ietf:params:oauth:grant-type:token-exchange` | `grant_type`, Steps 0b + 1 |
| `urn:ietf:params:oauth:grant-type:jwt-bearer` | `grant_type`, Step 2 |
| `urn:ietf:params:oauth:token-type:saml2` | `subject_token_type`, Step 0b |
| `urn:ietf:params:oauth:token-type:refresh_token` | `subject_token_type`, Step 1 |
| `urn:ietf:params:oauth:token-type:id-jag` | `requested_token_type`, Step 1 (**hyphen**) |

`id-jag` is hyphenated; `refresh_token` and `id_token` use underscores. And
`urn:okta:params:oauth:token-type:id-jag` appears in xaa.dev's frontend as a
**display label only** — never send it; the IETF spelling goes on the wire.

### Lifetimes

| Token | Lifetime |
| --- | --- |
| ID Token | **~10 min.** `aud` = `client_id`. Too short to anchor a session. |
| SAML assertion | per its `Conditions`. Consumed once at Step 0b. |
| **Refresh token** | **undocumented — `TODO(confirm)`. This is the session anchor.** |
| ID-JAG | **5 min**, `iat` skew tolerance **30 s**. May be single-use. |
| Access token | **~2 h** (`expires_in: 7200`). |

**Why the refresh token is the anchor.** xaa.dev's `/docs/step2/` is
explicit: the ID Token is *"always available, but only good for one exchange
right after login"*, while the Refresh Token *"lets you mint new ID-JAGs
later without repeating it."* Never invent a refresh-token lifetime — no
countdown timers, no proactive-refresh schedulers keyed to a made-up TTL.

---

## Step 0 — user login

### ▸ OIDC — Authorization Code + PKCE

```
GET https://idp.xaa.dev/authorize
      ?client_id=<CLIENT_ID>
      &redirect_uri=<REDIRECT_URI>
      &response_type=code
      &scope=openid+profile+email+offline_access
      &prompt=consent
      &state=<base64url csprng, ≥32 bytes>
      &nonce=<base64url csprng, ≥32 bytes>
      &code_challenge=<base64url(SHA-256(code_verifier)), unpadded>
      &code_challenge_method=S256
```

`offline_access` is what makes the token response carry a `refresh_token`.
Omit it and every call after ~10 minutes fails. PKCE: 32 random bytes →
base64url unpadded = a 43-char `code_verifier`. **S256 only, never
`plain`.** Store `{code_verifier, state, nonce, created_at}` server-side
keyed by an httpOnly cookie; reject a callback older than **10 minutes**.

```
POST https://idp.xaa.dev/token
      grant_type=authorization_code
      code=<from query>
      redirect_uri=<must equal the authorize value>
      code_verifier=<from session>
      client_id=<CLIENT_ID>
      client_secret=<CLIENT_SECRET>
```

Response: `{access_token, id_token, refresh_token, token_type, expires_in:600}`.
Verify `state` matches the session's and the `id_token`'s `nonce` claim
matches the session's nonce. **Store `refresh_token`** — the anchor. Keep
the ID Token's *claims* for rendering; don't depend on it past ~10 min.
Ignore the IdP `access_token`; this kit never uses it. Then **skip Step 0b**
— go to Step 1.

### ▸ SAML — SP-initiated Web Browser SSO

| Property | Value |
| --- | --- |
| Metadata | `https://idp.xaa.dev/saml/metadata` |
| `entityID` | `https://idp.xaa.dev/saml` |
| SSO / SLO | `https://idp.xaa.dev/saml/sso` · `/saml/slo` (HTTP-Redirect + POST) |
| Signing cert CN | `IdenX SAML IdP` |
| `WantAuthnRequestsSigned` | `false` — no SP signing key needed to *send* an AuthnRequest |
| NameID formats | Use **`emailAddress`** or `persistent`. Metadata also advertises `transient` but registration rejects it — **and it would create a new user per login**, since the resource keys users by NameID. |

1. Send an `<AuthnRequest>` to the SSO endpoint. Carry your CSRF token in
   **`RelayState`** (SAML's `state`). Record the request `ID`. No PKCE, no
   `nonce` on this path.
2. Receive `SAMLResponse` at your ACS URL via **HTTP-POST** (form field
   `SAMLResponse`, standard base64).
3. **Validate all six before trusting anything:** XML signature against the
   metadata cert *and that it covers the assertion you're about to use*
   (signature-wrapping signs one element and substitutes another);
   `InResponseTo` == your request ID; `RelayState` == session value;
   `Conditions/AudienceRestriction` names your SP entityID;
   `NotBefore`/`NotOnOrAfter` bracket now; `Status` is
   `urn:oasis:names:tc:SAML:2.0:status:Success`.
4. Extract the **bare `<saml:Assertion>`** element — not the whole response
   document — preserving exact bytes. Re-serialising can break
   canonicalisation and invalidate a signature that was fine on the wire.

**Use a maintained library for signature verification** — the one place in the
kit where hand-rolling is actively dangerous, since XML-DSIG
signature-wrapping and XXE are both live risks.

---

## Step 0b — SAML assertion → refresh token

> **SAML only.** OIDC readers: skip to Step 1.

There is no direct `saml2 → id-jag` route. The assertion buys a refresh
token, which mints ID-JAGs from then on.

```
POST https://idp.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<base64url-UNPADDED bare <saml:Assertion>>
subject_token_type=urn:ietf:params:oauth:token-type:saml2
requested_token_type=urn:ietf:params:oauth:token-type:refresh_token
scope=openid offline_access email <RESOURCE_SCOPES>
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

Response: `{access_token:<ignore>, refresh_token:<ANCHOR — store it>,
issued_token_type:…refresh_token, token_type:"N_A"}`.

`requested_token_type` is **`refresh_token`**, not `id-jag`. Encoding is
**base64url, unpadded** per RFC 8693 § 3 — draft-04's own § 4.5 example shows
standard *padded* base64, which wouldn't survive form-encoding (a literal `+`
decodes to a space). Follow RFC 8693. The IdP also requires your SAML
Audience / SPEntityID to map to the authenticated client (§ 4.5), so a
mismatch between your registered SP and `CLIENT_ID` fails **here**, not at SSO.

**Store the refresh token; discard the assertion.** It has done its only job,
and keeping it will overflow a cookie session (§ Invariants 3).

---

## Step 1 — refresh token → ID-JAG (RFC 8693)

Identical on both paths.

```
POST https://idp.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<the refresh token from Step 0 or 0b>
subject_token_type=urn:ietf:params:oauth:token-type:refresh_token
requested_token_type=urn:ietf:params:oauth:token-type:id-jag
audience=https://auth.resource.xaa.dev
resource=https://api.resource.xaa.dev
scope=<space-separated>
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

Response: `{access_token:<the ID-JAG>, issued_token_type:…id-jag,
token_type:"N_A", expires_in:300}`. Validate `issued_token_type`; treat the
ID-JAG as opaque, since only the resource auth server validates it.
**`audience` and `resource` are both required** — omitting either is the
`invalid_request` you'll hit first, and some libraries drop one by default.

**The refresh token is not consumed.** Reuse it to mint more ID-JAGs (RFC
8693 § 2.1); don't clear it on success. Whether xaa.dev *rotates* them is
`TODO(confirm)` — write storage so that replacing the stored token when a
response carries a new `refresh_token` is harmless. You *may* pass an ID
Token instead (the IdP accepts all three subject types) — **don't**, that's
the v2 pattern, good for ~10 minutes.

| | `standalone` | `mcp` |
| --- | --- | --- |
| `scope` | `todos.read` | **`todos.read mcp.access`** — both required |
| `resource` | `https://api.resource.xaa.dev` | `TODO(confirm)`, see below |
| `audience` | `https://auth.resource.xaa.dev` | same |

### ID-JAG structure

JWT header `typ` **MUST** be `oauth-id-jag+jwt` (draft-04 § 3.1).

| Claim | Value |
| --- | --- |
| `iss` | `https://idp.xaa.dev` |
| `aud` | the resource auth server's issuer identifier |
| `sub` | end-user identifier (OIDC path) |
| `client_id` | the client ID **at the resource auth server** — xaa.dev derives it as `{CLIENT_ID}-at-{resource_id}` |
| `sub_id` | *optional.* RFC 9493 Subject Identifier. Present on SAML-derived ID-JAGs. |
| `resource`, `scope`, `jti`, `exp`, `iat`, `nbf` | echo Step 1 / standard |

On SAML, `sub_id` uses the **`saml-nameid`** format (draft-04 § 3.2.1):

```json
"sub_id": { "format": "saml-nameid",
            "issuer": "https://idp.xaa.dev/saml",
            "nameid": "user@example.com",
            "nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "sp_name_qualifier": "<your SP entityID, when SP-scoped>" }
```

`format`, `issuer`, `nameid` are required; the rest appear exactly when the
corresponding SAML attribute does. When *you* render or key off the subject:
**prefer `sub_id` and tolerate a missing `sub`**, don't use `nameid` alone,
and treat `sp_name_qualifier` as part of the identity when the NameID is
SP-scoped — the same `nameid` under different qualifiers is a different user
(draft-04 § 3.2.2). Validating the ID-JAG is the resource auth server's job,
not yours.

---

## Step 2 — ID-JAG → access token (RFC 7523)

Identical on both paths. **Note the client identity changes here.**

```
POST https://auth.resource.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
assertion=<the ID-JAG from Step 1>
scope=<space-separated>
client_id=<RESOURCE_CLIENT_ID>
client_secret=<RESOURCE_CLIENT_SECRET>
```

Response: `{access_token, token_type:"Bearer", expires_in:7200, scope}` —
exactly those four fields. xaa.dev's docs prescribe **`client_secret_post`**
(credentials in the form body, as shown) for developer-registered clients,
though its own demo app confusingly sends HTTP Basic. Both are advertised, so
both work — follow the docs.

**No `refresh_token` comes back, and you shouldn't want one.** Draft-04
§ 4.4.3: *"the ID-JAG replaces the use of Refresh Token for the Resource
Authorization Server."* When the access token expires, mint a new ID-JAG from
your refresh token. *(Access-token shape, if you decode one while debugging:
header `typ: at+jwt` per RFC 9068, `sub` is `{providerName}:{userSub}`, plus
an `app_org` claim.)*

---

## Step 3 — use the access token

### ▸ 3a — standalone

```
GET https://api.resource.xaa.dev${RESOURCE_PATH}      # default /api/todos
Authorization: Bearer <access_token>
Accept: application/json
```

Todo0 exposes five read endpoints, all `GET`, all needing `todos.read`:
`/api/todos`, `/api/todos/{completed,incomplete,stats}`, `/api/todos/:id`.
Metadata advertises `todos.write` but **no write endpoint exists** —
advertised-but-unbacked, and a good way to exercise `insufficient_scope`.

### ▸ 3b — MCP client

Wire format below is for **debugging only** — use the official SDK.

```
POST https://mcp.xaa.dev/mcp
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

| Property | Value |
| --- | --- |
| Transport | **StreamableHTTP** (JSON-RPC 2.0 over HTTP POST) |
| Protocol version | **`2025-03-26`** — pin it. Not `2025-06-18`. |
| Scopes | `todos.read` **and** `mcp.access` |
| Surface | **Resources, not tools** — `tools/list` returns nothing useful |
| Resources | `todo0://todos`, `todo0://todos/completed`, `todo0://todos/incomplete` |
| Health | `GET https://mcp.xaa.dev/health` — unauthenticated |

The `Accept` header is **mandatory** — omitting it yields `406`. The SDK sets
it, so this matters only when reproducing a call with curl. The demo call is
`resources/list` then `resources/read` on `todo0://todos`.

---

## Errors

One eight-code set, **the same for both app types** — MCP failures map onto
it rather than extending it, so the UI never branches on `APP_TYPE`.

| ErrorCode | When | HTTP | UX |
| --- | --- | --- | --- |
| `unauthorized` | no session, or 401 with no `error=` param | 401 | "Sign in" |
| `invalid_token` | 401 `error="invalid_token"`, description ≠ expired | 401 | "Token rejected" |
| `expired_token` | 401 `error="invalid_token"`, description mentions expired **(Step 3)** | 401 | "Expired — retry, it re-mints" |
| `expired_token` | `invalid_grant` from **Step 0b or Step 1** | 401 | "Session ended — sign in again" |
| `insufficient_scope` | 403 `error="insufficient_scope"`, or `invalid_scope` | 403 | "Missing scope X" |
| `resource_failure` | resource 5xx, network error, timeout | 502 | "Unavailable — retry" |
| `token_exchange_failure` | Step 0b/1/2 OAuth error other than `invalid_grant` | 502 | "Auth server error" |
| `config_error` | required env var missing at request time | 500 | "Misconfigured" |
| `unknown` | unclassified | 500 | "See logs" |

Shapes — `ok` is a **literal** `true`/`false` so discriminated unions narrow.
`details` may omit fields the upstream didn't provide.

```json
{ "ok": false, "error": "<ErrorCode>", "message": "<user-safe>",
  "details": { "upstream_status": 401, "upstream_error": "invalid_token",
               "upstream_description": "…", "upstream_step": "step1" } }

{ "ok": true,
  "request":  { "url": "…", "method": "GET" },
  "response": { "status": 200, "durationMs": 142, "body": {} },
  "tokens":   { "idJag": "head…tail", "accessToken": "head…tail",
                "scopes": ["todos.read"] } }
```

**Always record `upstream_step`** (`step0` · `step0b` · `step1` · `step2` ·
`step3`). With five failure layers it is the difference between "retry" and
"log the user out".

### The two faces of `expired_token` — the kit's most consequential rule

| Origin | What expired | What you do |
| --- | --- | --- |
| **Step 3**, 401 description mentions expired | the access token | **Re-mint.** Re-run Steps 1+2, retry **exactly once**, bounded by a counter — never recursion. If the fresh token is *also* rejected, that's clock skew or config; surface it. |
| **Step 1** `invalid_grant` | the **refresh token** | **Re-authenticate.** Set `requiresReauth`, send the user to login. **Nothing to retry** — expired, revoked and invalidated are indistinguishable and none are repairable. |
| **Step 0b** `invalid_grant` | the SAML assertion | **Re-authenticate.** Restart SSO. |

Branch on `details.upstream_step`, never on the code alone. Conflating these
produces an infinite loop.

### Decoding `WWW-Authenticate` (RFC 6750), in order

1. **403** + `error="insufficient_scope"` → `insufficient_scope`.
2. **401**: no header or no `error=` → `unauthorized`;
   `error="invalid_token"` + description matching `/expired|exp/i` →
   `expired_token`; `error="invalid_token"` otherwise, or any other
   `error=` value → `invalid_token`.
3. **5xx** or network failure → `resource_failure`.

Treat the parse as best-effort — never crash on a missing header. If your
"expired" match fails while curl clearly shows the substring, URL-decode
the header value first.

### OAuth token-exchange errors (Steps 0b / 1 / 2)

| `error` | Maps to |
| --- | --- |
| `invalid_grant` | `expired_token` — **branch on `upstream_step`** |
| `invalid_client` | `token_exchange_failure` — you crossed the two client pairs |
| `unsupported_grant_type` | `token_exchange_failure` — URN spelling |
| `invalid_scope` | `insufficient_scope` |
| `invalid_request` | `token_exchange_failure` — missing `audience`/`resource` lands here |
| `invalid_target` | `token_exchange_failure` — unknown `audience`/`resource` |
| anything else | `token_exchange_failure` |

`invalid_grant` sub-causes, from the description — all map the same, but need
different fixes: *expiry / `subject_token`* → past its life · *`iat` / clock /
skew* → **fix your clock, not your code** · *audience / resource* → Step 1
values wrong · *`sub_id` / NameID / subject* → (SAML) subject unresolvable, or
your tenant's SAML issuer isn't associated with the ID-JAG issuer. Draft-04
§ 3.2.2 specifies `invalid_grant` for *every* `sub_id` resolution failure, so
a SAML tenant misconfiguration is indistinguishable from a dead refresh token
by code alone — log the raw description.

### MCP transport + JSON-RPC failures

> **`APP_TYPE=mcp` only.** All tagged `upstream_step: "step3"`.

| Signal | ErrorCode |
| --- | --- |
| `401` + `-32000` `"Unauthorized: No access token provided"` | `unauthorized` |
| `401` + `"Unauthorized: Invalid or expired access token"` | `invalid_token`, or `expired_token` if it mentions expiry |
| `403` | `insufficient_scope` — most likely `mcp.access` missing from Step 1 |
| `406` | `resource_failure` — you omitted the `Accept` header. Client bug. |
| `5xx`, DNS, TCP, TLS, timeout | `resource_failure` |
| `-32601` method not found | `resource_failure` — e.g. `tools/list` on a resources-only server |
| `-32602` invalid params | `resource_failure` — usually a bad resource `uri` |
| `-32600` / `-32700` | `resource_failure` — suspect a hand-rolled call |
| `initialize` rejected on version | `resource_failure` — pin `2025-03-26` |
| SDK attempts its own OAuth | **not an error to map — a bug to fix.** `DEBUG.md` D-23. |

**Two 401s, two meanings.** From Steps 1–2 (OAuth error JSON) the token could
not be **minted**. From Step 3 (`WWW-Authenticate`, or JSON-RPC `-32000`) it
was minted and the **resource rejected it** — wrong `aud`, missing
`mcp.access`, or genuine expiry. Three different fixes; log the description
verbatim.

### Redaction

Redact any object key matching `/(token|secret|assertion|jag|jwt)/i` before
serialising: **>16 chars → `<first 8>…<last 8>`; ≤16 → `***`; null →
`undefined`**. Preserve non-matching keys verbatim — `audience`, `resource`,
`scope`, `status`, `duration`, `upstream_step` are the diagnostically useful
ones. Two catches: **`SAMLResponse` does not match that regex** and contains
the assertion, so add it explicitly or rename it to an `assertion`-keyed field
first; and **`sub_id` is not a secret** — it's the diagnostic you need most on
SAML, so log it in full.

---

## Environment

Fixed (never substitute): `IDP_URL=https://idp.xaa.dev`,
`AUTH_SERVER_URL=https://auth.resource.xaa.dev`,
`RESOURCE_URL=https://api.resource.xaa.dev`.

Credentials come from <https://xaa.dev/developer/register>, which has an
**`OIDC | SAML` tab toggle** — use the tab matching your path. You get **two
distinct client pairs, both required**: `CLIENT_*` at `idp.xaa.dev/token`
(Steps 0, 0b, 1) and `RESOURCE_CLIENT_*` at `auth.resource.xaa.dev/token`
(Step 2). The resource client ID looks like `<CLIENT_ID>-at-<resource_id>`
(e.g. `client_abc-at-todo0`) — **that suffix is meaningful; don't strip it.**
Secrets are shown once. Registration fields: app name; redirect URI (OIDC) or
ACS URL (SAML), **byte-exact** with your env value or you get
`redirect_uri_mismatch` (OIDC) / a *silent* failure (SAML); NameID format;
and resource (`Todo0` by default). `offline_access` is **not** a registration
field — it's a scope you request. **On SAML, the resource auth server must
have SAML enabled for your tenant**, or Step 2 rejects a perfectly correct
ID-JAG (DEBUG D-16).

The developer fills `.env.local` themselves — **never solicit secrets in
chat.** Template:

```dotenv
# === Fixed (leave as-is) ===
IDP_URL=https://idp.xaa.dev
AUTH_SERVER_URL=https://auth.resource.xaa.dev
RESOURCE_URL=https://api.resource.xaa.dev

# === The two axes ===
XAA_PROTOCOL=oidc                 # oidc | saml       — how you log in
APP_TYPE=standalone               # standalone | mcp  — what you do with the token

# === Per-developer (from xaa.dev/developer/register) ===
CLIENT_ID=                        # IdP client — Steps 0, 0b, 1
CLIENT_SECRET=
RESOURCE_CLIENT_ID=               # resource AS client — Step 2
RESOURCE_CLIENT_SECRET=

# --- APP_TYPE=standalone only ---
RESOURCE_PATH=/api/todos
RESOURCE_SCOPES=todos.read

# --- APP_TYPE=mcp only ---
MCP_SERVER_URL=https://mcp.xaa.dev/mcp
MCP_PROTOCOL_VERSION=2025-03-26
# RESOURCE_SCOPES=todos.read mcp.access   # BOTH required in MCP mode

APP_URL=http://localhost:3000

# --- OIDC path only ---
REDIRECT_URI=http://localhost:3000/api/auth/callback

# --- SAML path only ---
SAML_ACS_URL=http://localhost:3000/api/auth/saml/acs
SAML_NAMEID_FORMAT=emailAddress   # or persistent; transient unsupported
# TODO(confirm) SP entityID var name — register to see the rendered fields.
# TODO(confirm) whether an SP signing key is issued.

SESSION_SECRET=                   # openssl rand -base64 32
```

Validate **only the vars your two axes need** — `REDIRECT_URI` (OIDC) vs
`SAML_ACS_URL` + `SAML_NAMEID_FORMAT` (SAML); `RESOURCE_PATH` (standalone) vs
`MCP_SERVER_URL` + `MCP_PROTOCOL_VERSION` (MCP) — not all four groups. BYOR
overrides `RESOURCE_URL`/`RESOURCE_PATH`/`RESOURCE_SCOPES` or
`MCP_SERVER_URL`; discovery and login still go through the fixed IdP.

---

## Invariants

1. **PKCE S256 only**, never `plain`. *(OIDC)*
2. **State + nonce verified server-side.** *(OIDC.* SAML equivalent:
   `RelayState` + `InResponseTo` + `AudienceRestriction`.*)*
3. **The refresh token is the session anchor and never reaches the
   browser** — server-side session only. Same for the ID Token and the SAML
   assertion. Not `localStorage`, not a non-httpOnly cookie, not a URL, not
   a response body, not `.env.local`, not a log in plaintext.
4. **Two distinct client pairs**, never mixed — the most common cause of
   opaque `invalid_client`.
5. **`offline_access` on Step 0 / 0b — and assert the refresh token came
   back.** A silent absence resurfaces ~10 minutes later as a mystery
   `invalid_grant`.
6. **`audience` and `resource` on Step 1** — both required.
7. **Re-mint per call.** Never persist the ID-JAG or access token; the
   refresh token in the session is the canonical state. The ID-JAG lives
   5 min and may be single-use.
8. **Redact in logs** (§ Redaction).
9. *(mcp)* **The kit mints the token; the SDK receives it.** Supply it
   through the SDK's `authProvider` seam and leave every acquisition member
   unimplemented. MCP's own OAuth — RFC 9728 discovery, DCR, auth-code +
   PKCE — is an *alternative* to XAA, not a complement; the token already
   exists. Letting it run registers a third client identity and walks into
   the discovery leak above.

Never bypass one of these to move faster — no skipped state/nonce or
`InResponseTo`/audience check, no 401 swallowed as a 200, no type union
widened to silence narrowing. Fix the root cause.

---

## Unverified against xaa.dev — ask, never guess

Every `TODO(confirm)` in the kit, collected. Hitting one means **stop and ask
the developer**; filling in a plausible value is the failure mode this list
exists to prevent.

1. **Refresh-token lifetime.** Undocumented. Invent no TTL, no countdown.
2. **Refresh-token rotation.** Never addressed; make replacement harmless.
3. **`prompt=consent`** — xaa.dev's demo sends it alongside `offline_access`;
   unknown whether it's *required* to get a refresh token.
4. **Whether `end_session_endpoint` invalidates outstanding refresh tokens.**
   Given no revocation endpoint it's the only lever that might. Don't assume
   it does, and don't claim it in your UI unverified.
5. **`resource` in MCP mode.** Docs say *"the MCP URL is not the audience —
   the resource URL is"*, yet `todo0-mcp`'s registered `resource_server_url`
   **is** `https://mcp.xaa.dev/mcp`. Try `https://api.resource.xaa.dev` first;
   if Step 2 succeeds but the MCP server returns *"Invalid or expired access
   token"*, switch — that asymmetry is the tell (DEBUG D-20).
6. **MCP resource URI scheme.** Docs say `todo0://todos`; the IdP's resource
   catalog says `todo://todos`. Try `todo0://` first. Also unconfirmed
   whether `tools/list` is genuinely empty.
7. **Whether `sub` survives alongside `sub_id`.** Draft-04 § 9.5 says `sub`
   stays REQUIRED and `sub_id` is additive; xaa.dev's UI copy implies
   substitution. Resolving on `sub_id` and tolerating a missing `sub` is
   correct either way.
8. **SAML registration fields.** The form is behind an email gate, so the var
   name for your **SP entityID** and whether an **SP signing key** is issued
   are both unobserved. Register, see what you're given, then add the vars you
   actually received. Don't guess names.
9. **Python MCP SDK parameter name** for injecting a bearer token into
   `streamablehttp_client`. The TypeScript path is the verified one.

> **Provenance.** The SAML material here is derived from xaa.dev's live
> SAML metadata, its discovery fields, and its shipped browser client. As
> of **2026-08-26** xaa.dev's prose docs at `/docs` do not cover SAML at
> all — don't expect them to corroborate it. The OIDC material *is*
> corroborated by `/docs`.
