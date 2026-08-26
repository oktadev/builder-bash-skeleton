# 07 — Testing

## Prompt

> Set up a hermetic test suite (no live network) for the behavioural
> cores: config, logger, the login URL/request builder, the token
> exchange, and the resource call layer. Plus the mandatory end-to-end
> scenarios as documented manual procedures. Use whatever test runner is
> idiomatic in your stack (pytest / vitest / go test / JUnit / RSpec /
> xUnit / etc.).
>
> The hermetic suite must:
>
> 1. Stub the HTTP client at the boundary (the function your stack
>    uses to issue HTTP calls). Match by URL pattern; assert the
>    request body, headers, and method.
> 2. Reset any cached discovery (OIDC metadata, SAML metadata, resource
>    auth server metadata) between tests, since each scenario uses a
>    different mocked document.
> 3. Populate the env vars in a setup hook before importing any
>    config-using module — including `XAA_PROTOCOL`, and the path-specific
>    vars for whichever path the test exercises.
>
> Test **your** path's login rows. The token-exchange and resource-call
> rows (T4, T5, T6) are path-neutral — run them regardless.

### Test-env setup hooks per stack

The "before importing any config-using module" rule tripping you up?
Idiomatic patterns:

| Stack         | Hook                                                            |
| ------------- | --------------------------------------------------------------- |
| **pytest**    | `conftest.py` with `@pytest.fixture(autouse=True)` that uses `monkeypatch.setenv` for each var. Or `os.environ.update(...)` in a session-scoped autouse fixture. |
| **vitest**    | `beforeEach(() => { vi.stubEnv('CLIENT_ID', '…') })` in a setup file referenced from `vitest.config.ts`. Reset with `vi.unstubAllEnvs()` in `afterEach`. |
| **jest**      | `globalSetup` script that mutates `process.env`, plus `setupFiles` for per-test isolation. |
| **go test**   | `TestMain` calls `t.Setenv` (Go ≥1.17) before invoking `m.Run()`. Each subtest can override with its own `t.Setenv`. |
| **cargo test**| Set vars via `std::env::set_var` in a `#[ctor]` block, or use a test harness like `serial_test` to avoid env races between parallel tests. |
| **JUnit 5**   | `@BeforeAll static void` setting `System.setProperty(...)`, or a JUnit extension that wraps tests with the env. |
| **RSpec**     | `RSpec.configure { |c| c.before(:suite) { ENV['CLIENT_ID'] = '…' } }`. |

The point is the same in every stack: the env is hot before any
config-validating import runs.

## Objective

Lock the spec contracts (grant types, token types, audience/resource
fields, error mapping, redaction shape, and the
re-mint-vs-re-authenticate rule) in tests so a refactor or an upstream
library upgrade can't silently break them. Plus prove the mandatory
user-facing scenarios produce distinct outcomes.

## Required hermetic test cases

Required rows — the ones that catch real regressions:

