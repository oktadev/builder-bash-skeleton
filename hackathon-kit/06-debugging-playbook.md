# 06 — Debugging playbook

These are the failure shapes every XAA implementation hits. Each entry
gives the symptom, the probable root cause, and a diagnostic prompt you
can paste back into your AI assistant.

**Path applicability** is marked on each entry. Entries with no marker
apply to both.

| Entry     | Applies to | Topic                                    |
| --------- | ---------- | ---------------------------------------- |
| D-1       | OIDC       | `redirect_uri` mismatch                  |
| D-2       | both       | `invalid_client`                         |
| D-3       | both       | `unsupported_grant_type`                 |
| D-4       | both       | `invalid_grant` on Step 1                |
| D-5       | both       | Step 2 rejects the ID-JAG                |
| D-6       | **OIDC**   | `nonce` missing / mismatched             |
| D-7       | **OIDC**   | PKCE base64url padding                   |
| D-8       | both       | Session cookie missing on return         |
| D-9       | both       | Log buffer empties on reload             |
| D-10      | both       | Discriminated-union narrowing            |
| D-11      | both       | Config validates at import               |
| D-12      | **OIDC**   | ID Token signature verification          |
| D-13      | both       | Callback never returns                   |
| **D-14**  | **SAML**   | Assertion extraction / encoding          |
| **D-15**  | **SAML**   | `sub_id` subject resolution              |
| **D-16**  | **SAML**   | Tenant has SAML disabled                 |
| **D-17**  | both       | No refresh token issued                  |
| **D-18**  | both       | ID-JAG clock skew                        |
| **D-19**  | both       | Re-auth loop / retry storm               |
| **D-20**  | **MCP**    | MCP server 401s a token Step 2 accepted  |
| **D-21**  | **MCP**    | `406`, or a hand-rolled JSON-RPC call    |
| **D-22**  | **MCP**    | `initialize` fails / version mismatch    |
| **D-23**  | **MCP**    | The SDK starts its own OAuth flow        |

D-1 through D-19 are unaffected by `APP_TYPE`. D-20+ apply only when
`APP_TYPE=mcp`.

---

## D-1 — `redirect_uri does not match registered URI`

> **OIDC path only.** The SAML analogue is a silent ACS mismatch — see
> D-14's Symptom note.

### Symptom

The IdP returns the user to `/login?error=redirect_uri_mismatch` (or
similar). Browser DevTools network tab shows the IdP's authorize page
returning a 400.

### Root cause

`REDIRECT_URI` in `.env.local` is not byte-exact with the value
registered at xaa.dev. Common drift points:

- `http` vs `https`.
- `localhost` vs `127.0.0.1` vs `0.0.0.0`.
- Trailing slash.
- Path: the kit uses `/api/auth/callback`; the reference Express app
  used `/auth/callback`. Whichever you pick, register *that* one.
- Port mismatch (3000 vs 3001 vs whatever your dev server bound to).

### Debugging prompt

> Print the assembled authorize URL at startup and visually compare its
> `redirect_uri` query param to what's registered at xaa.dev. Pick one
> source of truth (the registration page) and conform `.env.local` to
> it.

---

## D-2 — `invalid_client` on Step 1 or Step 2

### Symptom

```
{"error":"invalid_client","error_description":"client authentication failed"}
```

### Root cause

Two possibilities, both about the *which* of two client pairs:

1. You sent `RESOURCE_CLIENT_ID/SECRET` to the IdP `/token`, or
   `CLIENT_ID/SECRET` to the auth server `/token`. The pairs are
   *not* interchangeable.
2. Authentication method mismatch (HTTP Basic vs form params). Most
   xaa.dev clients accept Basic; some require `client_secret_post`.
   Discovery's `token_endpoint_auth_methods_supported` tells you.

### Debugging prompt

