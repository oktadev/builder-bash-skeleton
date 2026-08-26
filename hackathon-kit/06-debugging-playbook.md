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
   this is your bug. Switch to the refresh token — see
   `MIGRATION-v2-to-v3.md`.

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

Step 0b returns `invalid_grant`, `invalid_request`, or a parse error.
Or — worse and more common — **nothing arrives at your ACS at all** and
the browser just sits on the IdP.

*If nothing arrives:* your registered ACS URL doesn't match
`SAML_ACS_URL`. Unlike OIDC's explicit `redirect_uri_mismatch` (D-1), a
wrong ACS fails silently — the IdP POSTs into the void. Check
byte-exactness before anything else.

### Root cause

Five candidates, in the order they bite:

1. **You sent the whole `SAMLResponse`.** The `subject_token` is the
   bare `<saml:Assertion>` element, not the enclosing document.
2. **You used standard base64, padded.** RFC 8693 § 3 requires
   **base64url unpadded** for `…token-type:saml2`. Padded standard
   base64 contains `+` and `=`; in a form body `+` decodes to a space,
   so you may get a confusing parse error rather than a clean rejection.
   (Draft-04's own § 4.5 example shows padded standard base64 — it's
   wrong, or at least not form-safe. Follow RFC 8693.)
3. **You re-serialised the XML and broke the signature.** XML-DSIG
   covers exact bytes including canonicalisation. Parse to *verify*, but
   extract the *original* bytes to send.
4. **The SAML Audience doesn't map to your `CLIENT_ID`.** Draft-04
   § 4.5 requires the IdP to verify that the Audience / SPEntityID maps
   to the authenticated OAuth client. A registered SP that belongs to a
   different client fails here, not at SSO.
5. **`offline_access` missing from the Step 0b `scope`.** You'll get a
   200 with no `refresh_token` rather than an error. See D-17.

### Debugging prompt

> My SAML assertion is rejected at Step 0b. Verify in order: (a) I'm
> sending the bare `<saml:Assertion>` element, not the whole
> `SAMLResponse`; (b) it's base64url encoded with **no `=` padding**;
> (c) I extracted the original bytes rather than re-serialising after
> parsing; (d) the assertion's `AudienceRestriction` corresponds to the
> `CLIENT_ID` I'm authenticating with; (e) `scope` includes
> `offline_access`. Print the first 80 chars of what I'm sending as
> `subject_token` and confirm there is no `+`, `/`, or `=` in it.

---

## D-15 — Step 2 rejects a SAML-derived ID-JAG on the subject

> **SAML path only.**

### Symptom

Step 1 succeeds and returns an ID-JAG. Step 2 returns `invalid_grant`,
with a description mentioning subject, NameID, or `sub_id` — or no
useful description at all.

### Root cause

Draft-04 § 3.2.2 specifies `invalid_grant` for *every* `sub_id`
resolution failure, so several distinct problems look identical:

- No `sub_id` in the required `saml-nameid` format.
- `sub_id` malformed, or a format the auth server doesn't support.
- **The SAML issuer isn't associated with the validated ID-JAG issuer**
  for your tenant. Per § 9.5 the auth server may use a `saml-nameid`
  `sub_id` *only when* the validated ID-JAG issuer is explicitly
  associated with `sub_id.issuer` via local config or federation
  metadata. On xaa.dev that association is the per-tenant
  `saml_id_jag.issuers` allow-list — see D-16.
- **Subject resolution keyed on the wrong members.** § 3.2.2: the auth
  server *"MUST compare every member […] that is part of the set of
  identifier fields it uses"* and *"MUST NOT resolve the subject using
  only the `nameid` value."* When the `<NameID>` is SP-scoped,
  `sp_name_qualifier` is part of the subject namespace.

### Debugging prompt

> Step 2 rejects my SAML-derived ID-JAG. Decode the ID-JAG payload and
> show me the `sub_id` object. Confirm `format` is `saml-nameid` and that
> `issuer`, `nameid` are present. Then check whether the resource auth
> server's tenant config associates my `sub_id.issuer` with the ID-JAG's
> `iss` — if not, that's the failure, and it's a registration problem
> rather than a code problem.

---

## D-16 — Resource tenant has SAML ID-JAG disabled

> **SAML path only.**

### Symptom

Everything through Step 1 is clean; the ID-JAG looks correct and carries
a well-formed `sub_id`. Step 2 rejects it anyway, consistently, with
`invalid_grant`.

### Root cause

The resource auth server gates SAML-derived ID-JAGs **per tenant**. Each
tenant carries a `saml_id_jag` config with an `enabled` flag and an
allow-list of SAML issuers. If your tenant has it disabled, no
client-side fix will help — the ID-JAG is correct and still refused.

On xaa.dev the built-in tenant `customer1` has it enabled with issuer
`https://idp.xaa.dev/saml`; `customer2` and `customer3` have it
disabled.

### Resolution