| ID    | Path  | Surface              | Case                                        | Expected                                 |
| ----- | ----- | -------------------- | ------------------------------------------- | ---------------------------------------- |
| T1.1  | both  | config               | One required var missing                    | Throws with the missing var's name        |
| T1.2  | both  | config               | Required set follows `XAA_PROTOCOL`         | OIDC build doesn't demand `SAML_ACS_URL`, and vice versa |
| T2.1  | both  | logger               | Long / short / null token redaction         | `head…tail` / `***` / `undefined`         |
| T2.2  | both  | logger               | Key regex `token/secret/assertion/jag/jwt`  | All redacted (incl. `refresh_token`); non-matching keys preserved |
| T2.3  | SAML  | logger               | `SAMLResponse` and `sub_id`                 | `SAMLResponse` redacted (it does **not** match the regex); `sub_id` **not** redacted |
| T3.1  | OIDC  | login URL builder    | Authorize URL                               | `client_id`, `redirect_uri`, `code_challenge_method=S256`, `state`, `nonce`, base64url challenge — **and `offline_access` in scope** |
| T3.2  | SAML  | AuthnRequest builder | Request                                     | Carries `RelayState`; records the request `ID`; NameID format is **not** `transient` |
| T3.3  | SAML  | assertion handling   | Full `SAMLResponse` in                      | Extracts the bare `<saml:Assertion>`; encodes base64url with **no `=` padding**, no `+` or `/` |
| T3.4  | SAML  | Step 0b request      | Built request                               | `subject_token_type=…saml2`, `requested_token_type=…refresh_token`, scope includes `offline_access` |
| T4.1  | both  | token-exchange       | Step 1 happy path                           | Hits IdP `/token`; `subject_token_type=…refresh_token`, `requested_token_type=…id-jag`, refresh token in `subject_token`, audience + resource + scope present |
| T4.2  | both  | token-exchange       | Step 2 happy path                           | Hits auth server `token_endpoint`; `grant_type=…jwt-bearer`, ID-JAG in `assertion`, credentials **in form body** |
| T4.3  | both  | token-exchange       | `invalid_grant` on Step 1 vs Step 2         | Tagged `upstream_step: "step1"` / `"step2"` respectively |
| T4.4  | both  | token-exchange       | Two credential pairs                        | Step 1 uses `CLIENT_*`, Step 2 uses `RESOURCE_CLIENT_*` |
| T5.1  | both  | resource-call        | 200 with body                               | `ok: true`, body propagated              |
| T5.2  | both  | resource-call        | 401 `invalid_token` desc=expired, retry OK  | `ok: true`; **exactly two** Step-1/2 rounds |
| T5.3  | both  | resource-call        | 401 desc=signature / 401 generic / 403      | `invalid_token` / `unauthorized` / `insufficient_scope` |
| T5.4  | both  | resource-call        | Network error, and 5xx                      | `resource_failure` for both              |
| T5.5  | both  | resource-call        | Session exists, no refresh token            | `unauthorized`                           |
| T6.1  | both  | refresh semantics    | Refresh token survives Step 1               | Still in session after a successful exchange — **not** single-use |
| T6.2  | both  | refresh semantics    | Two sequential calls, one login             | Both succeed; login runs **once**; Step 1 runs **twice** |
| T6.3  | both  | refresh semantics    | Step 1 `invalid_grant`                      | `expired_token` + `requiresReauth: true`, and **no retry attempted** |
| T6.4  | both  | refresh semantics    | Step 3 expired twice in a row               | `expired_token`; **exactly two** rounds, no third — retry is bounded |
| T7.1  | SAML  | ID-JAG claims        | Payload with `sub_id`, no `sub`             | Subject resolves from `sub_id.nameid` without throwing |
| T8.1  | mcp   | Step 1 scopes        | Built request in MCP mode                   | `scope` contains **both** `todos.read` and `mcp.access` |
| T8.2  | mcp   | token injection      | MCP client construction                     | The transport is given the Step-2 access token; **no** discovery, DCR, or redirect is attempted (assert on the stubbed HTTP client: only `MCP_SERVER_URL` is called) |
| T8.3  | mcp   | protocol version     | `initialize`                                | Client sends `2025-03-26` from `MCP_PROTOCOL_VERSION`, not an SDK default |
| T8.4  | mcp   | transport 401        | JSON-RPC `-32000` "Invalid or expired access token" | `invalid_token` (or `expired_token` if the description says expired), `upstream_step: "step3"` — **not** an OAuth flow |
| T8.5  | mcp   | JSON-RPC `-32601`    | Method not found                            | `resource_failure`, `upstream_step: "step3"` |

**About 18 rows on an OIDC + standalone build; 22 on SAML; +5 on MCP.**
Implementations may merge or split them; what matters is that each row's
behaviour is asserted somewhere.

**T8.2 is the MCP equivalent of T6.2** — it's the row that catches the
architecture going wrong rather than the code. A build that lets the SDK
run its own OAuth will still pass every other MCP row.

**T6.2 is the one that matters most.** A build still anchored on the ID
Token passes nearly every other row and fails this one.

### Optional rows

Worth adding if you have time, but they test the spec more than they test
your code:

- `XAA_PROTOCOL` unset defaults to `oidc`; scope lists with stray
  whitespace are trimmed.