> Print the authentication mode and client ID being used for each
> token endpoint. Confirm Step 1 uses `CLIENT_ID/CLIENT_SECRET` and
> Step 2 uses `RESOURCE_CLIENT_ID/RESOURCE_CLIENT_SECRET`. Adjust the
> auth method to whatever the discovery doc lists first.

---

## D-3 — `unsupported_grant_type`

### Symptom

```
{"error":"unsupported_grant_type"}
```

### Root cause

URN spelling. Almost always one of:

- `urn:ietf:params:oauth:grant-type:token-exchange` (Step 1) — note
  hyphen between `token` and `exchange`.
- `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2) — note hyphen
  between `jwt` and `bearer`.

It is **not** `jwt_bearer`, **not** `urn:ietf:params:oauth:grant_type:jwt-bearer`
(grant**_**type), **not** `token_exchange`.

### Debugging prompt

> Log the exact form-encoded body you POST to the token endpoint, then
> diff it against `reference/xaa-spec.md` § Step 1 and § Step 2. The
> URNs are case-sensitive and hyphenated.

---

## D-4 — `invalid_grant` on Step 1

### Symptom

Step 1 returns `{"error":"invalid_grant", "error_description":"…"}`.

### Root cause

Your `subject_token` was rejected. Which token that is depends on what
you sent:

1. **You sent the refresh token (v3, correct).** It has expired, been
   revoked, or been invalidated. Its lifetime is undocumented by
   xaa.dev — `TODO(confirm)` — so you cannot predict this. **This is a
   re-authenticate, not a retry.**
2. **You sent the ID Token (v2 pattern).** Almost certainly just
   expired: the ID Token lives **~10 minutes** on xaa.dev and its docs
   describe it as *"only good for one exchange right after login."* If
   your app works immediately after login and fails a few minutes later,
   this is your bug. Switch to the refresh token.

### Resolution

Map to `expired_token` with `upstream_step: "step1"` and
`requiresReauth: true`, and send the user to `/login`. Do **not** retry
— see D-19.

### Debugging prompt

> Step 1 returns `invalid_grant`. First confirm which `subject_token_type`
> I'm sending: it should be
> `urn:ietf:params:oauth:token-type:refresh_token`, not `…:id_token`. If
> it's already the refresh token, map this to `expired_token` with
> `upstream_step: "step1"` and `requiresReauth: true`, and surface a
> sign-in prompt — not a retry button — per
> `reference/error-mapping.md` § The two faces of `expired_token`.

---

## D-5 — Step 1 succeeds but Step 2 fails with `invalid_grant`

### Symptom

ID-JAG arrives, but the auth-server rejects it as
`{"error":"invalid_grant", "error_description":"audience mismatch"}` (or
similar).

### Root cause

The `audience` and/or `resource` form fields on Step 1 didn't match
what the auth server expects. The IdP encodes both into the ID-JAG; the
auth server checks them.

### Debugging prompt

> The auth server rejects my ID-JAG with audience/resource mismatch.
> Confirm `audience=https://auth.resource.xaa.dev` and
> `resource=https://api.resource.xaa.dev` (or your BYOR resource URL)
> on Step 1 are the exact strings the auth server is configured with —
> no trailing slash drift, no scheme drift. The resource registration
> at xaa.dev is canonical.

---

## D-6 — `nonce` missing or mismatched on callback

> **OIDC path only.** The SAML analogue is `InResponseTo` — verify it
> against the `<AuthnRequest>` ID you stored. See D-14.

### Symptom

Callback throws on `nonce` validation.

### Root cause

Either (a) the authorize URL was built without a `nonce` parameter, or
(b) the session-stored nonce wasn't compared to the ID Token's `nonce`
claim.

### Debugging prompt

> Add an explicit `nonce` parameter to the authorize URL builder and a
> verification step on callback that compares the session's stored
> nonce to `id_token.nonce`. Reject the callback if they differ.

---

## D-7 — PKCE base64url padding

> **OIDC path only.** SAML has no PKCE — but it has its *own* base64url
> padding trap on the Step 0b subject token. See D-14.

