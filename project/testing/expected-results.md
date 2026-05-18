# Expected results

## Automated suite (`npx vitest run`)

```
 ✓ tests/config.test.ts         (3 tests)
 ✓ tests/logger.test.ts         (5 tests)
 ✓ tests/utils.test.ts          (5 tests)
 ✓ tests/oidc.test.ts           (1 test)
 ✓ tests/token-exchange.test.ts (2 tests)
 ✓ tests/resource-call.test.ts  (8 tests)

 Test Files  6 passed (6)
      Tests  25 passed (25)
   Duration  ~250 ms
```

## Typecheck (`npx tsc --noEmit`)

Exits 0 with no output.

## Live boot (`npx next dev -p 3010`)

```
▲ Next.js 16.2.6 (Turbopack)
- Local:         http://localhost:3010
- Environments: .env.local
✓ Ready in ~250 ms
```

### HTTP probes

| Request                                       | Status | Body                                                  |
| --------------------------------------------- | ------ | ----------------------------------------------------- |
| `GET /`                                       | 307    | Redirect → `/login`                                   |
| `GET /login`                                  | 200    | Login card HTML                                       |
| `GET /dashboard` (no session)                 | 307    | Redirect → `/login`                                   |
| `GET /logs`                                   | 200    | Observability page HTML                               |
| `GET /api/auth/session`                       | 200    | `{"authenticated":false}`                             |
| `POST /api/call` (no session)                 | 401    | `{"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}` |
| `GET /api/auth/login`                         | 307    | Redirect → `https://idp.xaa.dev/oauth2/v1/authorize?...` |
| `GET /api/logs`                               | 200    | `{"logs":[...]}`                                      |
| `DELETE /api/logs`                            | 200    | `{"ok":true}`                                         |

## Manual end-to-end (E1–E5 from `test-cases.md`)

### E1 — Successful flow

- Login redirect lands on the xaa.dev consent screen.
- After approval, dashboard renders with `sub`, `email`, `name`.
- Token state card shows ID Token=present, expiry timestamp, scope=`todos.read`.
- "Call protected resource" succeeds with HTTP 200.
- Resource body (Todo0 list, or BYOR equivalent) renders as JSON.
- Observability log shows the four-step lifecycle:

  ```
  [info] [auth]            Built OIDC authorization URL — redirecting to IdP
  [info] [auth]            Login successful — ID Token stored in session
  [info] [token-exchange]  POST IdP /token (RFC 8693 token-exchange → id-jag)
  [info] [token-exchange]  Received ID-JAG from IdP
  [info] [jwt-bearer]      POST AuthServer /token (RFC 7523 jwt-bearer → access_token)
  [info] [jwt-bearer]      Received resource access_token
  [info] [resource-call]   GET https://api.resource.xaa.dev/api/todos
  [info] [resource-call]   Resource responded 200
  ```

### E2 — Unauthorized

- `POST /api/call` without cookie → `{ok:false,error:"unauthorized",…}` (401).
- `GET /dashboard` without cookie → 307 → `/login`.

### E3 — Invalid token

- Resource viewer shows red "Invalid token" alert.
- Error details panel shows the upstream `error_description`.
- "Re-authenticate" link visible.

### E4 — Expired token

- Resource viewer shows amber "Token expired — please re-authenticate" alert.
- Error details panel shows `invalid_grant` or "subject_token expired".
- "Re-authenticate" link visible.
- Clicking through `/api/auth/login` and approving again restores the flow.

### E5 — API failure

- Resource viewer shows red "Resource server error" alert.
- Error details panel shows the upstream HTTP status (or `Network error: …`).
- The `Call protected resource` button can be retried without re-auth.
