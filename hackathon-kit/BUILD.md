# BUILD — six phases, one stop

Read one phase when you reach it, not up front. Every wire-format detail lives
in `SPEC.md`; this file says *what to build*, never *what to send*. Follow only
the branches matching your `XAA_PROTOCOL` and `APP_TYPE`. **The only stop is
the end of Phase 2** — Phases 3–6 run straight through.

Surfaces to build, in total:

| Surface | Method | Purpose |
| --- | --- | --- |
| `/` · `/login` · `/dashboard` · `/logs` | GET | pages (`/` redirects by session) |
| `/api/auth/login` | GET | start login |
| `/api/auth/callback` | GET | **OIDC only** |
| `/api/auth/saml/acs` | POST | **SAML only** |
| `/api/auth/logout` | POST | destroy local session |
| `/api/auth/session` | GET | safe-to-render session view |
| `/api/call` | POST | run the XAA flow + fetch the resource |
| `/api/logs` | GET · DELETE | read / clear the ring buffer |

---

## Phase 1 — scaffold

Minimal HTTP app: routing, views (your choice of shape), session, config,
logger, test runner.

- **Server-side session**, encrypted + signed with `SESSION_SECRET`, in an
  httpOnly cookie (`SameSite=Lax`, 8 h max-age) or a server store keyed by
  one. Holds the **refresh token** (the anchor), claims for rendering, and a
  short-lived login transaction (OIDC: PKCE verifier + state + nonce; SAML:
  `RelayState` + AuthnRequest ID). ≤4 KB if cookie-based.
- **Lazy config.** Validate env vars on first use, not at import, so tests can
  import modules without every var set; throw naming the missing var. Validate
  only the vars your two axes need (SPEC § Environment).
- **Strict mode on** — TS `strict`, `mypy --strict`/`pyright`, Go
  `vet`+`staticcheck`, Rust `deny(warnings)`+clippy, C# nullable. The
  `ok: true | false` union in Phase 4 only narrows under strict mode.
- **Logger** → stdout, plus a **200-entry FIFO ring buffer** for Phase 5.
  Redaction per SPEC § Redaction.
- **Hermetic build** — no external service needed to install and boot.
- *(mcp)* Add the **official** MCP SDK and nothing else — no community client,
  no hand-rolled JSON-RPC. If your language has no official SDK, tell me
  before proceeding. *(standalone adds no dependency.)*

**Verify:** the dev server boots and `/` returns 2xx/3xx. Then unset one
required env var and confirm it fails loudly naming that var.

---

## Phase 2 — login  ← the one stop

Goal, on both paths: **a refresh token in the server-side session.** Until
that's stored, the user isn't logged in for our purposes. Shared requirements:

- Persist the login transaction server-side **before** redirecting out,
  with a `created_at`; reject returns older than **10 minutes**
  (`/login?error=expired_transaction`).
- On success store `refreshToken`, `claims` (`sub` or `sub_id`, `email`,
  `name`), and `loggedInAt` (server clock, ISO-8601 — not any token's
  `iat`).
- `/api/auth/session` returns `{authenticated, claims?, tokenState?}` and
  **never a raw token** — report the refresh token as redacted
  `head…tail` plus `hasRefreshToken`.
- **Logout destroys the local session only.** Don't call
  `end_session_endpoint` or `/saml/slo` — single sign-out adds redirect
  bouncing for no benefit here. Be honest in the UI: xaa.dev has no
  revocation endpoint, so the refresh token stays valid upstream. Don't
  claim otherwise (SPEC § Unverified, item 4).

### ▸ OIDC

Discover the IdP, cache for process lifetime, and expose a
`__resetOidcCache()` helper so tests can flush. Build the authorize URL per
SPEC § Step 0 → OIDC. On callback verify `state`, exchange the code, verify
the ID Token's `nonce`.

**Assert the token response actually contained a `refresh_token`** and fail
loudly naming `offline_access` if not. A silent absence resurfaces ten
minutes later as a mystery `invalid_grant`. Don't trust a library's scope
defaults — verify `offline_access` survives into the assembled URL.

### ▸ SAML

