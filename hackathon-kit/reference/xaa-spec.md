# XAA wire spec — canonical reference

This is the only place the kit specifies *exact* HTTP wire format. Every
prompt that performs an XAA exchange links here. If you change a field
name, change it here once.

**Kit version: v3.** Two protocol paths (OIDC and SAML); the IdP refresh
token is the session anchor. See `MIGRATION-v2-to-v3.md` if you built
against v2.

---

## Roles

| Role                       | Default URL on xaa.dev               | What it does                                                                  |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| **IdP**                    | `https://idp.xaa.dev`                | Authenticates the user. Issues **Identity Assertions** (ID Token *or* SAML assertion) and refresh tokens. Mints **ID-JAG**s. |
| **Resource auth server**   | `https://auth.resource.xaa.dev`      | Validates an ID-JAG. Mints resource **access tokens**.                        |
| **Resource server**        | `https://api.resource.xaa.dev`       | Bearer-protected REST/MCP API.                                                |

The IdP and the resource auth server are **separate** OAuth domains. Two
client credential pairs are required — one registered at each.

---

## Step numbering — kit vs xaa.dev docs

**The kit and xaa.dev's own docs number these hops differently.** You
will read both; keep this mapping to hand.

| Hop                                 | This kit    | xaa.dev `/docs` |
| ----------------------------------- | ----------- | --------------- |
| User login (OIDC or SAML)           | **Step 0**  | Step 1          |
| SAML assertion → refresh token      | **Step 0b** | *(undocumented)*|
| Refresh token → ID-JAG              | **Step 1**  | Step 2          |
| ID-JAG → access token               | **Step 2**  | Step 3          |
| Bearer call to the resource         | **Step 3**  | *(§ Todo0 API)* |

So a xaa.dev doc page titled "Step 2" is this kit's **Step 1**. Off by
one throughout.

---

## Choose your path

Everything below branches exactly twice — at Step 0, and at Step 0b.
From Step 1 onward both paths are **identical**.

```
OIDC path:  authorize(+offline_access) ──► ID Token + refresh token ─┐
                                                                     │
SAML path:  SAML SSO ──► assertion ──► [Step 0b] ──► refresh token ──┤
                                                                     │
            ┌────────────────────────────────────────────────────────┘
            └─► [Step 1] ID-JAG ─► [Step 2] access token ─► [Step 3] resource
```

Pick OIDC unless you specifically need SAML. See `00-brief.md` § Choose
your protocol path.

> **Provenance.** The SAML details in this file are derived from
> xaa.dev's live SAML metadata, its discovery fields, and its shipped
> browser client. As of **2026-08-26** xaa.dev's prose docs at `/docs`
> do not cover SAML at all — don't expect them to corroborate the SAML
> sections here. The OIDC sections *are* corroborated by `/docs`.

---

## Discovery

Both authorization domains expose metadata. Cache the result; do not
re-fetch per request.

```
GET https://idp.xaa.dev/.well-known/openid-configuration
GET https://auth.resource.xaa.dev/.well-known/oauth-authorization-server
GET https://api.resource.xaa.dev/.well-known/oauth-protected-resource
```

> **Use `oauth-authorization-server`, not `openid-configuration`, on the
> resource auth server.** Both URLs return 200 and are byte-identical
> *except* that `openid-configuration` **omits
> `authorization_grant_profiles_supported`**. An OIDC library that
> defaults to `openid-configuration` will never see the id-jag grant
> profile advertised.

> `https://idp.xaa.dev/.well-known/oauth-authorization-server` returns
> **404**. The IdP publishes OIDC discovery only.

The fields you care about:

| Field                                              | Server   | Observed value / use                                                     |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| `authorization_endpoint`                           | IdP      | `https://idp.xaa.dev/authorize` — drive PKCE login (OIDC path)           |
| `token_endpoint`                                   | both     | Step 0/0b/1 (IdP), Step 2 (auth server)                                  |
| `jwks_uri`                                         | both     | Verify ID-JAG / access-token signatures                                  |
| `scopes_supported`                                 | both     | `["openid","offline_access","email","profile"]` — **`offline_access` is available** |
| `grant_types_supported`                            | IdP      | includes `refresh_token`, `urn:ietf:params:oauth:grant-type:token-exchange` |
| `grant_types_supported`                            | auth srv | includes `urn:ietf:params:oauth:grant-type:jwt-bearer`                    |
| `token_exchange_subject_token_types_supported`     | IdP      | `[…:id_token, …:saml2, …:refresh_token]` — all three subject types        |
| `identity_chaining_requested_token_types_supported`| IdP      | `[…:id-jag, …:refresh_token]` — what the IdP will mint                   |
| `authorization_grant_profiles_supported`           | auth srv | `["urn:ietf:params:oauth:grant-profile:id-jag"]`                          |
| `token_endpoint_auth_methods_supported`            | both     | includes `client_secret_basic` **and** `client_secret_post`               |
| `introspection_endpoint`                           | both     | `/token/introspection`                                                    |

