# 04 — Using the access token + error mapping

> **This file branches on `APP_TYPE`.** § Shared applies to everyone,
> then read **either** § Step 3a (standalone) **or** § Step 3b (MCP
> client) — not both.
>
> Both branches consume the *same* access token from `03` and produce the
> *same* `ApiError | CallResult` shape. The ErrorCode set does not grow.

## Prompt — shared

> Implement the layer that ties the XAA flow to a real call and gives the
> UI a stable error contract.
>
> 1. **`POST /api/call`** is session-gated. If no session (or no refresh
>    token in it) → `{ok:false, error:"unauthorized"}` (HTTP 401).
> 2. With a session: run `exchangeForResourceAccessToken()` from 03 with
>    the session's **refresh token** to obtain an access token. Then hand
>    that token to your `APP_TYPE` branch below.
> 3. Map upstream outcomes into a stable `ApiError | CallResult` shape
>    per `reference/error-mapping.md` § ErrorCode set.
> 4. Decode `WWW-Authenticate: Bearer error="…"` per
>    `reference/error-mapping.md` § Decoding `WWW-Authenticate`.
> 5. Map upstream OAuth errors thrown by the token-exchange layer per
>    the same reference's § Token-exchange failure decoding. **Carry
>    `upstream_step`** (`step1` / `step2` / `step3`) into
>    `details` — the next rule depends on it.
> 6. **Implement the re-mint-vs-re-authenticate rule.** `expired_token`
>    means two operationally different things:
>
>    | Raised at | What expired | What you do |
>    | --------- | ------------ | ----------- |
>    | **Step 3** (401, description mentions expired) | the access token | **Re-mint once.** Re-run Steps 1 + 2 and retry the fetch a single time. Return the retry's outcome. |
>    | **Step 1** (`invalid_grant`) | the **refresh token** | **Re-authenticate.** Return `expired_token` with a `requiresReauth: true` hint so the UI sends the user to `/login`. Do not retry. |
>
>    **Retry exactly once** on the Step 3 path. If a freshly minted
>    access token is *also* rejected as expired, the cause is clock skew
>    or misconfiguration, not expiry — surface it instead of looping.
>    Guard this with a counter, not recursion.
>
> Map the `ErrorCode` to an HTTP status when serialising the route
> response:
>
> | ErrorCode               | HTTP |
> | ----------------------- | ---- |
> | `unauthorized`          | 401  |
> | `invalid_token`         | 401  |
> | `expired_token`         | 401  |
> | `insufficient_scope`    | 403  |
> | `resource_failure`      | 502  |
> | `token_exchange_failure`| 502  |
> | `config_error`          | 500  |
> | `unknown`               | 500  |
>
> Also expose:
>
> - **`GET /api/logs`** — `{logs: LogEntry[]}` from the in-memory ring
>   buffer.
> - **`DELETE /api/logs`** — clear the buffer.

---

## ▸ Step 3a — standalone

> **`APP_TYPE=standalone`.** MCP readers: skip to § Step 3b.

> With the access token from the shared step, call
> `GET https://api.resource.xaa.dev${RESOURCE_PATH}`
> (default `RESOURCE_PATH=/api/todos`; BYOR overrides the host) with:
>   - `Authorization: Bearer <access_token>`
>   - `Accept: application/json`
>
> Decode `WWW-Authenticate: Bearer error="…"` per
> `reference/error-mapping.md` § Decoding `WWW-Authenticate`.

Nothing beyond your stack's HTTP client is required.

---

## ▸ Step 3b — MCP client

> **`APP_TYPE=mcp`.** Standalone readers: skip this section.

> Use the **official MCP SDK** for all protocol work. Your job is to
> supply the XAA-minted access token and to keep the SDK from acquiring
> one of its own.
>
> 1. Construct a `StreamableHTTPClientTransport` pointed at
>    `MCP_SERVER_URL`, passing an `authProvider` whose `tokens()` returns
>    the access token from the shared step.
> 2. Connect a `Client`, then call `resources/list` and
>    `resources/read` on `todo0://todos`. **Not** `tools/*` —
>    `todo0-mcp` exposes no tools.
> 3. **Assert the negotiated protocol version.** The SDK proposes its
>    `LATEST_PROTOCOL_VERSION` and negotiates down; xaa.dev speaks
>    `2025-03-26`. Log what was actually agreed and compare against
>    `MCP_PROTOCOL_VERSION`.
> 4. Map transport and JSON-RPC failures onto the same `ErrorCode` set
>    per `reference/error-mapping.md` § MCP transport and JSON-RPC
>    failures, tagging `upstream_step: "step3"`.

### How the token gets in