Fetch and cache `/saml/metadata`, extract the signing cert, then follow SPEC
§ Step 0 → SAML: AuthnRequest with `RelayState` and a recorded `ID`, ACS POST,
**all six validations**, bare assertion, Step 0b, store the refresh token.
**Discard the assertion** — 4–10 KB of XML that would overflow a cookie
session on its own.

**The ACS return is a cross-site POST, and `SameSite=Lax` cookies aren't sent
on those** — only on top-level GET navigations. If your transaction lookup
comes back empty, that's almost certainly why. Carry the session id in
`RelayState` and look it up server-side, or use a separate `SameSite=None;
Secure` cookie for the transaction only. **Never weaken the main session
cookie to `None`.**

**Verify (the assertion that matters most):**

```bash
# OIDC — offline_access must be in the authorize URL
curl -sS -i http://localhost:<port>/api/auth/login | grep -io 'scope=[^& ]*' \
  | grep -q offline_access && echo "PASS offline_access" || echo "FAIL — session will die in ~10 min"

# SAML — the IdP must advertise the saml2 subject token type
curl -sS https://idp.xaa.dev/.well-known/openid-configuration \
  | grep -q 'token-type:saml2' && echo "PASS saml2" || echo "FAIL"
```

**STOP HERE.** Show me the diff and that output. I'll log in through the
browser and confirm `/api/auth/session` reports a refresh token. On SAML,
the log should show **two** IdP interactions before `/dashboard`: the ACS
POST, then Step 0b. Wait for me to say continue.

---

## Phase 3 — the exchange

Wrap Steps 1 + 2 (SPEC) in one
`exchangeForResourceAccessToken(refreshToken, resourceUrl, scopes)` →
`{idJag, accessToken, scopes, expiresIn}`. Cache resource-AS discovery the
same way as Phase 2, using the `oauth-authorization-server` URL.

- Step 1 helper validates `issued_token_type` is `…id-jag`; Step 2 helper
  surfaces `expires_in` for the UI.
- **Two credential pairs**: `CLIENT_*` on Step 1, `RESOURCE_CLIENT_*` on
  Step 2. Never cross them.
- **Tag every error with `upstream_step`** (`step1`/`step2`) — Phase 4's
  re-mint-vs-re-auth decision depends on it.
- **Don't clear the refresh token on success** (it isn't consumed) and
  **don't persist the ID-JAG or access token** — re-mint per call.

**Verify:** hermetic tests T4.1–T4.4 below.

---

## Phase 4 — the call + error mapping

`POST /api/call`, session-gated (no session, or no refresh token in it →
`unauthorized`, 401). With a session: run Phase 3, hand the token to your
`APP_TYPE` branch, then map every outcome to the stable
`CallResult | ApiError` union from SPEC § Errors — `ok` as a **literal**.
Attach `details.upstream_*` only on the failure branch. Map ErrorCode → HTTP
per SPEC's table.

**Implement the re-mint-vs-re-authenticate rule** (SPEC § The two faces of
`expired_token`) — this is the phase where builds go wrong:

- Step 3 expiry → re-run Steps 1+2 and retry the fetch **exactly once**,
  guarded by a **counter, not recursion**. Prefer returning a
  `remintedAfterExpiry: true` marker so the retry is observable.
- Step 1 `invalid_grant` → return `expired_token` with `requiresReauth:
  true`. **No retry.**

Also expose `GET /api/logs` (`{logs: LogEntry[]}`) and `DELETE /api/logs`.

Robustness: fall back to `unauthorized` when a 401 carries no
`WWW-Authenticate` at all; don't parse a 5xx HTML body as JSON; on a 2xx
non-JSON body check `Content-Type` and return the text verbatim rather than
crashing; catch network rejections (DNS, TCP refused, TLS) as
`resource_failure`, never a 500. Build errors in one
`errorResponse(code, message, details?)` helper so every callsite matches.

### ▸ 3a — standalone

Call `GET https://api.resource.xaa.dev${RESOURCE_PATH}` with the Bearer
token and `Accept: application/json`; decode `WWW-Authenticate` per SPEC.
Nothing beyond your stack's HTTP client is needed.