The first two extension fields are **non-standard**; they correspond to
`draft-ietf-oauth-identity-assertion-authz-grant-04` § 7.1.
`authorization_grant_profiles_supported` is § 7.2 of the same draft.

> **Field-name trap.** The bare key `subject_token_types_supported` does
> **not exist** on either server. xaa.dev publishes
> `token_exchange_subject_token_types_supported` instead. Discovery-parsing
> code that looks for the standard-sounding name finds nothing and may
> conclude the server accepts no subject tokens at all.

**There is no discovery signal for "I accept SAML subject tokens" as a
grant profile.** Exactly one profile identifier exists
(`…grant-profile:id-jag`) and it does not vary by path. The only SAML
signal anywhere in discovery is `…token-type:saml2` inside the IdP's
`token_exchange_subject_token_types_supported`.

> **No revocation endpoint exists.** Absent from both metadata
> documents. Sixteen probes — `token/revocation`, `token/revoke`,
> `revocation`, `revoke`, `oauth/revoke`, `oauth2/revoke`,
> `session/revoke`, `logout`, each with GET and POST, on both hosts — all
> return 404. `introspection_endpoint` (`/token/introspection`) exists on
> both, so you can check whether a token is still live, but you cannot
> kill it.
>
> `end_session_endpoint` (`https://idp.xaa.dev/session/end`, and
> `/saml/slo` on the SAML path) **does** exist. Whether ending the IdP
> session invalidates outstanding refresh tokens is `TODO(confirm)` —
> undocumented and untested. It is the only lever that might achieve
> upstream invalidation; don't assume it does. See § Token lifetimes.

---

## Token lifetimes

Documented by xaa.dev unless marked otherwise.

| Token           | Lifetime      | Notes                                                        |
| --------------- | ------------- | ------------------------------------------------------------ |
| ID Token        | **~10 min**   | `aud` must equal `client_id`. Too short to be a session anchor — see below. |
| SAML assertion  | per assertion `Conditions` | Consumed once at Step 0b.                       |
| **Refresh token** | **`TODO(confirm)`** | Not documented anywhere on xaa.dev. **This is the session anchor.** |
| ID-JAG          | **5 min**     | `iat` clock-skew tolerance **30 s**; exceeding it → `invalid_grant`. Docs say it "may be single-use." |
| Access token    | **~2 h**      | `expires_in: 7200`.                                          |

> **Why the refresh token is the session anchor, not the ID Token.**
> xaa.dev's `/docs/step2/` is explicit: the ID Token is *"always
> available, but only good for one exchange right after login"*, whereas
> the Refresh Token is *"recommended […] lets you mint new ID-JAGs later
> without repeating it"*. With a ~10 min ID Token lifetime, a session
> anchored on the ID Token dies almost immediately. Anchor on the
> refresh token.

---

## Step 0 — user login

### ▸ OIDC path — Authorization Code + PKCE

```
GET  https://idp.xaa.dev/authorize
       ?client_id=<CLIENT_ID>
       &redirect_uri=<REDIRECT_URI>
       &response_type=code
       &scope=openid+profile+email+offline_access
       &prompt=consent
       &state=<base64url csprng, ≥32 bytes entropy>
       &nonce=<base64url csprng, ≥32 bytes entropy>
       &code_challenge=<base64url(SHA-256(code_verifier))>
       &code_challenge_method=S256
```

`offline_access` is what makes the token response include a
`refresh_token`. Without it you get no session anchor and every call
after ~10 minutes fails.

`prompt=consent` is what xaa.dev's own demo sends alongside
`offline_access`. `TODO(confirm)` whether it is *required* to obtain a
refresh token or merely conventional.

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

Response (with `offline_access` requested):

```json
{
  "access_token":  "<IdP access token — not used by this kit>",
  "id_token":      "<JWT — verify nonce, read claims, then done>",
  "refresh_token": "<THE SESSION ANCHOR — store this>",
  "token_type":    "Bearer",
  "expires_in":    600
}
```

Verify the returned `id_token`'s `nonce` claim equals the session's
nonce. Verify the `state` query param equals the session's state.

