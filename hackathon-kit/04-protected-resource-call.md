# 04 — Protected resource call + error mapping

## Prompt

> Implement the protected-resource layer that ties the XAA flow to a
> real HTTP fetch and gives the UI a stable error contract.
>
> 1. **`POST /api/call`** is session-gated. If no session →
>    `{ok:false, error:"unauthorized"}` (HTTP 401).
> 2. With a session: run `exchangeForResourceAccessToken()` from 03,
>    then `GET https://api.resource.xaa.dev${RESOURCE_PATH}`
>    (default `RESOURCE_PATH=/api/todos`; BYOR overrides the host) with:
>      - `Authorization: Bearer <access_token>`
>      - `Accept: application/json`
> 3. Map upstream outcomes into a stable `ApiError | CallResult` shape
>    per `reference/error-mapping.md` § ErrorCode set.
> 4. Decode `WWW-Authenticate: Bearer error="…"` per
>    `reference/error-mapping.md` § Decoding `WWW-Authenticate`.
> 5. Map upstream OAuth errors thrown by the token-exchange layer per
>    the same reference's § Token-exchange failure decoding.
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

## Objective

Give the UI a stable, parseable error shape regardless of which layer
of the chain (IdP / auth-server / resource) failed.

## Output (capabilities, not files)

| Capability                          | Notes                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| `callProtectedResource()`           | Orchestration + error mapping. Returns a tagged union — `ok: true` on success, `ok: false` plus an `error: ErrorCode` on failure. |
| `/api/call` route                   | Session-gated. Maps `ErrorCode → HTTP`. Always returns JSON.     |
| `/api/logs` route                   | GET returns the ring buffer; DELETE clears it.                   |

## Decisions to make

- **Tagged union shape.** Use `ok: true` and `ok: false` as **literals**
  (not just `boolean`) so type systems with discriminated unions can
  narrow on it. In dynamically-typed languages this is just convention
  but it pays off when serialising/deserialising at the boundary.
- **Where to attach `details`.** Include `upstream_status`,
  `upstream_error`, `upstream_description` only on the `ok: false`
  branch. The frontend uses these for diagnostic alerts.

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

Hermetic tests for `callProtectedResource()` must cover all eight
outcome paths (mock the fetch, not the network):

| Scenario                                            | Expected                  |
| --------------------------------------------------- | ------------------------- |
| 200 OK with body                                    | `ok: true`, body propagated |
| 401 + `error="invalid_token"` description=expired   | `expired_token`           |
| 401 + `error="invalid_token"` description=signature | `invalid_token`           |
| 401 (generic, no `error=` in WWW-Authenticate)      | `unauthorized`            |
| 403 + `error="insufficient_scope"`                  | `insufficient_scope`      |
| Network error (TCP refused / DNS / timeout)         | `resource_failure`        |
| 5xx upstream                                        | `resource_failure`        |
| IdP returns `invalid_grant` on Step 1               | `expired_token`           |

Live curl:

```bash
curl -sS -X POST http://localhost:<port>/api/call
# Expect: 401 {"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}
```

End-to-end: with a real session, `POST /api/call` returns
`{ok:true, response:{status:200, body:{…}}, tokens:{idJag:"head…tail",
accessToken:"head…tail", scopes:["…"]}}`.