### ▸ 3b — MCP client

The SDK owns the protocol; your job is to supply the XAA-minted token and
stop the SDK acquiring its own. Point a `StreamableHTTPClientTransport` at
`MCP_SERVER_URL` with an `authProvider` whose `tokens()` returns the Phase 3
access token, connect a `Client`, then `resources/list` and `resources/read`
on `todo0://todos` — **not** `tools/*`. **Assert the negotiated protocol
version** against `MCP_PROTOCOL_VERSION` and log it: the SDK proposes its
own `LATEST_PROTOCOL_VERSION` and negotiates down.

Verified against `@modelcontextprotocol/sdk@1.30.0`, whose header builder
does exactly `const tokens = await this._authProvider.tokens(); if (tokens)
headers['Authorization'] = 'Bearer ' + tokens.access_token`. So `tokens()`
alone is sufficient — `auth()` (discovery + DCR) runs *only* from the SDK's
401 handlers, so on the happy path **no discovery request is made at all**.
`OAuthClientProvider` has eight required members; implement the other seven
as loud failures so an accidental OAuth attempt can't be silent:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

function xaaAuthProvider(accessToken: string): OAuthClientProvider {
  const refuse = (what: string) => () => {
    throw new Error(`MCP SDK attempted its own OAuth (${what}). The token is ` +
      `minted by the XAA flow; the SDK must not acquire one. See DEBUG.md D-23.`);
  };
  return {
    get redirectUrl() { return undefined; },        // non-interactive: supported
    get clientMetadata() { return { redirect_uris: [] }; },
    tokens: () => ({ access_token: accessToken, token_type: 'Bearer' }),
    clientInformation: () => undefined,
    saveTokens: refuse('saveTokens'),
    redirectToAuthorization: refuse('redirectToAuthorization'),
    saveCodeVerifier: refuse('saveCodeVerifier'),
    codeVerifier: refuse('codeVerifier'),
  };
}