- Ring buffer caps at 200 with FIFO eviction.
- Step 1 rejects a response whose `issued_token_type` isn't `…id-jag`.
- Auth-server discovery requests `oauth-authorization-server` rather than
  `openid-configuration`.
- A rotated `refresh_token` in a response replaces the stored one.
- Two `sub_id`s with the same `nameid` but different `sp_name_qualifier`
  resolve to **different** subjects.
- OIDC ID-JAG with a plain `sub` resolves from `sub`.

## Required smoke tests (live boot, no network)

After your dev server boots, these probes must produce the documented
responses:

| Request                             | Path | Expected                                           |
| ----------------------------------- | ---- | -------------------------------------------------- |
| `GET /` (no session)                | both | 30x → `/login`                                     |
| `GET /login`                        | both | 200 with sign-in markup                            |
| `GET /dashboard` (no session)       | both | 30x → `/login` (gated)                             |
| `GET /logs`                         | both | 200 with observability page                        |
| `GET /api/auth/session` (no session)| both | 200 `{"authenticated":false}`                      |
| `POST /api/call` (no session)       | both | 401 `{"ok":false,"error":"unauthorized",…}`        |
| `GET /api/logs`                     | both | 200 `{"logs":[…]}`                                 |
| `DELETE /api/logs`                  | both | 200 `{"ok":true}`                                  |
| `GET /api/auth/login`               | OIDC | 30x → `https://idp.xaa.dev/authorize?...` with PKCE+state+nonce **and `offline_access` in scope** |
| `GET /api/auth/login`               | SAML | 30x → `https://idp.xaa.dev/saml/sso?...` with `SAMLRequest`+`RelayState`, **or** 200 with a self-POSTing form to that endpoint |
| `GET https://mcp.xaa.dev/health`    | mcp  | 200 `{"status":"healthy",…}` — confirms the fourth host is reachable before you debug your own client |

Nine probes on either path. The `offline_access` assertion on the OIDC
login probe is worth scripting explicitly:

```bash
curl -sS -i http://localhost:<port>/api/auth/login \
  | grep -io 'scope=[^& ]*' | grep -q offline_access \
  && echo "PASS offline_access" || echo "FAIL offline_access"
```

## Required end-to-end scenarios (manual, against real xaa.dev)

Run these at least once with real credentials before declaring the build
done. E1–E6 apply to both paths; E7 is SAML-only.

### E1 — Successful flow

| # | Action                                             | Expected                                            |
| - | -------------------------------------------------- | --------------------------------------------------- |
| 1 | Open `${APP_URL}`.                                 | Redirect to `/login`.                               |
| 2 | Click sign-in.                                     | Redirect to xaa.dev (consent on OIDC, login on SAML).|
| 3 | Approve / authenticate.                            | Redirect back to `/dashboard`.                      |
| 4 | Confirm authenticated user card.                   | Email, name, and the subject — `sub` (OIDC) or `sub_id.nameid` (SAML). |
| 5 | Confirm token state card.                          | **Refresh token present, redacted.** Scopes listed. Expiry shown as unknown, not invented. |
| 6 | View page source.                                  | **No raw token anywhere.**                          |
| 7 | Click "Call protected resource".                   | Spinner → 200 alert.                                |
| 8 | Inspect success alert.                             | HTTP 200, ms duration, redacted ID-JAG + access token, scope badges, JSON body. |
| 9 | Inspect observability log.                         | `auth → token-exchange(step=1) → jwt-bearer(step=2) → resource-call (200)`. SAML adds an earlier `saml → token-exchange(step=0b)` pair. |

### E2 — Unauthorized flow

| # | Action                                                                   | Expected                                          |
| - | ------------------------------------------------------------------------ | ------------------------------------------------- |
| 1 | Without a session: `curl -sS -X POST ${APP_URL}/api/call`.               | 401 + `{"ok":false,"error":"unauthorized",…}`     |
| 2 | Without a cookie, `GET /dashboard`.                                      | 30x → `/login`.                                   |

### E3 — Invalid token flow

Two ways to simulate:

1. **Audience drift** — set `RESOURCE_URL=https://wrong.example.com` in
   `.env.local`. Step 1 mints an ID-JAG with a wrong `resource` claim;
   the auth server rejects it on Step 2.
2. **Tampered ID-JAG** — flip one byte of the ID-JAG between Steps 1 and
   2. Signature validation fails at the auth server.

| # | Action                                                | Expected                                          |
| - | ----------------------------------------------------- | ------------------------------------------------- |
| 1 | Apply one of the simulations above.                   | —                                                 |
| 2 | Call protected resource.                              | Error view shows "Invalid token" with the upstream `error_description` and `upstream_step`. |
| 3 | Re-authenticate link visible.                         | Click → login re-runs the flow.                   |

### E4 — Dead refresh token (rewritten for v3)

> **This replaces v2's "expired ID Token" scenario.** With a refresh
> token as the anchor there is no ID Token expiry cliff to wait for, so
> the meaningful failure is a refresh token the IdP won't accept.

| # | Action                                                                     | Expected                                                   |
| - | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1 | Log in normally.                                                           | OK; refresh token stored.                                  |
| 2 | Corrupt the stored refresh token — flip a character in your session store, or point `IDP_URL` at a mock issuer that returns `invalid_grant`. | — |
| 3 | Call protected resource.                                                   | Step 1 returns `invalid_grant`. UI shows `expired_token` with `upstream_step: "step1"` and **a sign-in link, not a retry button**. |
| 4 | Watch the log.                                                             | **Exactly one** Step 1 attempt. No retry loop. (This is D-19.) |
| 5 | Click sign-in.                                                             | Full re-auth. On SAML that's Step 0 **and** Step 0b.       |

Because xaa.dev has no revocation endpoint, you cannot revoke a real
refresh token to test this — corrupting the stored copy or mocking the
IdP are the available routes.

### E5 — API failure flow

| # | Action                                                                   | Expected                                              |
| - | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1 | In `.env.local` set `RESOURCE_URL=http://localhost:9999` (nothing bound). | —                                                     |
| 2 | Restart, log in, call.                                                   | Error view shows "Resource server error" / `resource_failure` with a network-error description. |
| 3 | Restore `RESOURCE_URL`. Set `RESOURCE_PATH=/api/does-not-exist`.          | Resource returns 404; UI shows `resource_failure` with status 404. |

### E6 — Refresh works (new in v3)

**The scenario that proves the v3 design.** A build that re-logs the user
in on every access-token expiry fails here while passing E1.

