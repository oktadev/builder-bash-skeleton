# 03 — Token management (XAA / ID-JAG flow)

## Prompt

> Implement the two-step Cross-App Access token-exchange flow that
> xaa.dev expects:
>
> **Step 1 — RFC 8693 Token Exchange at the IdP**
>
> ```
> POST {idp}/token
>   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
>   subject_token=<ID Token>
>   subject_token_type=urn:ietf:params:oauth:token-type:id_token
>   requested_token_type=urn:ietf:params:oauth:token-type:id-jag
>   audience=<resource auth server URL>
>   resource=<resource URL>
>   scope=<requested scopes>
> ```
>
> **Step 2 — RFC 7523 JWT-Bearer at the resource auth server**
>
> ```
> POST {auth_server}/token
>   grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
>   assertion=<ID-JAG>
>   scope=<requested scopes>
> ```
>
> Each step uses its own client credentials pair (CLIENT_ID/SECRET vs.
> RESOURCE_CLIENT_ID/SECRET). Cache the OIDC discovery for both
> endpoints. Log every step with the scope, audience, and redacted
> token values. Tokens may not be persisted — the access token is
> re-exchanged from the cached ID Token on each `/api/call`.

## Objective

Mint a fresh resource access token on demand, with full visibility into
the wire format and the two distinct auth domains.

## Output

| File                       | Notes                                                       |
| -------------------------- | ----------------------------------------------------------- |
| `lib/oidc.ts`              | Adds `getResourceAuthConfig()` mirroring the IdP discovery cache. |
| `lib/token-exchange.ts`    | `exchangeForResourceAccessToken()` orchestrates both steps. Uses `oidc.genericGrantRequest` with the spec-correct grant types. Logs each request + response. |
| `lib/logger.ts`            | In-memory ring buffer (200 entries). Token-redaction by key regex (`/token\|secret\|assertion\|jag\|jwt/i`). Mirrors to stdout for `next dev`. |
| `lib/utils.ts`             | `jwtExpiry(token)` decodes the JWT payload to surface `exp` as ISO. |

## Decisions

- **No long-term token storage.** The access token is short-lived and
  scoped. We re-mint per request from the ID Token. This is more secure
  (smaller blast radius if a session leaks) and matches xaa.dev's
  expected pattern (the ID-JAG ↔ access-token relationship is meant to
  be ephemeral).
- **Redaction.** Logger redacts any field whose key matches
  `token|secret|assertion|jag|jwt` to `head…tail` form so the log is
  diagnostically useful without exposing credentials.
- **Lazy config loading.** `loadConfig()` only runs when an API route
  needs config, so `vitest` can import `@/lib/*` without all env vars
  being present (the test setup populates them).

## Issues

- TypeScript narrowing failure: `CallResult | ApiError` was declared
  with `ok: boolean` on the success arm, which broke discrimination
  inside `if (!result.ok) result.error`. tsc reported errors in
  `app/api/call/route.ts:42`, `components/resource-viewer.tsx:75`, and
  6 sites in `tests/resource-call.test.ts`.

## Fixes

Changed `CallResult.ok: boolean` → `CallResult.ok: true`. The
discriminated union now narrows correctly under both `if (result.ok)`
and `if (!result.ok)`.

```diff
 export interface CallResult {
-  ok: boolean;
+  ok: true;
   request: { url: string; method: string };
```

## Verification

```bash
npx tsc --noEmit            # exits 0 after the fix
npx vitest run               # 25 tests pass
```

`tests/token-exchange.test.ts` asserts:
- Both `/token` endpoints are hit in the right order.
- Step 1 sends `grant_type=…token-exchange`, `requested_token_type=…id-jag`,
  the ID Token as `subject_token`, the audience, the resource, and the scope.
- Step 2 sends `grant_type=…jwt-bearer`, the ID-JAG as `assertion`, scope.
- An IdP `invalid_grant` response propagates as a thrown error.
