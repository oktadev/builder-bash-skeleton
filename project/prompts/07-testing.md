# 07 — Testing strategy

## Prompt

> Set up Vitest with mocked HTTP for the OIDC + token-exchange + resource
> layers. Cover all five required scenarios:
>
> 1. **Successful flow** — authenticated user retrieves the resource.
> 2. **Unauthorized flow** — unauthenticated `/api/call` is rejected.
> 3. **Invalid token flow** — malformed token surfaces `invalid_token`.
> 4. **Expired token flow** — expired token surfaces `expired_token` and
>    the UI prompts re-auth.
> 5. **API failure flow** — 5xx / network error surfaces `resource_failure`.
>
> Plus unit coverage for `loadConfig`, `logger` (incl. redaction),
> `jwtExpiry`, `cn`, and the OIDC URL builder. The suite must run hermetic
> (no real network) by stubbing `globalThis.fetch`.

## Objective

Lock the behaviour in tests so a refactor or upstream `openid-client`
upgrade can't silently break the spec contracts (grant types, token types,
audience/resource params).

## Output

| File                              | What it covers                                                     |
| --------------------------------- | ------------------------------------------------------------------ |
| `vitest.config.ts`                | Node env, alias `@→.`, setup file.                                 |
| `tests/setup.ts`                  | Populates the 11 env vars `loadConfig()` needs.                    |
| `tests/config.test.ts`            | Required-var enforcement; scope list parsing.                      |
| `tests/logger.test.ts`            | Token redaction (long/short/missing); buffer FIFO at 200.          |
| `tests/utils.test.ts`             | `jwtExpiry` (valid / no exp / non-JWT / undefined); `cn`.          |
| `tests/oidc.test.ts`              | Login URL has PKCE S256, state, nonce, redirect_uri, scope.        |
| `tests/token-exchange.test.ts`    | Two-step flow; spec-correct grant types and parameters; error propagation. |
| `tests/resource-call.test.ts`     | All 8 outcome paths through `callProtectedResource`.               |

## Decisions

- **Stub `globalThis.fetch` per-test**, not via msw. The flow only needs
  4 endpoints (2× discovery, 2× token, 1× resource), so a regex-matching
  stub is simpler than spinning up msw and avoids an extra dependency.
- **Reset OIDC discovery cache between tests** (`__resetOidcCache()`)
  because `openid-client` caches the resolved Configuration globally per
  module and our mocked discovery doc differs per test scenario.
- **Lazy imports inside tests** so the mocked fetch is in place before
  `openid-client` runs `discovery()`.

## Verification

```
$ npx vitest run

 ✓ tests/config.test.ts        (3 tests)
 ✓ tests/logger.test.ts        (5 tests)
 ✓ tests/utils.test.ts         (5 tests)
 ✓ tests/oidc.test.ts          (1 test)
 ✓ tests/token-exchange.test.ts (2 tests)
 ✓ tests/resource-call.test.ts (8 tests)

 Test Files  6 passed (6)
      Tests  25 passed (25)
   Duration  237ms
```

End-to-end against the real xaa.dev playground requires registered
credentials and is documented as a manual procedure in
`testing/test-cases.md`.