### Symptom

`code_verifier` is rejected by the IdP at the auth-code → tokens step,
even though discovery and authorize succeeded.

### Root cause

The `code_challenge` includes `=` padding. RFC 7636 requires
**unpadded** base64url.

### Debugging prompt

> My PKCE verifier is rejected. Strip `=` padding from
> `base64url(SHA-256(verifier))` before sending as the
> `code_challenge`. Most language stdlibs have an "url-safe, no
> padding" base64 helper (`base64.urlsafe_b64encode().rstrip(b"=")` in
> Python; `base64url` in Node 16+; `base64.RawURLEncoding` in Go).

---

## D-8 — Session cookie not present on the return leg

### Symptom

The callback (OIDC) or ACS (SAML) can't find the login transaction in
the session — looks like a fresh visit.

### Root cause

**On the OIDC path:** cookie `SameSite` is `Strict`, blocking the cookie
on the cross-site return from the IdP. Or `secure: true` over HTTP
localhost in some browsers.

**On the SAML path this is a different, harder problem.** The ACS return
is a cross-site **POST**, and `SameSite=Lax` does *not* send cookies on
cross-site POST — only on top-level GET navigations. So the OIDC fix
does not work here: a correctly-configured `Lax` cookie will still be
withheld.

### Resolution

OIDC: `SameSite=Lax`, `secure: false` for local HTTP dev.

SAML — pick one, in this order of preference:

1. **Carry the session id in `RelayState`** and look the transaction up
   server-side. `RelayState` round-trips through the IdP by design and
   doesn't depend on cookies at all. This is the robust answer.
2. **A separate transaction-only cookie** with `SameSite=None; Secure`,
   holding nothing but the transaction id. Requires HTTPS locally.

**Do not** weaken your main session cookie to `SameSite=None` to fix
this. The session cookie carries the refresh token's container; keep it
`Lax`.

### Debugging prompt

> My login transaction is missing when the IdP returns. I'm on the
> <OIDC|SAML> path. If SAML: remember `SameSite=Lax` cookies are not
> sent on cross-site POST, which is how the ACS is reached — move the
> transaction lookup to a session id carried in `RelayState` instead of
> relying on the cookie. Don't downgrade the main session cookie to
> `SameSite=None`.

---

## D-9 — In-memory log buffer empties on every reload

### Symptom

Every dev hot-reload wipes the observability buffer.

### Root cause

The buffer lives in module-level state. Hot-reload re-imports the
module and resets it.

### Resolution

Two options:

1. Accept it. The buffer is a dev/playground convenience; persistence
   isn't a goal.
2. Lift the buffer to a process-singleton storage (Redis / sqlite /
   file) — only worth it if you want logs across reloads.

---

## D-10 — Discriminated-union narrowing fails (typed languages)

### Symptom

Your type checker says `error` doesn't exist on `CallResult |
ApiError` even though you're inside an `if (!result.ok)` branch.

### Root cause

You declared `ok: boolean` instead of `ok: true` (success arm) and
`ok: false` (error arm). Without literal types the union doesn't
narrow.

### Resolution

Use literals: `ok: true` on success, `ok: false` on error. Example for
TypeScript:

```ts
type ApiResponse<T> = { ok: true; ... } | { ok: false; error: ErrorCode; ... };
```

Equivalent patterns: Rust `Result<T, E>`, Kotlin sealed classes, F#
discriminated unions, Python `Literal[True]/Literal[False]` with
`mypy --strict`.

---

## D-11 — Tests load environment lazily but config validates at import

### Symptom

`pytest` / `vitest` / etc. fails to import any module that touches
config because the config module asserts env vars at import time, before
the test setup has populated them.

### Resolution

Wrap config validation in a function called on first use:

```
def load_config():    # not module-top-level
    ...validate and return...
