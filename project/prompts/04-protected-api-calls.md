# 04 — Protected API calls

## Prompt

> Implement the protected-resource layer:
>
> 1. `POST /api/call` runs the full XAA flow then `GET`s the configured
>    resource path with `Authorization: Bearer <access_token>` and
>    `Accept: application/json`.
> 2. Map upstream errors into a stable `ApiError` shape with discrete
>    codes: `unauthorized`, `invalid_token`, `expired_token`,
>    `insufficient_scope`, `resource_failure`, `token_exchange_failure`,
>    `config_error`, `unknown`. Each maps to a specific HTTP status code
>    in the JSON response.
> 3. The 401 `WWW-Authenticate: Bearer error="invalid_token"` header
>    is the signal — split into `expired_token` if the description
>    contains `expired/exp`, else `invalid_token`.
> 4. 403 → `insufficient_scope`. Network error → `resource_failure`.
> 5. Token-exchange failures upstream of the resource call are mapped
>    so the UI can render an "expired token, please re-auth" prompt.

## Objective

Give the UI a stable contract regardless of where in the chain the
failure originates (IdP / auth-server / resource), so each error
state can be rendered distinctly.

## Output

| File                        | Notes                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `lib/resource-call.ts`      | `callProtectedResource()` — orchestration + error mapping.    |
| `lib/types.ts`              | `CallResult`, `ApiError`, `ErrorCode` (8 codes).              |
| `app/api/call/route.ts`     | Session-gated. Maps `ErrorCode → HTTP status`. Returns JSON.  |
| `app/api/logs/route.ts`     | `GET` returns the buffer; `DELETE` clears it.                 |

## Error → HTTP status mapping

| ErrorCode               | HTTP |
| ----------------------- | ---- |
| `unauthorized`          | 401  |
| `invalid_token`         | 401  |
| `expired_token`         | 401  |
| `insufficient_scope`    | 403  |
| `resource_failure`      | 502  |
| `token_exchange_failure`| 502  |
| `config_error`          | 500  |
| `unknown`               | 500  |

## Issues

- See **03-token-management.md** — the discriminated union narrowing
  bug surfaced in this layer's tests too. Same fix applies.

## Fixes

n/a (covered by 03)

## Verification

`tests/resource-call.test.ts` covers all eight outcome paths with mocked
fetch:

| Scenario                                    | Expected ErrorCode      |
| ------------------------------------------- | ----------------------- |
| 200 OK with body                            | (CallResult.ok=true)    |
| 401 invalid_token + "expired"               | `expired_token`         |
| 401 invalid_token + "signature"             | `invalid_token`         |
| 401 (generic, no error= in WWW-Authenticate)| `unauthorized`          |
| 403 insufficient_scope                      | `insufficient_scope`    |
| Network error (ECONNREFUSED)                | `resource_failure`      |
| 502 upstream                                | `resource_failure`      |
| IdP returns invalid_grant                   | `expired_token`         |

Live curl:

```bash
curl -sS -X POST http://localhost:3010/api/call
# → 401 {"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}
```
