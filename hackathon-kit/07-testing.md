# 07 — Testing

## Prompt

> Set up a hermetic test suite (no live network) for the four
> behavioural cores: config, logger, OIDC URL builder, and the resource
> call layer. Plus the five mandatory end-to-end scenarios as
> documented manual procedures. Use whatever test runner is idiomatic
> in your stack (pytest / vitest / go test / JUnit / RSpec / xUnit / etc.).
>
> The hermetic suite must:
>
> 1. Stub the HTTP client at the boundary (the function your stack
>    uses to issue HTTP calls). Match by URL pattern; assert the
>    request body, headers, and method.
> 2. Reset any cached OIDC discovery between tests, since each
>    scenario uses a different mocked discovery doc.
> 3. Populate the env vars (3 fixed xaa.dev hosts + 9 per-developer)
>    in a setup hook before importing any config-using module.

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
fields, error mapping, redaction shape) in tests so a refactor or an
upstream library upgrade can't silently break them. Plus prove the
five mandatory user-facing scenarios produce five distinct outcomes.

## Required hermetic test cases

| ID    | Surface              | Case                                        | Expected                                 |
| ----- | -------------------- | ------------------------------------------- | ---------------------------------------- |
| T1.1  | config               | All env vars set                            | `loadConfig()` returns full config       |
| T1.2  | config               | One required var missing                    | Throws with the missing var's name       |
| T1.3  | config               | Scope list with whitespace + empties        | Returns trimmed, non-empty entries       |
| T2.1  | logger               | Long token redaction                        | `head…tail` shape                        |
| T2.2  | logger               | Short token (≤16 chars)                     | `***`                                    |
| T2.3  | logger               | `null`/`undefined` token                    | `undefined` literal                      |
| T2.4  | logger               | Key regex covers `token/secret/assertion/jag/jwt` | All redacted; non-matching keys preserved |
| T2.5  | logger               | Buffer cap                                  | 200 entries; FIFO eviction               |
| T3.1  | OIDC URL builder     | Login URL                                   | Contains `client_id`, `redirect_uri`, `scope=openid`, `code_challenge_method=S256`, `state`, `nonce`, base64url challenge |
| T4.1  | token-exchange       | Happy path                                  | Both `/token` calls; correct grant types + parameters |
| T4.2  | token-exchange       | IdP `invalid_grant`                         | Throws (mapped upstream to `expired_token`) |
| T5.1  | resource-call        | 200 with body                               | `ok: true`, body propagated              |
| T5.2  | resource-call        | 401 `invalid_token` desc=expired            | `expired_token`                          |
| T5.3  | resource-call        | 401 `invalid_token` desc=signature          | `invalid_token`                          |
| T5.4  | resource-call        | 401 generic (no `error=`)                   | `unauthorized`                           |
| T5.5  | resource-call        | 403 `insufficient_scope`                    | `insufficient_scope`                     |
| T5.6  | resource-call        | Network error                               | `resource_failure`                       |
| T5.7  | resource-call        | 502 from resource                           | `resource_failure`                       |
| T5.8  | resource-call        | IdP `invalid_grant` upstream                | `expired_token`                          |

That's 18 hermetic tests. Implementations may merge or split them;
what matters is each row's behavior is asserted somewhere.

## Required smoke tests (live boot, no network)

After your dev server boots, these probes must produce the documented
responses:

| Request                             | Expected                                           |
| ----------------------------------- | -------------------------------------------------- |
| `GET /` (no session)                | 30x → `/login`                                     |
| `GET /login`                        | 200 with sign-in markup                            |
| `GET /dashboard` (no session)       | 30x → `/login` (gated)                             |
| `GET /logs`                         | 200 with observability page                        |
| `GET /api/auth/session` (no session)| 200 `{"authenticated":false}`                      |
| `POST /api/call` (no session)       | 401 `{"ok":false,"error":"unauthorized",…}`        |
| `GET /api/auth/login`               | 30x → `https://idp.xaa.dev/authorize?...` with PKCE+state+nonce |
| `GET /api/logs`                     | 200 `{"logs":[…]}`                                 |
| `DELETE /api/logs`                  | 200 `{"ok":true}`                                  |

