# Test plan

## Scope

Validate the Next.js XAA Requesting App against the five required
scenarios from the task brief, plus the supporting unit-level guarantees
that make those scenarios meaningful.

## Layers under test

```
Browser ──▶ Next.js page (RSC)        ┐
                                       ├─▶ /api/auth/login    ┐
Browser ──▶ Next.js client component  ─┤   /api/auth/callback ├──▶ openid-client
                                       │   /api/auth/logout   │      ├─▶ IdP discovery
                                       │   /api/auth/session  │      └─▶ Authorization Code + PKCE
                                       │   /api/call          ├──▶ token-exchange (RFC 8693)
                                       │   /api/logs          └──▶ jwt-bearer (RFC 7523)
                                       │                              └─▶ resource fetch
                                       │
                                       └─▶ in-memory log buffer
```

## Test surfaces

| Layer                    | Method                                | Suite                                 |
| ------------------------ | ------------------------------------- | ------------------------------------- |
| Config validation        | Vitest unit                           | `tests/config.test.ts`                |
| Logger / redaction       | Vitest unit                           | `tests/logger.test.ts`                |
| Utility helpers          | Vitest unit                           | `tests/utils.test.ts`                 |
| OIDC URL builder         | Vitest with mocked discovery          | `tests/oidc.test.ts`                  |
| Token exchange flow      | Vitest with mocked /token endpoints   | `tests/token-exchange.test.ts`        |
| Resource call + mapping  | Vitest with mocked resource           | `tests/resource-call.test.ts`         |
| HTTP routes (live boot)  | curl against `next dev`               | This document, **Live boot** section  |
| End-to-end on xaa.dev    | Manual browser flow                   | `testing/test-cases.md` § Manual E2E  |

## Strategy

1. **Hermetic by default.** All automated tests stub `globalThis.fetch`
   so the suite runs offline.
2. **Live boot smoke test.** `next dev` is started against the real
   xaa.dev IdP URL with placeholder client credentials. We assert the
   pages compile and the routes return the expected HTTP status codes.
3. **Manual end-to-end.** Tests that depend on real xaa.dev-issued
   credentials (full sign-in + access-token mint + resource fetch) are
   documented as reproducible manual steps in `test-cases.md`. They are
   not automated because (a) we don't ship credentials and (b) the real
   xaa.dev IdP would require browser interaction to consent.

## Pass criteria

| Type           | Criterion                                             |
| -------------- | ----------------------------------------------------- |
| Vitest         | `npx vitest run` → 25/25 pass.                        |
| Typecheck      | `npx tsc --noEmit` → exit 0.                          |
| Live boot      | `next dev` ready in <2s; routes return as documented. |
| Manual E2E     | All four scenarios in `test-cases.md` reproduced.     |

## Live boot — recorded results

Run from `/Users/sohail.pathan/xaa-dev/project/`:

```bash
cp .env.example .env.local         # placeholder real-xaa.dev URLs, fake creds
npx next dev -p 3010 &             # ✓ Ready in 225ms (Next.js 16.2.6, Turbopack)

curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/
# → 307 (redirects to /login when no session)

curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/login
# → 200

curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/dashboard
# → 307 (gates by session — redirects to /login)

curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/logs
# → 200

curl -sS http://localhost:3010/api/auth/session
# → {"authenticated":false}

curl -sS -X POST http://localhost:3010/api/call
# → 401 {"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}

curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/api/auth/login
# → 307 (redirect to https://idp.xaa.dev/...?code_challenge=…&state=…&nonce=…)
```

All status codes match expectations. The login redirect was successfully
built against `https://idp.xaa.dev` discovery — proving the real xaa.dev
IdP responds to discovery as expected.