```

Tests then populate env vars in their setup hook before any code calls
`load_config()`.

---

## D-12 — ID Token signature verification fails

> **OIDC path only.** The SAML analogue is XML-DSIG verification against
> the IdP metadata certificate — a different mechanism with different
> failure modes. See D-14.

### Symptom

Your OIDC library raises something like `JWSInvalidSignature`,
`UnknownKid`, or `JWTSignatureError` during the auth-code → tokens
exchange or on a later re-validation.

### Root cause

Three usual suspects:

1. **JWKS not fetched.** Your library expects you to provide a
   `jwks_uri` (or call `get_jwks()` once) before verifying. Some
   libraries auto-fetch from discovery; others don't.
2. **Cached JWKS is stale.** xaa.dev rotated keys, your cache still
   has the old `kid`.
3. **Wrong issuer.** You're verifying with one IdP's keys but the
   token was issued by another (e.g. a stale `IDP_URL` mock leaked
   into the test/prod path).

### Debugging prompt

> My ID Token fails signature verification. Confirm the OIDC client is
> using `jwks_uri` from the discovery document at
> `https://idp.xaa.dev/.well-known/openid-configuration`. If the
> failing token's `kid` header isn't in the cached JWKS, refetch
> `jwks_uri` and retry the verification once before failing.

---

## D-13 — Callback never returns / browser shows blank page

### Symptom

You click "Sign in", land on the xaa.dev consent screen, approve, and
the browser hangs at the redirect — no `/dashboard`, no `/login?error=`,
nothing in the server log.

### Root cause

Three usual suspects:

1. **Cookie blocked on cross-site return.** Browser is set to block
   third-party cookies, or your `SameSite=Strict` cookie didn't
   survive the IdP redirect. See D-8.
2. **Callback route crashed before responding.** Look at the server
   log; an uncaught exception in state/nonce verification can leave
   the request hanging if your stack doesn't have a default error
   handler.
3. **Redirect URI doesn't actually exist on your server.** You
   registered `/api/auth/callback` but your route is at
   `/auth/callback`. The IdP's redirect lands on a 404.

### Debugging prompt

> The OIDC callback never completes. Check (a) the server log for an
> uncaught exception in the callback handler, (b) the Network tab in
> DevTools — does the redirect from xaa.dev hit your server at all,
> and what does it return? (c) Confirm the registered redirect URI
> matches a route that actually exists in your app.

---

## D-14 — SAML assertion rejected at Step 0b

> **SAML path only.**

### Symptom

Step 0b returns `invalid_grant`, `invalid_request`, or a parse error. Or —
more common — **nothing arrives at your ACS at all** and the browser sits
on the IdP. In that case your registered ACS URL doesn't match
`SAML_ACS_URL`: unlike OIDC's explicit `redirect_uri_mismatch` (D-1), a
wrong ACS fails silently. Check byte-exactness first.

### Root cause

Five candidates, in the order they bite:

1. **You sent the whole `SAMLResponse`.** The `subject_token` is the bare
   `<saml:Assertion>` element.
2. **Standard base64, padded.** RFC 8693 § 3 requires **base64url
   unpadded**. In a form body `+` decodes to a space, so you may see a
   parse error rather than a clean rejection. (Draft-04 § 4.5's own
   example is padded standard base64 — not form-safe. Follow RFC 8693.)
3. **You re-serialised the XML and broke the signature.** XML-DSIG covers
   exact bytes. Parse to *verify*, but send the *original* bytes.
4. **SAML Audience doesn't map to your `CLIENT_ID`.** Draft-04 § 4.5
   requires the IdP to verify the Audience / SPEntityID maps to the
   authenticated client, so an SP belonging to a different client fails
   here rather than at SSO.
5. **`offline_access` missing from the Step 0b scope.** Yields a 200 with
   no `refresh_token` rather than an error. See D-17.

### Debugging prompt

