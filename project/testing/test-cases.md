# Test cases

## Automated — Vitest (hermetic, no network)

Run with `npx vitest run`. All 25 tests must pass.

### TC-A1 — config.test.ts

| ID    | Case                                                  | Expected                              |
| ----- | ----------------------------------------------------- | ------------------------------------- |
| A1.1  | All env vars set                                      | `loadConfig()` returns full config    |
| A1.2  | `CLIENT_SECRET` missing                               | Throws `Missing required env var: CLIENT_SECRET` |
| A1.3  | `RESOURCE_SCOPES=" a , b ,, c "` (whitespace + empty) | Returns `['a','b','c']`               |

### TC-A2 — logger.test.ts

| ID    | Case                                       | Expected                              |
| ----- | ------------------------------------------ | ------------------------------------- |
| A2.1  | Long token redaction                       | `head…tail` shape                     |
| A2.2  | Short token (≤16 chars) redaction          | `***`                                 |
| A2.3  | `undefined` token                          | `undefined`                           |
| A2.4  | Field-name regex covers `idJag`/`assertion`/`access_token` | Redacted; non-matching fields preserved |
| A2.5  | Buffer cap at 200, FIFO                    | Length=200, oldest=m50, newest=m249    |

### TC-A3 — utils.test.ts

| ID    | Case                                | Expected                                |
| ----- | ----------------------------------- | --------------------------------------- |
| A3.1  | Valid JWT with `exp` claim          | Returns ISO timestamp matching exp*1000 |
| A3.2  | `undefined` token                   | `undefined`                             |
| A3.3  | Non-JWT string                      | `undefined`                             |
| A3.4  | JWT without `exp`                   | `undefined`                             |
| A3.5  | `cn('px-2','px-4')`                 | `'px-4'`                                |

### TC-A4 — oidc.test.ts

| ID    | Case                              | Expected                                                              |
| ----- | --------------------------------- | --------------------------------------------------------------------- |
| A4.1  | `buildLoginUrl()` with mocked IdP | URL contains client_id, redirect_uri, openid scope, S256 challenge, state, nonce |

### TC-A5 — token-exchange.test.ts

| ID    | Case                                   | Expected                              |
| ----- | -------------------------------------- | ------------------------------------- |
| A5.1  | Happy-path two-step exchange           | Both `/token` POSTs, correct grant types and parameters, returns `{idJag, accessToken, scopes}` |
| A5.2  | IdP returns `invalid_grant`            | Throws (mapped to `expired_token` upstream by resource-call) |

### TC-A6 — resource-call.test.ts (the five required scenarios + bonuses)

| ID    | Case (required scenario)                              | Expected ErrorCode    |
| ----- | ----------------------------------------------------- | --------------------- |
| A6.1  | **Successful flow** — 200 with body                   | `ok: true`, body propagated |
| A6.2  | **Expired token flow** — 401 `error="invalid_token"` desc=expired | `expired_token`        |
| A6.3  | **Invalid token flow** — 401 `error="invalid_token"` desc=signature | `invalid_token`        |
| A6.4  | **Unauthorized flow** — 401 generic                   | `unauthorized`         |
| A6.5  | 403 insufficient_scope                                | `insufficient_scope`   |
| A6.6  | **API failure flow** — network error                  | `resource_failure`     |
| A6.7  | IdP `invalid_grant`                                   | `expired_token` (or `token_exchange_failure`) |
| A6.8  | **API failure flow** — 502 from resource              | `resource_failure`     |

## Live boot — curl smoke

Run after `npx next dev -p 3010`:

| ID   | Request                                     | Expected                                    |
| ---- | ------------------------------------------- | ------------------------------------------- |
| B1   | `GET /` (no session)                        | 307 → `/login`                              |
| B2   | `GET /login`                                | 200, login card HTML                        |
| B3   | `GET /dashboard` (no session)               | 307 → `/login` (gated)                      |
| B4   | `GET /logs`                                 | 200, observability page HTML                |
| B5   | `GET /api/auth/session` (no session)        | 200, `{authenticated:false}`                |
| B6   | `POST /api/call` (no session)               | 401, `{ok:false,error:"unauthorized",…}`    |
| B7   | `GET /api/auth/login` (real IDP discovery)  | 307 → `https://idp.xaa.dev/oauth2/v1/authorize?…` |
| B8   | `GET /api/logs`                             | 200, `{logs:[…]}`                           |
| B9   | `DELETE /api/logs`                          | 200, `{ok:true}`                            |