**Store** the `refresh_token` in the session — it is the durable
credential. Store the `id_token` too if you want to render user claims,
but do not rely on it past ~10 minutes. **Do not** send either to the
browser. Ignore the IdP `access_token`; this kit never uses it.

Then **skip Step 0b** — you already have a refresh token. Go to Step 1.

### ▸ SAML path — SP-initiated Web Browser SSO

xaa.dev's SAML IdP:

| Property                  | Value                                  |
| ------------------------- | -------------------------------------- |
| Metadata                  | `https://idp.xaa.dev/saml/metadata`    |
| `entityID`                | `https://idp.xaa.dev/saml`             |
| SSO endpoint              | `https://idp.xaa.dev/saml/sso` (HTTP-Redirect + HTTP-POST) |
| SLO endpoint              | `https://idp.xaa.dev/saml/slo` (HTTP-Redirect + HTTP-POST) |
| `WantAuthnRequestsSigned` | `false` — you need no SP signing key to *send* an AuthnRequest |
| NameID formats            | Metadata advertises `emailAddress`, `persistent`, **and `transient`** — but registration accepts only the first two. **Don't pick `transient`** even though the metadata lists it. |

1. Register your SP at `https://xaa.dev/developer/register?tab=saml`.
   See `env-vars.md` § Registration walkthrough → SAML path.
2. Send an `<AuthnRequest>` to the SSO endpoint. Carry your CSRF /
   transaction token in **`RelayState`** — this is SAML's equivalent of
   OIDC `state`. There is no PKCE and no `nonce` on this path.
3. Receive the `SAMLResponse` at your ACS URL via **HTTP-POST**
   (form field `SAMLResponse`, standard-base64).
4. Validate the response: signature against the IdP metadata cert
   (CN `IdenX SAML IdP`), `InResponseTo` matches your AuthnRequest ID,
   `Conditions/AudienceRestriction` names your SP entityID, and
   `NotBefore`/`NotOnOrAfter` bracket now.
5. **Extract the bare `<saml:Assertion>` element** from the
   `SAMLResponse` — *not* the whole response document. Then proceed to
   Step 0b.

> **Do not use `transient` NameID.** Your resource server keys users by
> NameID, so a per-session random value creates a new user on every
> login.

---

## Step 0b — SAML assertion → refresh token

> **SAML path only.** OIDC-path readers: skip to Step 1.

There is no direct `saml2 → id-jag` route on xaa.dev. The assertion buys
a refresh token first, and the refresh token mints ID-JAGs from then on.

The assertion must be **base64url-encoded, unpadded** — RFC 8693 § 3
for `…token-type:saml2`. (Draft-04's own § 4.5 example shows *standard*
padded base64, which would not survive form-encoding. Follow RFC 8693.)