> My SAML assertion is rejected at Step 0b. Verify in order: (a) I send
> the bare `<saml:Assertion>`, not the whole `SAMLResponse`; (b) it's
> base64url with no `=` padding; (c) I send original bytes rather than
> re-serialising after parsing; (d) the `AudienceRestriction` corresponds
> to the `CLIENT_ID` I authenticate with; (e) `scope` includes
> `offline_access`. Print the first 80 chars of my `subject_token` and
> confirm no `+`, `/`, or `=`.

---

## D-15 — Step 2 rejects a SAML-derived ID-JAG on the subject

> **SAML path only.**

### Symptom

Step 1 succeeds and returns an ID-JAG. Step 2 returns `invalid_grant`,
mentioning subject, NameID, or `sub_id` — or nothing useful.

### Root cause

Draft-04 § 3.2.2 specifies `invalid_grant` for *every* `sub_id` resolution
failure, so several distinct problems look identical: no `sub_id` in the
`saml-nameid` format; a malformed or unsupported format; **the SAML issuer
not associated with the validated ID-JAG issuer** for your tenant (§ 9.5 —
on xaa.dev that's the per-tenant `saml_id_jag.issuers` allow-list, see
D-16); or subject resolution keyed on the wrong members. On that last
point § 3.2.2 is normative: compare **every** member you key on, never
resolve on `nameid` alone, and treat `sp_name_qualifier` as part of the
subject namespace when the NameID is SP-scoped.

### Debugging prompt

> Step 2 rejects my SAML-derived ID-JAG. Decode the payload and show me
> the `sub_id` object — confirm `format` is `saml-nameid` and `issuer` +
> `nameid` are present. Then check whether the resource auth server's
> tenant associates my `sub_id.issuer` with the ID-JAG's `iss`. If not,
> that's a registration problem, not a code problem.

---

## D-16 — Resource tenant has SAML ID-JAG disabled

> **SAML path only.**

### Symptom

Everything through Step 1 is clean, the ID-JAG carries a well-formed
`sub_id`, and Step 2 rejects it anyway — consistently, with
`invalid_grant`.

### Root cause

The resource auth server gates SAML-derived ID-JAGs **per tenant**, via a
`saml_id_jag` config with an `enabled` flag and an allow-list of SAML
issuers. If yours is disabled, no client-side fix helps — the ID-JAG is
correct and still refused. On xaa.dev, `customer1` has it enabled for
issuer `https://idp.xaa.dev/saml`; `customer2` and `customer3` don't.

### Resolution

Confirm your tenant's config and that its allow-list contains the
`sub_id.issuer` your assertions carry. On a BYOR resource that's yours to
set; on a built-in tenant, use one with SAML enabled.

**This is the one SAML failure that isn't a bug in your app.** Recognising
it quickly saves hours.

---

## D-17 — No refresh token was issued

### Symptom

Login "succeeds" and the dashboard renders. Minutes later every
`/api/call` fails with `invalid_grant` on Step 1 — or
`/api/auth/session` reports no refresh token at all.

### Root cause

The IdP never returned one and nothing caught it:

1. **`offline_access` missing** from the OIDC authorize scope, or the
   Step 0b scope. Overwhelmingly the likely cause.
2. **The scope was silently dropped** by a library filtering against a
   hardcoded list. Verify the assembled URL, not the config object.
3. **Consent wasn't prompted.** xaa.dev's demo sends `prompt=consent`;
   whether it's required is `TODO(confirm)`.