## Required end-to-end scenarios (manual, against real xaa.dev)

These are the five mandatory scenarios from the brief. Run them at
least once with real credentials before declaring the build done.

### E1 — Successful flow

| # | Action                                             | Expected                                            |
| - | -------------------------------------------------- | --------------------------------------------------- |
| 1 | Open `${APP_URL}`.                                 | Redirect to `/login`.                               |
| 2 | Click sign-in.                                     | Redirect to xaa.dev consent.                        |
| 3 | Approve.                                           | Redirect back to `/dashboard`.                      |
| 4 | Confirm authenticated user card.                   | `sub`, `email`, `name` shown.                       |
| 5 | Confirm token state card.                          | ID Token=present, ISO `exp` in the future, scopes.  |
| 6 | Click "Call protected resource".                   | Spinner → 200 alert.                                |
| 7 | Inspect success alert.                             | HTTP 200, ms duration, redacted ID-JAG + access token, scope badges, JSON body. |
| 8 | Inspect observability log.                         | `auth → token-exchange → jwt-bearer → resource-call (200)`. |

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
2. **Tampered ID Token** — replace one byte of the stored ID Token in
   the session before calling. Step 1's `subject_token` validation
   fails.

| # | Action                                                | Expected                                          |
| - | ----------------------------------------------------- | ------------------------------------------------- |
| 1 | Apply one of the simulations above.                   | —                                                 |
| 2 | Call protected resource.                              | `<ErrorView>` shows "Invalid token" with the upstream `error_description`. |
| 3 | Re-authenticate link visible.                         | Click → `/api/auth/login` re-runs the flow.       |

### E4 — Expired token flow

| # | Action                                                | Expected                                                   |
| - | ----------------------------------------------------- | ---------------------------------------------------------- |
| 1 | Log in.                                               | OK.                                                        |
| 2 | Wait for the ID Token's `exp` (typically 1 h).        | —                                                          |
| 3 | Call protected resource.                              | IdP returns `invalid_grant` for Step 1; UI shows `expired_token` with re-auth link. |

Faster simulation: point `IDP_URL` at a local mock issuer that returns
`invalid_grant` for `subject_token`, or shorten the ID Token's
lifetime at registration on xaa.dev if your client allows it.

### E5 — API failure flow

| # | Action                                                                   | Expected                                              |
| - | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| 1 | In `.env.local` set `RESOURCE_URL=http://localhost:9999` (nothing bound). | —                                                     |
| 2 | Restart, log in, call.                                                   | `<ErrorView>` shows "Resource server error" / `resource_failure` with a network-error description. |
| 3 | Restore `RESOURCE_URL`. Set `RESOURCE_PATH=/api/does-not-exist`.          | Resource returns 404; UI shows `resource_failure` with status 404. |

## Output (capabilities, not files)

| Capability                        | Notes                                                            |
| --------------------------------- | ---------------------------------------------------------------- |
| Hermetic suite                    | All 18 cases above, no live network.                             |
| Test setup hook                   | Populates all env vars before any module loads config.           |
| OIDC discovery cache reset        | A test helper that flushes the cached discovery between tests.   |
| Smoke probe script (optional)     | A bash/just/make recipe that runs the 9 live boot probes.        |
| Manual E1–E5 doc                  | A `testing/test-cases.md` capturing the steps above for replay.  |

## Verification

```bash
<your test command>
# Expect: 18 tests pass, no network used.

<your dev command>     # in another shell
# Then run all 9 smoke probes; all should return the expected status codes.

# Then walk E1 manually.
```

Capture the test output in your repo's `FINAL_VALIDATION.md` so a
reviewer can see the suite passing without re-running it.