```
POST https://idp.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<base64url-unpadded bare <saml:Assertion>>
subject_token_type=urn:ietf:params:oauth:token-type:saml2
requested_token_type=urn:ietf:params:oauth:token-type:refresh_token
scope=openid offline_access email <resource scopes>
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

Response:

```json
{
  "access_token": "<ignore>",
  "refresh_token": "<THE SESSION ANCHOR — store this>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:refresh_token",
  "token_type": "N_A"
}
```

Note `requested_token_type` here is **`refresh_token`**, not `id-jag`.
The IdP advertises this in
`identity_chaining_requested_token_types_supported`.

The IdP maps your SAML Audience / SPEntityID to a client ID and requires
that it match the authenticated client — draft-04 § 4.5: *"the IdP
Authorization Server MUST verify that the Audience / SPEntityID maps to
the OAuth Client ID that is authenticated for the token request. This
prevents a client from presenting an assertion issued for a different
SAML SP."*

**Store the `refresh_token`.** The assertion has done its job; discard
it. From here the SAML path is identical to OIDC.

---

## Step 1 — RFC 8693 token exchange (refresh token → ID-JAG)

Identical on both paths.

```
POST https://idp.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<the refresh token from Step 0 or Step 0b>
subject_token_type=urn:ietf:params:oauth:token-type:refresh_token
requested_token_type=urn:ietf:params:oauth:token-type:id-jag
audience=https://auth.resource.xaa.dev
resource=https://api.resource.xaa.dev
scope=<space-separated requested scopes>
client_id=<CLIENT_ID>
client_secret=<CLIENT_SECRET>
```

Response:

```json
{
  "access_token": "<ID-JAG, a signed delegation assertion>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:id-jag",
  "token_type": "N_A",
  "expires_in": 300
}
```

The `access_token` field carries the **ID-JAG**. Treat it as opaque from
the client's perspective; only the resource auth server validates it.

**The refresh token is not consumed by this exchange.** xaa.dev's docs:
*"Not single-use — unlike the ID-JAG, the Refresh Token isn't consumed
by this exchange — reuse it to mint more ID-JAGs until it expires or is
revoked (RFC 8693 § 2.1)."* Whether xaa.dev *rotates* refresh tokens is
`TODO(confirm)` — never addressed in its docs. Write your storage layer
so that replacing the stored token if a response carries a new
`refresh_token` is harmless.

> Common mistake: omitting `audience` or `resource`. Both are required
> by xaa.dev. The IdP encodes them into the ID-JAG so the auth server
> can confirm the delegation target on Step 2.

> You *may* still pass an ID Token here
> (`subject_token_type=urn:ietf:params:oauth:token-type:id_token`) — the
> IdP accepts all three subject types. Don't: the ID Token is good for
> roughly one exchange right after login, so this is the v2 pattern that
> v3 replaces.

### ID-JAG structure

You don't need to parse it, but knowing the shape makes Step 2 failures
legible.

JWT header: **`typ` MUST be `oauth-id-jag+jwt`** (draft-04 § 3.1).

| Claim       | Set to                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| `iss`       | The IdP issuer identifier — `https://idp.xaa.dev`                        |
| `sub`       | The end-user identifier (OIDC path). See `sub_id` below for SAML.         |
| `aud`       | The **resource auth server** issuer identifier                            |
| `client_id` | The client ID **at the resource auth server** — xaa.dev derives this as `{client_id}-at-{resource_id}` |
| `jti`, `exp`, `iat`, `nbf` | Standard JWT claims                                        |
| `sub_id`    | *Optional.* RFC 9493 Subject Identifier. Present on SAML-derived ID-JAGs. |
| `resource`, `scope` | Echo the Step 1 form fields                                       |

`sub_id` on the SAML path uses the **`saml-nameid`** format (draft-04
§ 3.2.1, new in **-04**):

```json
"sub_id": {
  "format": "saml-nameid",
  "issuer": "https://idp.xaa.dev/saml",
  "nameid": "user@example.com",
  "nameid_format": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  "sp_name_qualifier": "<your SP entityID, when SP-scoped>"
}
```

`format`, `issuer`, and `nameid` are required members;
`nameid_format`, `name_qualifier`, `sp_name_qualifier`, and
`sp_provided_id` are optional and *"MUST be included exactly when the
corresponding attribute is present"*.

**Resolving the user at the resource server.** Resolve on `sub_id`;
**do not assume `sub` is present** on a SAML-derived ID-JAG. Draft-04
§ 3.2.2 is normative: the resource auth server *"MUST compare every
member of the SAML NameID Subject Identifier that is part of the set of
identifier fields it uses for subject resolution"* and *"MUST NOT
resolve the subject using only the `nameid` value"* unless local policy
says so. **When the `<NameID>` is SP-scoped, `sp_name_qualifier` is part
of the subject namespace** — two users with the same `nameid` under
different `sp_name_qualifier` values are different users.