4. **You stored the wrong field.** The response carries both
   `access_token` (the IdP's, unused by this kit) and `refresh_token`.

### Resolution

Assert the refresh token's presence **at login** and fail loudly naming
`offline_access`. Catching it at the source costs three lines; catching it
ten minutes later costs an afternoon.

### Debugging prompt

> My session has no refresh token. Print the exact `scope` my authorize
> URL (or Step 0b request) sends and confirm it contains `offline_access`.
> Confirm I store the response's `refresh_token`, not its `access_token`.
> Add a login-time assertion that fails naming `offline_access`.

---

## D-18 — ID-JAG rejected for clock skew

### Symptom

Step 2 returns `invalid_grant` mentioning `iat`, clock, or skew.
Intermittent — or suddenly constant after a laptop sleep/resume or a
container start.

### Root cause

xaa.dev tolerates **30 seconds** of skew on the ID-JAG's `iat`. Your
system clock has drifted, and the ID-JAG's 5-minute life leaves little
margin.

### Resolution

Fix the clock, not the code. The ID-JAG is minted with the IdP's `iat`;
your machine's disagreement about "now" is the entire problem.

```bash
sudo sntp -sS time.apple.com                  # macOS
timedatectl status                            # Linux — then restart systemd-timesyncd
# Docker inherits the host clock; be suspicious after a VM suspend.
```

### Debugging prompt

> Step 2 rejects my ID-JAG with a clock/`iat` complaint. Decode the
> payload, print `iat` and `exp`, compare against system time. If the
> delta exceeds 30 s, tell me to fix my clock rather than change code.

---

## D-19 — Re-auth loop or retry storm

### Symptom

The user bounces between `/dashboard` and `/login` endlessly; or Step 1 is
called dozens of times in seconds; or a "retry" button never succeeds no
matter how often it's clicked.

### Root cause

`expired_token` was treated as one state when it is two.

- **Retrying a dead refresh token.** Step 1's `invalid_grant` can't be
  repaired — expired, revoked, and invalidated are indistinguishable and
  none are retryable. A retry loop here is infinite by construction.
- **Unbounded re-mint on Step 3 expiry.** If a fresh access token is
  *also* rejected as expired, that's usually D-18, and recursion without a
  counter turns it into a storm.
- **Offering "retry" when `requiresReauth` is set** — a button that cannot
  ever work.

### Resolution

Branch on `details.upstream_step`, per `reference/error-mapping.md` § The
two faces of `expired_token`:

```
step3 + expired        → re-mint, retry EXACTLY ONCE (counter, not recursion)
step1 + invalid_grant  → requiresReauth: true; sign-in only, never retry
```

### Debugging prompt

> I have a re-auth loop / retry storm. Show me where I branch on
> `expired_token`. It must distinguish `upstream_step === "step3"`
> (re-mint, retry once, counter-bounded) from `"step1"` (refresh token
> dead — set `requiresReauth`, offer sign-in, never retry).

---
## D-20 — MCP server 401s a token that Step 2 happily issued

> **`APP_TYPE=mcp` only.** The single most likely MCP failure.

### Symptom

Steps 1 and 2 succeed — you hold an access token. The MCP server then
returns:

```
HTTP 401
www-authenticate: Bearer resource_metadata="https://mcp.xaa.dev/.well-known/oauth-protected-resource/mcp"
{"jsonrpc":"2.0","error":{"code":-32000,"message":"Unauthorized: Invalid or expired access token"},"id":null}
```

The asymmetry is the diagnostic: **minted fine, rejected at use.**

### Root cause

Three candidates, most likely first:

1. **`mcp.access` missing from Step 1's `scope`.** MCP mode needs
   `todos.read` **and** `mcp.access`. A token with only `todos.read` mints
   cleanly and is refused here.
2. **Wrong `aud` — the Step 1 `resource` value.** This is the kit's open
   `TODO(confirm)`: xaa.dev's docs say *"the MCP URL is not the audience —
   the resource URL is"*, but `todo0-mcp`'s registered
   `resource_server_url` is `https://mcp.xaa.dev/mcp`. If scope is right
   and it still 401s, flip `RESOURCE_URL` between
   `https://api.resource.xaa.dev` and `https://mcp.xaa.dev/mcp` and retry.
3. **Genuine expiry.** Access tokens live ~2 h. If it worked an hour ago
   and not now, re-mint (Steps 1+2) before assuming misconfiguration.

### Debugging prompt

> The MCP server rejects a token Step 2 issued. Decode the access token
> payload and print `aud` and `scope`. Confirm `scope` contains both
> `todos.read` and `mcp.access`. Then compare `aud` against both
> `https://api.resource.xaa.dev` and `https://mcp.xaa.dev/mcp` and tell me
> which one Step 1's `resource` produced — that's the `TODO(confirm)` in
> `reference/xaa-spec.md` § Step 1.

---

## D-21 — `406`, or a JSON-RPC error that shouldn't happen

> **`APP_TYPE=mcp` only.**

### Symptom

Either an HTTP `406` with no useful body, or a JSON-RPC error in the
`-32600` / `-32700` / `-32602` family.

### Root cause

- **`406`** — the request omitted
  `Accept: application/json, text/event-stream`. The server requires both
  media types.
- **`-32700` parse / `-32600` invalid request** — malformed JSON-RPC.
- **`-32602` invalid params** — usually a bad resource `uri`. Note the
  kit's open `TODO(confirm)`: docs say `todo0://todos`, the IdP catalog
  says `todo://todos`.
- **`-32601` method not found** — you called something this server
  doesn't implement. `todo0-mcp` is **resources-only**: `tools/list` and
  `tools/call` are the usual culprits.

**If you are seeing `406` or a framing error at all, that is itself the
finding:** the official SDK sets the `Accept` header and frames JSON-RPC
correctly. Getting these means you're constructing requests by hand
somewhere — which is the boundary violation, not just a bug.

### Debugging prompt

> I'm getting <406 | a JSON-RPC framing error> from the MCP server. Show
> me every place my code builds an MCP request. All of it should go
> through the official SDK's client — if I'm calling `fetch` against
> `MCP_SERVER_URL` directly, replace it with the SDK. Then confirm I'm
> calling `resources/*`, not `tools/*`, since `todo0-mcp` exposes no
> tools.

---

## D-22 — `initialize` fails or negotiates the wrong version

> **`APP_TYPE=mcp` only.**

### Symptom

The client connects but `initialize` errors, or the session behaves oddly
afterwards — methods missing, capabilities absent.

### Root cause

Protocol-version mismatch. The xaa.dev playground speaks **`2025-03-26`**
and hardcodes it. An SDK defaulting to a newer revision may fail
negotiation or negotiate down into a shape you didn't expect.

### Resolution

Pin `MCP_PROTOCOL_VERSION=2025-03-26` and pass it explicitly rather than
relying on the SDK default. Then log the version the server actually
returned in `InitializeResult` — negotiate, but assert the outcome.

### Debugging prompt

> `initialize` against the MCP server is failing or negotiating an
> unexpected protocol version. Pin the client to `2025-03-26` from
> `MCP_PROTOCOL_VERSION`, then log the version and capabilities returned
> in `InitializeResult` so I can see what was actually agreed.

---

## D-23 — The SDK starts its own OAuth flow

> **`APP_TYPE=mcp` only. This is an architecture bug, not a config bug.**

### Symptom

Any of:

- Logs show a request to `/.well-known/oauth-protected-resource` or
  `/.well-known/oauth-authorization-server` that your code never made.
- A Dynamic Client Registration `POST` to a `/reg` endpoint.
- A redirect-to-authorization attempt, or an `UnauthorizedError` thrown
  from the transport on 401.
- A connection failure naming `http://authorization-server:5001`.

That last one is unmistakeable: it's an **unroutable internal Docker
hostname** leaked by `mcp.xaa.dev`'s own authorization-server metadata.
You only ever reach it by following the discovery chain — which means the
SDK is trying to acquire a token.

### Root cause

MCP's built-in authorization (RFC 9728 discovery → DCR → auth-code +
PKCE) is a **competing** token-acquisition path to XAA. In this kit the
token already exists before the client connects, so you supply it through
the SDK's `authProvider` seam and leave the acquisition members
unimplemented. The SDK reaches for its own OAuth only from a 401 handler —
so if you're seeing discovery traffic, either a 401 occurred (fix that,
see D-20) or the provider was wired to permit acquisition. Letting it run
also registers a third client identity alongside `CLIENT_*` and
`RESOURCE_CLIENT_*`.