Confirm your tenant's configuration, and that its allow-list contains
the `sub_id.issuer` your assertions carry. If you registered a BYOR
resource, this is yours to set. If you're on a built-in tenant, use one
with SAML enabled.

This is the one failure in the SAML path that is **not** a bug in your
app. Recognising it quickly saves hours.

### Debugging prompt

> Steps 0–1 are clean and my ID-JAG carries a valid `sub_id`, but Step 2
> refuses it every time. Check whether the resource tenant I'm targeting
> has SAML ID-JAG support enabled and whether my `sub_id.issuer` is in
> its allow-list. If it isn't, tell me — this is a registration issue,
> not something to fix in code.

---

## D-17 — No refresh token was issued

### Symptom

Login "succeeds" and the dashboard renders. Then, minutes later, every
`/api/call` fails with `invalid_grant` on Step 1. Or `/api/auth/session`
reports no refresh token at all.

### Root cause

The IdP never returned a `refresh_token`, and nothing caught it at the
time:

1. **`offline_access` missing** from the OIDC authorize `scope`, or from
   the Step 0b `scope` on the SAML path. This is the overwhelmingly
   likely cause.
2. **The scope was silently dropped** by an OIDC library that filters
   against a hardcoded list. `offline_access` *is* in xaa.dev's
   `scopes_supported`, so this is rarer — but verify the assembled URL
   rather than the config object.
3. **Consent wasn't prompted.** xaa.dev's demo sends `prompt=consent`
   alongside `offline_access`. Whether it's *required* is
   `TODO(confirm)`.
4. **You stored the wrong field.** The token response contains both
   `access_token` (the IdP's, which this kit never uses) and
   `refresh_token`. Storing the former gets you a token that Step 1
   rejects.

### Resolution

Assert on the refresh token's presence **at login**, and fail loudly
naming `offline_access`. A missing refresh token that surfaces ten
minutes later as `invalid_grant` is one of the most confusing failures
in this kit; catching it at the source costs three lines.

### Debugging prompt

> My session has no refresh token. Print the exact `scope` parameter my
> authorize URL (or Step 0b request) sends, and confirm it contains
> `offline_access`. Then confirm I'm storing the response's
> `refresh_token` field and not its `access_token`. Add an assertion at
> login that fails with a message naming `offline_access` if no refresh
> token came back.

---

## D-18 — ID-JAG rejected for clock skew

### Symptom

Step 2 returns `invalid_grant` with a description mentioning `iat`,
clock, or skew. Intermittent, or suddenly constant after a laptop
sleep/resume or a container start.

### Root cause

xaa.dev tolerates **30 seconds** of skew on the ID-JAG's `iat`, and
rejects beyond that. Your system clock has drifted. Combined with the
ID-JAG's 5-minute lifetime, there is little margin.

### Resolution

Fix the clock, not the code. There is no correct code change here — the
ID-JAG is minted by the IdP with the IdP's `iat`, and your machine's
disagreement about "now" is the entire problem.

```bash
# macOS
sudo sntp -sS time.apple.com
# Linux (systemd)
timedatectl status && sudo systemctl restart systemd-timesyncd
# Docker: the container inherits the host clock; check the host,
# and be suspicious after a VM suspend/resume.
```

### Debugging prompt

> Step 2 rejects my ID-JAG with a clock/`iat` complaint. Decode the
> ID-JAG payload, print its `iat` and `exp`, and compare against my
> system time. If the delta exceeds 30 s, tell me to fix my clock rather
> than changing code.

---

## D-19 — Re-auth loop or retry storm

### Symptom

One of:
- The user bounces between `/dashboard` and `/login` endlessly.
- Your logs show Step 1 called dozens of times in a few seconds.
- A "retry" button in the UI never succeeds no matter how often it's
  clicked.

### Root cause

`expired_token` was treated as one state when it is two.

- **Retrying a dead refresh token.** Step 1's `invalid_grant` means the
  refresh token cannot be repaired — expired, revoked, and invalidated
  are indistinguishable and none are retryable. A retry loop here is
  infinite by construction.
- **Unbounded re-mint on Step 3 expiry.** If a freshly minted access
  token is *also* rejected as expired, re-minting again won't help
  (that's usually D-18, clock skew). Recursion without a counter turns
  it into a storm.
- **Offering "retry" when `requiresReauth` is set.** A button that
  cannot ever work.

### Resolution

Branch on `details.upstream_step`, per `reference/error-mapping.md`
§ The two faces of `expired_token`:

```
step3 + expired  → re-mint and retry EXACTLY ONCE (counter, not recursion)
step1 + invalid_grant → requiresReauth: true; offer sign-in only, never retry
```

### Debugging prompt

> I have a re-auth loop / retry storm. Show me where I branch on
> `expired_token`. It must distinguish `upstream_step === "step3"`
> (re-mint and retry once, bounded by a counter) from
> `upstream_step === "step1"` (refresh token is dead — set
> `requiresReauth`, offer sign-in, never retry). Confirm the Step 3
> retry is bounded by a counter rather than recursion.

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