> `TODO(confirm)` — draft-04 § 9.5 says `sub` remains REQUIRED and
> `sub_id` is additive (*"When both `sub` and `sub_id` are present, they
> MUST identify the same End-User"*), but xaa.dev's UI copy distinguishes
> *"OIDC ID-JAGs (a plain `sub` claim)"* from *"SAML-derived ID-JAGs
> (carrying a `sub_id`)"*, implying substitution. Verify against a real
> SAML-derived ID-JAG. Coding defensively — resolve on `sub_id`, tolerate
> a missing `sub` — is correct either way.

**Trust order (security-critical).** Draft-04 § 9.5: *"the Resource
Authorization Server **MUST NOT** use the `sub_id.issuer` value to
establish trust in the ID-JAG issuer. The ID-JAG MUST first be validated
using the `iss` claim, signature, audience, expiration, and client
binding."* Then: use a `saml-nameid` `sub_id` **only when the validated
ID-JAG issuer is explicitly associated with `sub_id.issuer`** through
local configuration or trusted federation metadata. On xaa.dev that
association is the per-tenant `saml_id_jag.issuers` list.

---

## Step 2 — RFC 7523 jwt-bearer (ID-JAG → access token)

Identical on both paths.

```
POST https://auth.resource.xaa.dev/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
assertion=<the ID-JAG from Step 1>
scope=<space-separated requested scopes>
client_id=<RESOURCE_CLIENT_ID>
client_secret=<RESOURCE_CLIENT_SECRET>
```

Response:

```json
{
  "access_token": "<resource bearer token>",
  "token_type": "Bearer",
  "expires_in": 7200,
  "scope": "todos.read"
}
```

**No `refresh_token` comes back here, and you should not want one.**
Draft-04 § 4.4.3: *"The Resource Authorization Server SHOULD NOT return
a Refresh Token […] The ID-JAG replaces the use of Refresh Token for the
Resource Authorization Server."* xaa.dev's documented response body has
exactly the four fields above. When the access token expires, mint a new
ID-JAG from your refresh token (Step 1) — don't look for a resource-side
refresh token.

> **Client authentication method.** xaa.dev's docs prescribe
> **`client_secret_post`** (credentials in the form body, as shown) for
> developer-registered clients. Its own demo app sends HTTP Basic
> instead. Both `client_secret_basic` and `client_secret_post` are in
> `token_endpoint_auth_methods_supported`, so both work — the form-body
> form above is the documented contract.

> Note the **client identity changes** between Step 1 and Step 2.
> `RESOURCE_CLIENT_ID/SECRET` is a separately registered pair, and
> xaa.dev derives its ID as `{CLIENT_ID}-at-{resource_id}` (e.g.
> `client_abc-at-todo0`). Don't strip the suffix.

Access token shape, for reference: header `typ: at+jwt` (RFC 9068),
`sub` is `{providerName}:{userSub}`, plus an `app_org` claim.

---

## Step 3 — protected resource fetch

```
GET https://api.resource.xaa.dev${RESOURCE_PATH}     # default RESOURCE_PATH=/api/todos
Authorization: Bearer <access_token from Step 2>
Accept: application/json
```

Todo0 exposes five read endpoints — `/api/todos`,
`/api/todos/completed`, `/api/todos/incomplete`, `/api/todos/stats`,
`/api/todos/:id` — all requiring `todos.read`, all `GET`.

> The protected-resource metadata advertises `todos.write`, but no write
> endpoint exists and the IdP's resource catalog lists only `todos.read`
> for `todo0`. Treat `todos.write` as advertised-but-unbacked; asking for
> it is a good way to exercise `insufficient_scope`.

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

## When to re-mint vs re-authenticate

The whole decision rule, and it is two lines:

```
Need an access token   → refresh token → ID-JAG → access token   (Steps 1+2)
Refresh token rejected → re-authenticate from Step 0
```

"Refresh token rejected" means Step 1 returns `invalid_grant` — expired,
revoked, or invalidated. There is no third case and nothing to retry: a
rejected refresh token cannot be repaired, so send the user back through
login. On the SAML path that means Step 0 **and** Step 0b again.

This is also what xaa.dev's own docs prescribe. Its Step 2 error table,
verbatim: *"`invalid_grant` — Subject token is expired, invalid, or has
been revoked → Re-authenticate in Step 1 to get a fresh subject token."*

Because there is **no revocation endpoint** on xaa.dev, you cannot
proactively revoke a refresh token from your app. Logout destroys your
local session only; the refresh token remains valid upstream until it
expires. `end_session_endpoint` may or may not invalidate it —
`TODO(confirm)`, and not something to rely on. Treat all of this as a
reason to take the storage guidance in `01-project-skeleton.md`
seriously, not as a reason to skip logout.

---

## Invariants you must not break

1. **PKCE S256 only** — never `plain`. *(OIDC path only.)*
2. **State + nonce verification** — both required, both server-side
   compared. *(OIDC path only. The SAML equivalent is `RelayState` +
   `InResponseTo` + audience restriction.)*
3. **The refresh token is the session anchor, and it never reaches the
   browser** — server-side session only. Same for the ID Token and the
   SAML assertion.
4. **Two distinct client credentials** — IdP client (Steps 0, 0b, 1) ≠
   resource client (Step 2). Mixing them up is the most common cause of
   opaque `invalid_client` failures.
5. **`offline_access` on Step 0** — without it there is no refresh token
   and therefore no session past ~10 minutes.
6. **Audience and resource on Step 1** — required form fields.
7. **Re-mint per call** — do not persist the resource access token or the
   ID-JAG. The refresh token in the session is the canonical state;
   re-run Steps 1 and 2 on each protected call. The ID-JAG lives 5 min
   and xaa.dev says it may be single-use, so re-minting is the safe
   default rather than merely a tidy one.
8. **Redact in logs** — see `error-mapping.md` § Token redaction. The
   `refresh_token` key already matches the redaction regex; confirm it
   does in your implementation.