### Resolution

Supply the XAA-minted access token to the transport, and make sure no
code path lets the SDK go looking for one. See
`04-protected-resource-call.md` § MCP client for the mechanism in your
SDK.

On a 401 the correct behaviour is to surface it via the kit's error
mapping (D-20) — **not** to hand control to the SDK's OAuth. A 401 here
means the token was rejected, and acquiring a different token via a
different flow would paper over a real misconfiguration.

### Debugging prompt

> My MCP client is attempting its own OAuth — I can see
> <discovery request | DCR POST | redirect | authorization-server:5001>
> in the logs. The access token is already minted by the XAA flow before
> the client connects. Show me how the token reaches the transport, and
> remove or disable whatever lets the SDK attempt its own acquisition. A
> 401 should surface through the kit's error mapping, not trigger an OAuth
> flow.

---

## Generic diagnostic recipes

### Check what the servers actually advertise

Cheapest first move when something structural seems wrong:

```bash
# Does the IdP accept the subject token type I'm sending?
curl -sS https://idp.xaa.dev/.well-known/openid-configuration \
  | tr ',' '\n' | grep -i 'token_exchange_subject_token_types\|identity_chaining\|offline_access'

# Is the id-jag grant profile advertised? (Note the URL — see below.)
curl -sS https://auth.resource.xaa.dev/.well-known/oauth-authorization-server \
  | tr ',' '\n' | grep -i 'grant_profiles\|jwt-bearer'
```