## Manual end-to-end against real xaa.dev (E1–E5)

These are the five scenarios from the task brief, validated end-to-end.
Requires registered xaa.dev credentials (free signup at
<https://xaa.dev/developer/register>).

### Pre-requisites

```bash
cd /Users/sohail.pathan/xaa-dev/project
cp .env.example .env.local
# Fill in REAL values from xaa.dev for:
#   CLIENT_ID, CLIENT_SECRET
#   RESOURCE_CLIENT_ID, RESOURCE_CLIENT_SECRET
# Generate a real session secret:
openssl rand -base64 32 | xargs -I{} echo "SESSION_SECRET={}" >> .env.local
npm run dev
```

### E1 — Successful flow

| # | Action | Expected |
| - | ------ | -------- |
| 1 | Open `http://localhost:3000`. | Redirects to `/login`. |
| 2 | Click **Log in with xaa.dev**. | Redirects to xaa.dev IdP consent. |
| 3 | Approve. | Redirects back to `/dashboard`. |
| 4 | Confirm "Authenticated user" card shows your `sub` and email. | ✓ |
| 5 | Confirm "Token state" card shows ID Token=present, exp in future. | ✓ |
| 6 | Click **Call protected resource**. | Loading spinner → success alert. |
| 7 | Success alert shows: HTTP 200, ms duration, redacted ID-JAG + access token, scope badges, JSON body. | ✓ |
| 8 | Observability log shows: `auth → token-exchange → jwt-bearer → resource-call (200)`. | ✓ |

### E2 — Unauthorized flow

| # | Action | Expected |
| - | ------ | -------- |
| 1 | Without logging in: `curl -sS -X POST http://localhost:3000/api/call`. | 401, `{ok:false,error:"unauthorized",…}` |
| 2 | Open `http://localhost:3000/dashboard` (no cookie). | 307 → `/login` |

### E3 — Invalid token flow

Simulated by injecting a tampered ID Token into the session. Two ways:

1. **Easy path** — register your client at xaa.dev with a deliberate
   audience mismatch (RESOURCE_URL doesn't match what the auth server
   was registered for). The jwt-bearer step will fail and the resource
   call layer maps it to `invalid_token`.
2. **Direct path** — set `RESOURCE_URL=https://wrong.example.com` in
   `.env.local` and re-run. The IdP will mint an ID-JAG with a wrong
   `aud`/`resource` claim; the auth server rejects it.

Expected: `<ErrorView>` shows "Invalid token" with the upstream
`error_description`, plus a `Re-authenticate` link.

### E4 — Expired token flow

| # | Action | Expected |
| - | ------ | -------- |
| 1 | Log in successfully. | OK. |
| 2 | Wait until the ID Token's `exp` passes (typically 1h on xaa.dev). | — |
| 3 | Click **Call protected resource**. | The IdP returns `invalid_grant` for the token-exchange call; the UI shows `expired_token` with a re-auth link. |

Faster simulation: in `.env.local`, point `IDP_URL` at an issuer that
returns `invalid_grant` for the next token-exchange (e.g. a paused
local mock) — the same code path is taken.

### E5 — API failure flow

| # | Action | Expected |
| - | ------ | -------- |
| 1 | In `.env.local` set `RESOURCE_URL=http://localhost:9999` (port no service is bound to). | — |
| 2 | Restart dev server, log in, click **Call**. | `<ErrorView>` shows "Resource server error" / `resource_failure`, with a network-error description. |
| 3 | Restore `RESOURCE_URL=https://api.resource.xaa.dev`. Optional: set the path to a non-existent route (e.g. `/api/does-not-exist`). | Resource returns 404; UI shows `resource_failure` with status 404. |
