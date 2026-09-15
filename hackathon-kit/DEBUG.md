# DEBUG — 23 failure shapes

Match your symptom, apply the fix. `D-1`…`D-19` are unaffected by `APP_TYPE`;
`D-20`+ apply only when `APP_TYPE=mcp`. If nothing matches, the curl recipes
at the bottom isolate a client bug from a server/registration bug. After ~5
failed attempts on one issue, stop and report.

## Registration and config

| # | Path | Symptom | Cause → fix |
| --- | --- | --- | --- |
| D-1 | OIDC | `redirect_uri does not match registered URI`; authorize page 400s | `REDIRECT_URI` isn't byte-exact with what's registered. Drift points: `http`/`https`, `localhost`/`127.0.0.1`, trailing slash, path, port. Treat the registration page as canonical and conform `.env.local` to it. |
| D-2 | both | `{"error":"invalid_client","error_description":"client authentication failed"}` | Either you crossed the two client pairs — Step 1 needs `CLIENT_*`, Step 2 needs `RESOURCE_CLIENT_*` — or the auth method is wrong. Print which client ID and auth mode each token endpoint gets. Don't strip the `-at-{resource}` suffix. |
| D-3 | both | `{"error":"unsupported_grant_type"}` | URN spelling. It is **not** `jwt_bearer`, not `grant_type` (underscore) inside the URN, not `token_exchange`. Copy from SPEC § URN strings; don't retype. |
| D-11 | both | Tests can't import any config-touching module | Config validates at import time, before the test hook populates env. Wrap validation in a function called on first use. |
| D-9 | both | Log buffer empties on every hot-reload | Buffer lives in module state and gets re-imported. Accept it (it's a dev convenience) or lift it to a process singleton. |
| D-10 | both | Type checker says `error` doesn't exist inside `if (!result.ok)` | You declared `ok: boolean` instead of the literals `ok: true` / `ok: false`. Without literal types the union won't narrow. Equivalents: Rust `Result`, Kotlin sealed classes, Python `Literal[True]` under `mypy --strict`. |

## OIDC login

| # | Path | Symptom | Cause → fix |
| --- | --- | --- | --- |
| D-6 | OIDC | Callback throws on `nonce` validation | Either the authorize URL was built without `nonce`, or the session nonce was never compared to the ID Token's claim. Add both explicitly. *(SAML analogue: `InResponseTo`.)* |
| D-7 | OIDC | `code_verifier` rejected, though authorize succeeded | `code_challenge` includes `=` padding; RFC 7636 needs **unpadded** base64url. Use `base64.urlsafe_b64encode().rstrip(b"=")`, Node `base64url`, Go `base64.RawURLEncoding`. |
| D-12 | OIDC | `JWSInvalidSignature` / `UnknownKid` on the ID Token | JWKS never fetched, cached JWKS stale after key rotation, or you're verifying against the wrong issuer. Use `jwks_uri` from discovery; on an unknown `kid`, refetch once before failing. |
| D-13 | OIDC | Approve consent, then the browser hangs — no `/dashboard`, nothing in the log | Three suspects: the cookie was blocked on the cross-site return (see D-8); the callback handler crashed before responding (check the server log); or the registered redirect URI points at a route that doesn't exist (404). |
| D-8 | both | Callback/ACS can't find the login transaction — looks like a fresh visit | **OIDC:** cookie is `SameSite=Strict`, or `secure: true` over local HTTP → use `Lax` + `secure: false` in dev. **SAML is harder:** the ACS return is a cross-site **POST**, and `Lax` cookies aren't sent on those, so the OIDC fix doesn't apply. Carry the session id in `RelayState` and look it up server-side (robust), or use a transaction-only `SameSite=None; Secure` cookie. **Never downgrade the main session cookie to `None`** — it holds the refresh token. |

## SAML

| # | Path | Symptom | Cause → fix |
| --- | --- | --- | --- |
| D-14 | SAML | Step 0b returns `invalid_grant` / `invalid_request` / a parse error — **or nothing arrives at your ACS at all** | If nothing arrives: your registered ACS URL doesn't match `SAML_ACS_URL`, and unlike D-1 this fails **silently**. Check byte-exactness first. Otherwise, in the order they bite: (1) you sent the whole `SAMLResponse` instead of the bare `<saml:Assertion>`; (2) standard padded base64 instead of base64url-unpadded — in a form body `+` becomes a space, so you get a parse error not a clean rejection; (3) you re-serialised the XML and broke the signature — parse to verify, send original bytes; (4) the SAML Audience doesn't map to your `CLIENT_ID` (draft-04 § 4.5), which fails here rather than at SSO; (5) `offline_access` missing from the Step 0b scope → 200 with no refresh token, see D-17. Print the first 80 chars of `subject_token` and confirm no `+`, `/`, or `=`. |
| D-15 | SAML | Step 1 fine; Step 2 `invalid_grant` mentioning subject / NameID / `sub_id` — or nothing useful | Draft-04 § 3.2.2 returns `invalid_grant` for *every* `sub_id` resolution failure, so distinct problems look identical: no `sub_id` in `saml-nameid` format; malformed/unsupported format; the SAML issuer not associated with the ID-JAG issuer for your tenant (→ D-16); or you keyed resolution on the wrong members. Compare **every** member you key on, never resolve on `nameid` alone, and treat `sp_name_qualifier` as part of the namespace when the NameID is SP-scoped. |
| D-16 | SAML | Everything through Step 1 is clean, `sub_id` is well-formed, Step 2 refuses it **consistently** | The resource auth server gates SAML-derived ID-JAGs **per tenant** via a `saml_id_jag` config (an `enabled` flag plus an allow-list of SAML issuers). No client-side fix helps. On xaa.dev, **`customer1` has it enabled for issuer `https://idp.xaa.dev/saml`; `customer2` and `customer3` do not.** **This is the one SAML failure that isn't a bug in your app** — recognising it fast saves hours. |

## Refresh token, retries, clocks

| # | Path | Symptom | Cause → fix |
| --- | --- | --- | --- |
| D-17 | both | Login "succeeds", dashboard renders, then minutes later every call fails `invalid_grant` on Step 1 — or the session reports no refresh token | The IdP never issued one and nothing caught it. Overwhelmingly: **`offline_access` missing** from the authorize scope (OIDC) or the Step 0b scope. Also: a library silently filtered the scope (verify the *assembled URL*, not the config object); consent not prompted (`prompt=consent`, `TODO(confirm)`); or you stored `access_token` instead of `refresh_token`. **Assert presence at login and fail loudly naming `offline_access`** — three lines now versus an afternoon later. |
| D-4 | both | Step 1 returns `invalid_grant` | Your `subject_token` was rejected. If you sent the **refresh token** (correct): it's expired/revoked/invalidated, lifetime undocumented, so unpredictable — this is a **re-authenticate, never a retry**. Map to `expired_token` + `upstream_step: step1` + `requiresReauth`. If you sent the **ID Token** (the v2 pattern): it just expired at ~10 min — works right after login, fails minutes later. Switch to the refresh token. |
| D-5 | both | Step 1 succeeds, Step 2 returns `invalid_grant` "audience mismatch" | Step 1's `audience`/`resource` don't match what the auth server expects — the IdP bakes both into the ID-JAG. Confirm `audience=https://auth.resource.xaa.dev` and `resource=https://api.resource.xaa.dev` exactly: no trailing-slash or scheme drift. The resource registration is canonical. |
| D-18 | both | Step 2 `invalid_grant` mentioning `iat` / clock / skew. Intermittent, or suddenly constant after laptop sleep or a container start | xaa.dev tolerates **30 s** of skew on the ID-JAG's `iat`, and its 5-minute life leaves little margin. **Fix the clock, not the code:** `sudo sntp -sS time.apple.com` (macOS), `timedatectl status` (Linux). Docker inherits the host clock — be suspicious after a VM suspend. |
| D-19 | both | Endless `/dashboard` ↔ `/login` bouncing; Step 1 called dozens of times a second; a retry button that never works | `expired_token` treated as one state when it's two. Retrying a dead refresh token is infinite by construction; unbounded re-mint on Step 3 expiry (usually really D-18) becomes a storm; offering retry when `requiresReauth` is set is a button that cannot work. Branch on `upstream_step`: `step3` → re-mint and retry **exactly once, counter-bounded, never recursive**; `step1` → sign-in only. |

## MCP (`APP_TYPE=mcp`)

| # | Path | Symptom | Cause → fix |
| --- | --- | --- | --- |
| D-20 | mcp | Steps 1–2 succeed, then `401` + `-32000` `"Unauthorized: Invalid or expired access token"`. **Minted fine, rejected at use** — that asymmetry is the diagnostic. **The most likely MCP failure.** | Most likely first: (1) **`mcp.access` missing from Step 1's `scope`** — MCP needs `todos.read` *and* `mcp.access`; a `todos.read`-only token mints cleanly and is refused here. (2) **Wrong `aud`**, i.e. Step 1's `resource` — the kit's open `TODO(confirm)`: docs say the resource URL, but `todo0-mcp`'s registered `resource_server_url` is `https://mcp.xaa.dev/mcp`. If scope is right, flip `RESOURCE_URL` between the two and retry. (3) Genuine expiry (~2 h) — re-mint before assuming misconfiguration. Decode the token and print `aud` + `scope`. |
| D-21 | mcp | HTTP `406`, or a JSON-RPC error in the `-32600`/`-32700`/`-32602`/`-32601` family | `406` = you omitted `Accept: application/json, text/event-stream`; both media types are required. `-32700`/`-32600` = malformed JSON-RPC. `-32602` = bad resource `uri` (note the `todo0://` vs `todo://` `TODO(confirm)`). `-32601` = method this server lacks — `todo0-mcp` is **resources-only**, so `tools/list`/`tools/call` are the usual culprits. **Seeing any of these is itself the finding:** the official SDK sets the header and frames correctly, so you're building requests by hand somewhere. That's the boundary violation, not just a bug. |
| D-22 | mcp | `initialize` errors, or the session behaves oddly afterwards — methods or capabilities missing | Protocol-version mismatch. The playground speaks **`2025-03-26`** and hardcodes it; an SDK defaulting to a newer revision may fail negotiation or negotiate into an unexpected shape. Pin `MCP_PROTOCOL_VERSION=2025-03-26` and pass it explicitly, then **log the version returned in `InitializeResult`** — negotiate, but assert the outcome. |
| D-23 | mcp | Discovery requests your code never made; a DCR `POST`; a redirect-to-authorization; an `UnauthorizedError` from the transport; **or a connection failure naming `http://authorization-server:5001`** | **Architecture bug, not config.** That last symptom is unmistakeable — an unroutable internal Docker hostname leaked by `mcp.xaa.dev`'s own AS metadata, reachable only by following the discovery chain. MCP's built-in OAuth (RFC 9728 → DCR → auth-code + PKCE) *competes* with XAA; here the token exists before the client connects. Supply it via the `authProvider` seam, leave acquisition members unimplemented (BUILD § 3b). The SDK only reaches for OAuth from a 401 handler — so either a 401 happened (fix that: D-20) or your provider permits acquisition. Letting it run registers a **third** client identity. On a 401 the correct move is the kit's error mapping, never handing control to the SDK. |

---

## Generic recipes

**Check what the servers advertise** — cheapest first move when something
structural seems wrong:

```bash
curl -sS https://idp.xaa.dev/.well-known/openid-configuration \
  | tr ',' '\n' | grep -i 'token_exchange_subject_token_types\|identity_chaining\|offline_access'

curl -sS https://auth.resource.xaa.dev/.well-known/oauth-authorization-server \
  | tr ',' '\n' | grep -i 'grant_profiles\|jwt-bearer'
```

Use `oauth-authorization-server` on the resource AS — `openid-configuration`
returns 200 there too but omits `authorization_grant_profiles_supported`. And
`idp.xaa.dev/.well-known/oauth-authorization-server` **404s**.

**Reproduce on the wire.** Export a real `REFRESH_TOKEN` from your session
store first (don't paste it into a shared terminal).

```bash
# Step 0b — SAML only. ASSERTION_FILE holds the bare <saml:Assertion>, exact bytes.
SUBJECT_TOKEN=$(base64 < "${ASSERTION_FILE}" | tr -d '\n' | tr '+/' '-_' | tr -d '=')
curl -sS -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
     -d "subject_token=${SUBJECT_TOKEN}" \
     -d "subject_token_type=urn:ietf:params:oauth:token-type:saml2" \
     -d "requested_token_type=urn:ietf:params:oauth:token-type:refresh_token" \
     -d "scope=openid offline_access email ${RESOURCE_SCOPES}" \
     -d "client_id=${CLIENT_ID}" -d "client_secret=${CLIENT_SECRET}" \
     "https://idp.xaa.dev/token"

# Step 1 — refresh token → ID-JAG (both paths)
curl -sS -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
     -d "subject_token=${REFRESH_TOKEN}" \
     -d "subject_token_type=urn:ietf:params:oauth:token-type:refresh_token" \
     -d "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
     -d "audience=https://auth.resource.xaa.dev" \
     -d "resource=https://api.resource.xaa.dev" \
     -d "scope=${RESOURCE_SCOPES}" \
     -d "client_id=${CLIENT_ID}" -d "client_secret=${CLIENT_SECRET}" \
     "https://idp.xaa.dev/token"

# Step 2 — ID-JAG → access token (client_secret_post)
curl -sS -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
     -d "assertion=${ID_JAG}" -d "scope=${RESOURCE_SCOPES}" \
     -d "client_id=${RESOURCE_CLIENT_ID}" -d "client_secret=${RESOURCE_CLIENT_SECRET}" \
     "https://auth.resource.xaa.dev/token"

# Step 3
curl -sS -i -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     "https://api.resource.xaa.dev${RESOURCE_PATH}"

# MCP — confirm the server is up and gated before debugging your own client
curl -sS https://mcp.xaa.dev/health      # → {"status":"healthy",…}
curl -sS -i -X POST https://mcp.xaa.dev/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
# → 401 + www-authenticate + -32000. That IS the healthy response: the endpoint
#   exists and is protected. Add -H "Authorization: Bearer ${ACCESS_TOKEN}" to go further.
```

**Decode a token without verifying it** (for D-15, D-18, D-20):

```bash
jwt_part() { echo "$1" | cut -d. -f"$2" | tr '_-' '/+' \
  | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null; echo; }

jwt_part "${ID_JAG}" 1     # header  — typ MUST be oauth-id-jag+jwt
jwt_part "${ID_JAG}" 2     # payload — iss, aud, client_id, exp, iat, sub or sub_id
```

If curl works and your code doesn't, the bug is in your client. If curl
fails too, it's your registration, env, or spec understanding — not your
code. And if curl fails **only** on the SAML path while OIDC is fine,
suspect D-16 before suspecting yourself.