> **Gotcha:** `https://auth.resource.xaa.dev/.well-known/openid-configuration`
> also returns 200 and is byte-identical *except* that it omits
> `authorization_grant_profiles_supported`. If your library defaults to
> `openid-configuration`, it never sees the grant profile. Use
> `oauth-authorization-server`.
>
> And `https://idp.xaa.dev/.well-known/oauth-authorization-server`
> returns **404** — the IdP publishes OIDC discovery only.

### Reproduce on the wire with curl

Export a real `REFRESH_TOKEN` from your session store first.

```bash
# Step 0b — SAML path only: assertion → refresh token
# ASSERTION_FILE holds the bare <saml:Assertion> element, exact bytes.
SUBJECT_TOKEN=$(base64 < "${ASSERTION_FILE}" | tr -d '\n' | tr '+/' '-_' | tr -d '=')
curl -sS \
     -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
     -d "subject_token=${SUBJECT_TOKEN}" \
     -d "subject_token_type=urn:ietf:params:oauth:token-type:saml2" \
     -d "requested_token_type=urn:ietf:params:oauth:token-type:refresh_token" \
     -d "scope=openid offline_access email ${RESOURCE_SCOPES}" \
     -d "client_id=${CLIENT_ID}" \
     -d "client_secret=${CLIENT_SECRET}" \
     "https://idp.xaa.dev/token"

# Step 1 — refresh token → ID-JAG (both paths)
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

# Step 3
curl -sS -i -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     "https://api.resource.xaa.dev${RESOURCE_PATH}"
```

### Decode a token without verifying it

Useful for D-15 and D-18. This only base64url-decodes — signature
verification is the auth server's job.

```bash
jwt_part() { echo "$1" | cut -d. -f"$2" | tr '_-' '/+' \
  | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null; echo; }

jwt_part "${ID_JAG}" 1     # header  — typ MUST be oauth-id-jag+jwt
jwt_part "${ID_JAG}" 2     # payload — iss, aud, client_id, exp, iat, sub or sub_id
```

If curl works and your code doesn't, the bug is in your client. If
curl fails too, the bug is in your registration / env / spec
understanding — not your code. And if curl fails only on the SAML path
while OIDC is fine, suspect D-16 before suspecting yourself.