export async function callViaMcp(accessToken: string, mcpUrl: string) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    authProvider: xaaAuthProvider(accessToken),
  });
  const client = new Client({ name: 'xaa-hackathon-kit', version: '4.0.0' });
  await client.connect(transport);
  try {
    const negotiated = transport.protocolVersion;        // assert against config
    const resources = await client.listResources();
    const contents = await client.readResource({ uri: 'todo0://todos' });
    return { negotiated, resources, contents };
  } finally {
    await client.close();
  }
}
```

`redirectUrl` returning `undefined` is explicitly supported for non-interactive
flows. **Don't instead pass a `fetch` wrapper that sets the header yourself** —
that leaves `_authProvider` unset, so the SDK's 401 handling never runs and a
rejected token surfaces as an opaque transport error you can't map. The
`authProvider` seam is the supported extension point. *(Python: same shape —
supply the bearer token to `streamablehttp_client`; exact parameter name is
`TODO(confirm)`.)*

**Verify:** T5.x and T8.x below. Plus:

```bash
curl -sS -X POST http://localhost:<port>/api/call
# → 401 {"ok":false,"error":"unauthorized",…}
```

---

## Phase 5 — UI and observability

Shape is yours (SSR, SPA, TUI, plain HTML) — these states must be legible:

- `/login` surfaces any `?error=`. `/dashboard` is session-gated. `/`
  redirects by session. `/logs` is a full-width log view.
- **Dashboard cards:** authenticated user (`loggedInAt`, email, subject);
  token state; resource viewer; resource-target config (read-only); live log
  (poll `/api/logs` every 1.5–2 s, newest first, with a Clear button).
- **Token state shows the refresh token only**, redacted, plus scopes — the
  ID-JAG and access token are per-call, so render those in the success alert.
  **Show expiry as "unknown"**, never a countdown (SPEC § Unverified 1). If
  you show the ID Token, label it claims-only and *not* the anchor, or the
  card teaches the wrong model.
- **Success alert:** duration, ID-JAG + access token as `head…tail` chips,
  scope badges, then the payload — *(standalone)* HTTP status + pretty-printed
  body; *(mcp)* negotiated version, `resources/list` URIs and `resources/read`
  contents, with "connected · N resources" instead of a status, because a
  successful MCP call is a JSON-RPC result, not an HTTP one.
- **Failure: one distinct alert per ErrorCode**, with `details.upstream_*` in
  a collapsed panel. **`expired_token` needs two alerts, not one** — on
  `step3`, "expired, re-minted and retried"; on `step1`/`requiresReauth`,
  "your session has ended, sign in again" with a **sign-in link and no retry
  button**, since retry on a dead refresh token can never work.
- **Subject:** prefer `sub_id`, fall back to `sub`, per SPEC § ID-JAG
  structure. Don't assume `sub` exists; `sub_id` isn't a secret.

Tokens must reach the client already redacted — filter at the serialiser, not
the template. Audit the rendered output for any prefix of the raw refresh
token: it's the worst thing to leak, with no known expiry and no way to
revoke it.

**Verify:** `/login` and `/logs` return 200; `/` and `/dashboard` 30x to
`/login` without a session.

---

## Phase 6 — tests

Hermetic suite, no live network: stub the HTTP client at the boundary, match by
URL, assert method + body + headers, and reset cached discovery between tests.
Populate env in a setup hook **before** any config-using import (`conftest.py`
autouse fixture · `vi.stubEnv` in a vitest setup file · `TestMain` +
`t.Setenv` · `@BeforeAll` · `before(:suite)`). Run your path's rows; T4/T5/T6
are path-neutral.

| ID | Path | Case → expected |
| --- | --- | --- |
| T1.1 | both | A required var missing → throws naming it |
| T1.2 | both | Required set follows the axes → OIDC build doesn't demand `SAML_ACS_URL`, and vice versa |
| T2.1 | both | Redaction: long / short / null → `head…tail` / `***` / `undefined` |
| T2.2 | both | Key regex → `refresh_token` redacted; non-matching keys preserved |
| T2.3 | SAML | `SAMLResponse` redacted (it does **not** match the regex); `sub_id` **not** redacted |
| T3.1 | OIDC | Authorize URL → `client_id`, `redirect_uri`, `S256`, `state`, `nonce`, 43-char challenge, **`offline_access`** |
| T3.2 | SAML | AuthnRequest → carries `RelayState`, records `ID`, NameID **not** `transient` |
| T3.3 | SAML | Extracts the bare `<saml:Assertion>`; base64url with **no `=`**, no `+`/`/` |
| T3.4 | SAML | Step 0b → `subject_token_type=…saml2`, `requested_token_type=…refresh_token`, scope has `offline_access` |
| T4.1 | both | Step 1 → IdP `/token`, `…refresh_token` subject, `…id-jag` requested, audience + resource + scope |
| T4.2 | both | Step 2 → AS `token_endpoint`, `…jwt-bearer`, ID-JAG in `assertion`, credentials **in the form body** |
| T4.3 | both | `invalid_grant` tagged `upstream_step: step1` vs `step2` |
| T4.4 | both | Step 1 uses `CLIENT_*`, Step 2 uses `RESOURCE_CLIENT_*` |
| T5.1 | both | 200 → `ok: true`, body propagated |
| T5.2 | both | 401 expired, retry succeeds → `ok: true`, **exactly two** rounds |
| T5.3 | both | 401 signature / 401 generic / 403 → `invalid_token` / `unauthorized` / `insufficient_scope` |
| T5.4 | both | Network error, and 5xx → `resource_failure` |
| T5.5 | both | Session with no refresh token → `unauthorized` |
| T6.1 | both | **Refresh token still in session after a successful Step 1** — not single-use |
| T6.2 | both | **Two sequential calls, one login** → both 200; login once, Step 1 twice |
| T6.3 | both | Step 1 `invalid_grant` → `expired_token` + `requiresReauth`, **no retry attempted** |
| T6.4 | both | Step 3 expired twice → `expired_token`, **exactly two** rounds, no third |
| T7.1 | SAML | ID-JAG with `sub_id` and no `sub` → resolves from `sub_id.nameid` without throwing |
| T8.1 | mcp | Step 1 scope contains **both** `todos.read` and `mcp.access` |
| T8.2 | mcp | **Only `MCP_SERVER_URL` is contacted** — no `/.well-known/…`, no DCR, no redirect |
| T8.3 | mcp | `initialize` sends `2025-03-26` from config, not an SDK default |
| T8.4 | mcp | `-32000` "Invalid or expired access token" → `invalid_token`/`expired_token`, `step3`, **not** an OAuth flow |
| T8.5 | mcp | `-32601` → `resource_failure`, `step3` |

**T6.2 and T8.2 are the two that matter.** T6.2 fails on a build still
anchored on the ID Token while passing nearly everything else; T8.2 is the
only row that catches the *architecture* going wrong rather than the code.

Worth adding if there's time: `XAA_PROTOCOL` defaults to `oidc`; ring buffer
caps at 200 with FIFO eviction; Step 1 rejects a wrong `issued_token_type`; AS
discovery requests `oauth-authorization-server`; a rotated `refresh_token`
replaces the stored one; two `sub_id`s with the same `nameid` but different
`sp_name_qualifier` resolve to **different** subjects.

### Smoke probes (live boot, no network)

`GET /` → 30x `/login` · `GET /login` → 200 · `GET /dashboard` → 30x (gated) ·
`GET /logs` → 200 · `GET /api/auth/session` → `{"authenticated":false}` ·
`POST /api/call` → 401 `unauthorized` · `GET /api/logs` → 200 ·
`DELETE /api/logs` → 200 · `GET /api/auth/login` → 30x to `/authorize` with
PKCE+state+nonce+**`offline_access`** (OIDC), or to `/saml/sso` with
`SAMLRequest`+`RelayState` / a 200 self-POSTing form (SAML). *(mcp)* also
`GET https://mcp.xaa.dev/health` → 200 healthy.

