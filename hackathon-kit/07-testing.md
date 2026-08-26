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

| ID    | Path  | Surface              | Case                                        | Expected                                 |
| ----- | ----- | -------------------- | ------------------------------------------- | ---------------------------------------- |
| T1.1  | both  | config               | All env vars set                            | `loadConfig()` returns full config       |
| T1.2  | both  | config               | One required var missing                    | Throws with the missing var's name       |
| T1.3  | both  | config               | Scope list with whitespace + empties        | Returns trimmed, non-empty entries       |
| T1.4  | both  | config               | `XAA_PROTOCOL=oidc` without `SAML_ACS_URL`  | **Valid** — SAML vars not required on the OIDC path |
| T1.5  | both  | config               | `XAA_PROTOCOL=saml` without `SAML_ACS_URL`  | Throws naming `SAML_ACS_URL`             |
| T1.6  | both  | config               | `XAA_PROTOCOL` unset                        | Defaults to `oidc`                       |
| T2.1  | both  | logger               | Long token redaction                        | `head…tail` shape                        |
| T2.2  | both  | logger               | Short token (≤16 chars)                     | `***`                                    |
| T2.3  | both  | logger               | `null`/`undefined` token                    | `undefined` literal                      |
| T2.4  | both  | logger               | Key regex covers `token/secret/assertion/jag/jwt` | All redacted; non-matching keys preserved |
| T2.5  | both  | logger               | Buffer cap                                  | 200 entries; FIFO eviction               |
| T2.6  | both  | logger               | `refresh_token` key                         | **Redacted** (matches on `token`)        |
| T2.7  | SAML  | logger               | `SAMLResponse` key                          | **Redacted** — does *not* match the default regex, so must be handled explicitly |
| T2.8  | SAML  | logger               | `sub_id` object                             | **Not** redacted — it's the key SAML diagnostic |
| T3.1  | OIDC  | login URL builder    | Authorize URL                               | Contains `client_id`, `redirect_uri`, `code_challenge_method=S256`, `state`, `nonce`, base64url challenge |
| T3.2  | OIDC  | login URL builder    | Scope                                       | **Contains `offline_access`**            |
| T3.3  | SAML  | AuthnRequest builder | Request                                     | Carries `RelayState`; records the request `ID`; NameID format is **not** `transient` |
| T3.4  | SAML  | assertion encoder    | Bare `<saml:Assertion>` in                  | base64url out, **no `=` padding**, no `+` or `/` |
| T3.5  | SAML  | assertion extractor  | Full `SAMLResponse` in                      | Returns only the `<saml:Assertion>` element |
| T3.6  | SAML  | Step 0b request      | Built request                               | `subject_token_type=…saml2`, `requested_token_type=…refresh_token`, scope includes `offline_access` |
| T4.1  | both  | token-exchange       | Step 1 happy path                           | Hits IdP `/token`; `subject_token_type=…refresh_token`, `requested_token_type=…id-jag`, refresh token in `subject_token`, audience, resource, scope all present |
| T4.2  | both  | token-exchange       | Step 2 happy path                           | Hits auth server `token_endpoint`; `grant_type=…jwt-bearer`, ID-JAG in `assertion`, credentials **in form body** |
| T4.3  | both  | token-exchange       | IdP `invalid_grant` on Step 1               | Throws tagged `upstream_step: "step1"`   |
| T4.4  | both  | token-exchange       | Auth server `invalid_grant` on Step 2       | Throws tagged `upstream_step: "step2"`   |
| T4.5  | both  | token-exchange       | Two credential pairs                        | Step 1 uses `CLIENT_*`, Step 2 uses `RESOURCE_CLIENT_*` |
| T4.6  | both  | token-exchange       | Discovery URL for the auth server           | Requests `oauth-authorization-server`, **not** `openid-configuration` |
| T4.7  | both  | token-exchange       | `issued_token_type` validation              | Rejects a Step 1 response whose `issued_token_type` isn't `…id-jag` |
| T5.1  | both  | resource-call        | 200 with body                               | `ok: true`, body propagated              |
| T5.2  | both  | resource-call        | 401 `invalid_token` desc=expired, retry OK  | `ok: true`; **exactly two** Step-1/2 rounds |
| T5.3  | both  | resource-call        | 401 `invalid_token` desc=signature          | `invalid_token`                          |
| T5.4  | both  | resource-call        | 401 generic (no `error=`)                   | `unauthorized`                           |
| T5.5  | both  | resource-call        | 403 `insufficient_scope`                    | `insufficient_scope`                     |
| T5.6  | both  | resource-call        | Network error                               | `resource_failure`                       |
| T5.7  | both  | resource-call        | 502 from resource                           | `resource_failure`                       |
| T5.8  | both  | resource-call        | Session exists, no refresh token            | `unauthorized`                           |
| T6.1  | both  | refresh semantics    | Refresh token survives Step 1               | Still in session after a successful exchange — **not** single-use |
| T6.2  | both  | refresh semantics    | Two sequential calls, one login             | Both succeed; login runs **once**; Step 1 runs **twice** |
| T6.3  | both  | refresh semantics    | Step 1 `invalid_grant`                      | `expired_token` + `requiresReauth: true`, and **no retry attempted** |
| T6.4  | both  | refresh semantics    | Step 3 expired twice in a row               | `expired_token`; **exactly two** rounds, no third — retry is bounded |
| T6.5  | both  | refresh semantics    | Response carries a rotated `refresh_token`  | Stored value is replaced, and the next call uses the new one |
| T7.1  | SAML  | ID-JAG claims        | Payload with `sub_id`, no `sub`             | Subject resolves from `sub_id.nameid` without throwing |
| T7.2  | SAML  | ID-JAG claims        | Two `sub_id`s, same `nameid`, different `sp_name_qualifier` | Treated as **different** subjects |
| T7.3  | OIDC  | ID-JAG claims        | Payload with plain `sub`                    | Subject resolves from `sub`              |

**Counts.** 20 path-neutral rows (T1.1–T1.6, T2.1–T2.6, T4.x, T5.x, T6.x
as applicable) plus 2 OIDC-specific (T3.1, T3.2, T7.3) or 8
SAML-specific (T2.7, T2.8, T3.3–T3.6, T7.1, T7.2). An OIDC build lands
around **36 tests**; a SAML build around **41**. Implementations may
merge or split them; what matters is each row's behaviour is asserted
somewhere.

T6.2 is the row that catches the most important v3 regression — a build
that still anchors on the ID Token passes almost everything else.

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
as the `subject_token` — see `MIGRATION-v2-to-v3.md`.

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

## Output (capabilities, not files)

| Capability                        | Notes                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Hermetic suite                    | All rows for your path above, no live network.                    |
| Test setup hook                   | Populates all env vars — including `XAA_PROTOCOL` — before any module loads config. |
| Discovery cache reset             | Test helpers that flush cached OIDC metadata, SAML metadata, and resource-AS metadata between tests. |
| Smoke probe script (optional)     | A bash/just/make recipe that runs the 9 live boot probes.         |
| Manual E1–E7 doc                  | A `testing/test-cases.md` capturing the steps above for replay.   |

## Verification

```bash
<your test command>
# Expect: all rows for your path pass, no network used.

<your dev command>     # in another shell
# Then run all 9 smoke probes; all should return the expected status codes.

# Then walk E1, and E6. E6 is the one that proves v3.
```

Capture the test output in your repo's `FINAL_VALIDATION.md` so a
reviewer can see the suite passing without re-running it. Note which
path you built — a reviewer can't tell from the output alone.