Verified against **`@modelcontextprotocol/sdk@1.30.0`**. The transport
accepts `{ authProvider, requestInit, fetch, reconnectionOptions,
sessionId }`, and its header builder does exactly this:

```js
const tokens = await this._authProvider.tokens();
if (tokens) headers['Authorization'] = `Bearer ${tokens.access_token}`;
```

So **`tokens()` returning your token is sufficient** — and `auth()` (which
performs RFC 9728 discovery and DCR) is invoked *only* from the SDK's 401
handlers. On the happy path with a valid token, **no discovery request is
made at all.**

`OAuthClientProvider` has eight required members in 1.30.0, but only
`tokens()` participates in this flow. Implement the rest as loud failures
so an accidental OAuth attempt is impossible to miss:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

/**
 * Supplies the XAA-minted access token to the MCP SDK.
 * Deliberately NOT a working OAuth client: every member that would
 * acquire a token throws, so a silent fallback to MCP's own OAuth
 * becomes a visible crash instead.
 */
function xaaAuthProvider(accessToken: string): OAuthClientProvider {
  const refuse = (what: string) => () => {
    throw new Error(
      `MCP SDK attempted its own OAuth (${what}). The access token is ` +
      `minted by the XAA flow; the SDK must not acquire one. See ` +
      `hackathon-kit/06-debugging-playbook.md D-23.`
    );
  };
  return {
    // Non-interactive: there is no user-agent redirect in this flow.
    get redirectUrl() { return undefined; },
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
  const client = new Client({ name: 'xaa-hackathon-kit', version: '3.0.0' });

  await client.connect(transport);
  try {
    const negotiated = transport.protocolVersion;   // assert this
    const resources = await client.listResources();
    const contents = await client.readResource({ uri: 'todo0://todos' });
    return { negotiated, resources, contents };
  } finally {
    await client.close();
  }
}
```

`redirectUrl` returning `undefined` is explicitly supported — the SDK
documents it for *"non-interactive flows that don't require user
interaction (e.g. `client_credentials`, `jwt-bearer`)."*

> **Python:** the same shape applies — supply the bearer token to the
> `streamablehttp_client` transport rather than letting the SDK's OAuth
> provider acquire one. `TODO(confirm)` — exact parameter name in the
> current `mcp` release; the TypeScript path above is the one this kit
> has verified.

### Why not a `fetch` wrapper?

You *can* pass `{ fetch }` and set the header yourself. Don't: it leaves
`_authProvider` unset, so the SDK's 401 handling never runs and a rejected
token surfaces as an opaque transport error instead of something you can
map. The `authProvider` seam is the supported extension point.

### Version note

The SDK's `main` branch (unreleased `@modelcontextprotocol/client` v2)
adds a **much smaller** seam for exactly this case —

```ts
interface AuthProvider {
  token(): Promise<string | undefined>;
  onUnauthorized?(ctx: UnauthorizedContext): Promise<void>;
}
```

— where omitting `onUnauthorized` makes the transport throw
`UnauthorizedError` instead of starting an OAuth flow, and where
`onUnauthorized` is the natural home for the kit's *re-mint once* rule
(the transport retries exactly once, then throws). v2 also ships an
`IdJagTokenExchangeResponseSchema` and documents `resourceUrl()` /
`authorizationServerUrl()` as hooks *"for providers implementing
Cross-App Access."* **None of that is in 1.30.0** — write against the
`OAuthClientProvider` shape above today, and simplify when v2 lands.

---

## Objective

Give the UI a stable, parseable error shape regardless of which layer
of the chain (IdP / auth-server / resource) failed.

## Output (capabilities, not files)

| Capability                          | Notes                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| `callProtectedResource()`           | Orchestration + error mapping. Returns a tagged union — `ok: true` on success, `ok: false` plus an `error: ErrorCode` on failure. |
| Single-retry re-mint on Step 3 expiry | Bounded by a counter. Never recursive, never a loop.           |
| `requiresReauth` flag               | Set when Step 1 rejects the refresh token. The UI's cue to offer sign-in rather than retry. |
| `/api/call` route                   | Session-gated. Maps `ErrorCode → HTTP`. Always returns JSON.     |
| `/api/logs` route                   | GET returns the ring buffer; DELETE clears it.                   |
| *(mcp)* `authProvider` supplying the XAA token | `tokens()` returns the Step-2 access token; every acquisition member throws. |
| *(mcp)* negotiated-version assertion | Logged and compared against `MCP_PROTOCOL_VERSION`.             |

## Decisions to make

- **Tagged union shape.** Use `ok: true` and `ok: false` as **literals**
  (not just `boolean`) so type systems with discriminated unions can
  narrow on it. In dynamically-typed languages this is just convention
  but it pays off when serialising/deserialising at the boundary.
- **Where to attach `details`.** Include `upstream_status`,
  `upstream_error`, `upstream_description`, and `upstream_step` only on
  the `ok: false` branch. The frontend uses these for diagnostic alerts,
  and `upstream_step` is what makes `expired_token` actionable.
- **Whether to surface the retry.** If the Step 3 re-mint retry
  succeeds, you have a choice: return plain `ok: true`, or return
  `ok: true` with a `remintedAfterExpiry: true` marker. Prefer the
  marker — it makes E6 observable and stops a silently-working retry
  from looking like a first-try success in the log.

## Issues you may hit

- **400/401 with no `WWW-Authenticate` header at all.** Fall back to
  `unauthorized`. Don't crash on missing header.
- **`error_description` not URL-decoded by some HTTP libraries.** If
  your match for "expired" fails when you can see the substring in
  curl, decode the header value before regex.
- **5xx with HTML body.** Don't try to parse the body as JSON.
  `resource_failure` only needs the status code; preserve the raw
  status and a short text snippet.
- **2xx with non-JSON body.** Inspect `Content-Type`. If it's
  `application/json` (or `+json`), parse. Otherwise treat the body as
  a string and return it verbatim — the UI's `<pre>` block can render
  it. Don't crash on text/plain or text/html responses.
- **`fetch` Promise rejections.** Network errors (DNS, TCP refused,
  TLS handshake) should be caught and mapped to `resource_failure`,
  not bubble up as a 500.

## Fixes

- Default-construct the error response in one place:
  ```
  errorResponse(code, message, details?) → ApiError
  ```
  so every callsite gets the same shape.
- Treat the `WWW-Authenticate` parse as best-effort. The decision
  table in `reference/error-mapping.md` already accounts for missing
  fields.

## Verification

Hermetic tests for `callProtectedResource()` must cover these outcome
paths (mock the HTTP boundary, not the network). Rows apply to both app
types unless marked:

| Scenario                                            | Expected                  |
| --------------------------------------------------- | ------------------------- |
| 200 OK with body                                    | `ok: true`, body propagated |
| 401 + `error="invalid_token"` description=expired, retry succeeds | `ok: true`; exactly **two** Step-1/2 rounds observed |
| 401 + `error="invalid_token"` description=expired, retry also 401 | `expired_token`; exactly **two** rounds, no third |
| 401 + `error="invalid_token"` description=signature | `invalid_token`           |
| 401 (generic, no `error=` in WWW-Authenticate)      | `unauthorized`            |
| 403 + `error="insufficient_scope"`                  | `insufficient_scope`      |
| Network error (TCP refused / DNS / timeout)         | `resource_failure`        |
| 5xx upstream                                        | `resource_failure`        |
| IdP returns `invalid_grant` on Step 1               | `expired_token`, `upstream_step: "step1"`, `requiresReauth: true`, and **no retry attempted** |
| Auth server returns `invalid_grant` on Step 2       | `expired_token`, `upstream_step: "step2"` |
| Session exists but holds no refresh token           | `unauthorized`            |
| *(mcp)* JSON-RPC `-32000` `"Invalid or expired access token"` | `invalid_token` / `expired_token`, `upstream_step: "step3"` |
| *(mcp)* JSON-RPC `-32601` method not found          | `resource_failure`, `upstream_step: "step3"` |
| *(mcp)* **only `MCP_SERVER_URL` is contacted**       | **No** request to any `/.well-known/…`, no DCR, no redirect. This is the architecture test — see `07` § T8.2. |

Live curl:

```bash
curl -sS -X POST http://localhost:<port>/api/call
# Expect: 401 {"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}
```

**MCP mode — confirm the server is reachable and gated before debugging
your own client:**

```bash
curl -sS https://mcp.xaa.dev/health
# → {"status":"healthy","service":"mcp-server",…}

curl -sS -i -X POST https://mcp.xaa.dev/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
# → 401 + www-authenticate: Bearer resource_metadata="…/oauth-protected-resource/mcp"
#   {"jsonrpc":"2.0","error":{"code":-32000,"message":"Unauthorized: No access token provided"},"id":null}
```

That 401 is the correct, healthy response — it proves the endpoint exists
and is protected. Add `-H "Authorization: Bearer ${ACCESS_TOKEN}"` with a
real token to go further.

End-to-end, with a real session, `POST /api/call` returns:

- **standalone:** `{ok:true, response:{status:200, body:{…}},
  tokens:{idJag:"head…tail", accessToken:"head…tail", scopes:["…"]}}`
- **mcp:** the same envelope with the MCP payload in place of an HTTP
  body — negotiated protocol version, `resources/list` URIs, and the
  `resources/read` contents. No `status` field, because a successful MCP
  call is a JSON-RPC result rather than an HTTP status.