### End-to-end, against real xaa.dev

| # | Scenario | Setup → the decisive check |
| --- | --- | --- |
| E1 | Successful flow | Log in, call. Dashboard shows email + subject + redacted refresh token, page source has **no raw token**, call returns 200, log reads `auth → token-exchange(step=1) → jwt-bearer(step=2) → resource-call` (SAML prepends `saml → step=0b`). |
| E2 | Unauthorized | No session → `POST /api/call` 401 `unauthorized`; `/dashboard` 30x. |
| E3 | Invalid token | `RESOURCE_URL=https://wrong.example.com` (audience drift), or flip a byte of the ID-JAG → distinct "invalid token" view carrying the upstream description and `upstream_step`. |
| E4 | Dead refresh token | Corrupt the stored refresh token — you can't revoke a real one, there's no revocation endpoint → `expired_token`, `step1`, **sign-in link not a retry button**, **exactly one** Step 1 attempt. |
| E5 | API failure | `RESOURCE_URL=http://localhost:9999` → `resource_failure` (network); then `RESOURCE_PATH=/api/does-not-exist` → `resource_failure` status 404. |
| E6 | **Refresh works** | Call, clear the log, wait **≥6 min** → 200 with a **different** ID-JAG and **no `auth` line**. Then wait past **~10 min from login** and call again → still 200. **That last step is decisive: failing it means you're still anchored on the ID Token.** |
| E7 | SAML end-to-end | Log shows the six validations, then `step=0b` (`…saml2` → `…refresh_token`); assertion absent from the session; ID-JAG carries `sub_id` with `format: saml-nameid`. **Then run E6 — Step 0b must not re-run.** |
| E8 | MCP end-to-end | Negotiated version `2025-03-26`; `resources/list` returns the three `todo0://` URIs. **Grep the request log: no `/.well-known/…`, no DCR, no redirect, nothing to `authorization-server:5001` — only `MCP_SERVER_URL`.** That's the only check that proves the architecture. Then drop `mcp.access` and call → Step 2 still succeeds but MCP 401s with `step3` and **no login redirect**; restore it. |

**E6 is what proves the design — a build can pass E1 and still fail E6.**
Capture output in `FINAL_VALIDATION.md`, noting which path you built.