| # | Action                                                              | Expected                                                          |
| - | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1 | Log in once. Note the time.                                         | Refresh token stored.                                             |
| 2 | Call protected resource. Note the ID-JAG's `head…tail`.             | 200.                                                              |
| 3 | Clear the log (`DELETE /api/logs`).                                 | Empty buffer.                                                     |
| 4 | Wait ≥6 minutes (past the ID-JAG's 5-minute life), then call again. | 200. **A different ID-JAG** — it was re-minted, not reused.       |
| 5 | Inspect the log.                                                    | `token-exchange(step=1) → jwt-bearer(step=2) → resource-call`. **No `auth` line.** No redirect to `/login`. |
| 6 | Confirm `/api/auth/session` still reports the refresh token.        | Present, and — unless xaa.dev rotated it — the same redacted value. |
| 7 | Wait past ~10 minutes from login and call once more.                | Still 200. This is past the ID Token's life, proving you are not anchored on it. |

Step 7 is the decisive one. If it fails, you are still using the ID Token
as the `subject_token` on Step 1 — it should be the refresh token.

### E7 — SAML end-to-end (new in v3, SAML path only)

| # | Action                                                        | Expected                                                                 |
| - | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 | Confirm the IdP advertises `saml2` as a subject token type.    | `curl -sS https://idp.xaa.dev/.well-known/openid-configuration \| grep -o 'token-type:saml2'` |
| 2 | Click sign-in.                                                | Land on the xaa.dev SAML login page via `/saml/sso`.                     |
| 3 | Authenticate.                                                 | Cross-site **POST** arrives at `SAML_ACS_URL`.                            |
| 4 | Inspect the log for validation.                               | Signature OK, `InResponseTo` matched, `RelayState` matched, audience OK.  |
| 5 | Inspect the log for Step 0b.                                  | `token-exchange step=0b` with `subject_token_type=…saml2` and `requested_token_type=…refresh_token` → returns a refresh token. |
| 6 | Confirm the assertion was discarded.                          | Not present in the session; session size well under any cookie limit.    |
| 7 | Call protected resource, then decode the ID-JAG payload.      | Carries `sub_id` with `"format": "saml-nameid"`, an `issuer`, and a `nameid`. |
| 8 | Confirm the dashboard renders the SAML subject.               | `nameid` shown; `issuer` and `sp_name_qualifier` (if present) visible as detail. |
| 9 | Run E6 on this path.                                          | Refresh works identically. **Step 0b does not re-run** — it happened once, at login. |

Step 9 matters: the refresh path is identical on both protocols, so a
SAML build must not re-do SSO or Step 0b to get a new ID-JAG. If it
does, the refresh token isn't being used as the anchor.

### E8 — MCP end-to-end (new in v3, `APP_TYPE=mcp` only)

| # | Action                                                        | Expected                                                                 |
| - | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 | Confirm the MCP server is up: `curl -sS https://mcp.xaa.dev/health` | `{"status":"healthy","service":"mcp-server",…}` — unauthenticated. |
| 2 | Confirm it rejects anonymous access: `curl -sS -i -X POST https://mcp.xaa.dev/mcp` | `401` + a JSON-RPC `-32000` envelope + `WWW-Authenticate: Bearer resource_metadata=…` |
| 3 | Log in, then call the protected resource.                      | 200-equivalent: `initialize` succeeds.                                   |
| 4 | Inspect the log for the negotiated version.                    | **`2025-03-26`** — from `MCP_PROTOCOL_VERSION`, not an SDK default.       |
| 5 | Inspect `resources/list`.                                      | `todo0://todos`, `todo0://todos/completed`, `todo0://todos/incomplete`.   |
| 6 | Inspect `resources/read` on `todo0://todos`.                   | Contents render in the resource viewer.                                  |
| 7 | **Grep the whole request log for discovery traffic.**          | **No** request to any `/.well-known/…`, no DCR `POST`, no redirect, and nothing addressed to `authorization-server:5001`. Only `MCP_SERVER_URL`. |
| 8 | Drop `mcp.access` from `RESOURCE_SCOPES`, restart, call again.  | Step 2 still succeeds; the MCP server now 401s. UI shows `invalid_token` / `insufficient_scope` with `upstream_step: "step3"` — **not** a login redirect. Restore the scope afterwards. |
| 9 | Run E6 on this path.                                           | Refresh works identically. `initialize` re-runs per call; **login does not.** |

**Step 7 is the one that matters.** It's the only check that proves the
architecture — that the kit minted the token and the SDK merely used it.
Everything else can pass while the SDK quietly runs its own OAuth.

Step 8 is worth doing once: it's the fastest way to see the two-401
distinction in practice, and it's the failure most MCP builds hit first.

## Output (capabilities, not files)

| Capability                        | Notes                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Hermetic suite                    | All required rows for your path, no live network.                 |
| Test setup hook                   | Populates all env vars — including `XAA_PROTOCOL` — before any module loads config. |
| Discovery cache reset             | Test helpers that flush cached OIDC metadata, SAML metadata, and resource-AS metadata between tests. |
| Smoke probe script (optional)     | A bash/just/make recipe that runs the 9 live boot probes.         |
| Manual E1–E7 doc                  | A `testing/test-cases.md` capturing the steps above for replay.   |

## Verification

```bash
<your test command>
# Expect: the required rows for your path pass, no network used.

<your dev command>     # in another shell
# Then run all 9 smoke probes; all should return the expected status codes.

# Then walk E1, and E6. E6 is the one that proves v3.
```

Capture the test output in your repo's `FINAL_VALIDATION.md` so a
reviewer can see the suite passing without re-running it. Note which
path you built — a reviewer can't tell from the output alone.
