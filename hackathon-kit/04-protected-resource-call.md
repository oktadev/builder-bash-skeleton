# 04 — Protected resource call + error mapping

## Prompt

> Implement the protected-resource layer that ties the XAA flow to a
> real HTTP fetch and gives the UI a stable error contract.
>
> 1. **`POST /api/call`** is session-gated. If no session (or no refresh
>    token in it) → `{ok:false, error:"unauthorized"}` (HTTP 401).
> 2. With a session: run `exchangeForResourceAccessToken()` from 03 with
>    the session's **refresh token**, then
>    `GET https://api.resource.xaa.dev${RESOURCE_PATH}`
>    (default `RESOURCE_PATH=/api/todos`; BYOR overrides the host) with:
>      - `Authorization: Bearer <access_token>`
>      - `Accept: application/json`
> 3. Map upstream outcomes into a stable `ApiError | CallResult` shape
>    per `reference/error-mapping.md` § ErrorCode set.
> 4. Decode `WWW-Authenticate: Bearer error="…"` per
>    `reference/error-mapping.md` § Decoding `WWW-Authenticate`.
> 5. Map upstream OAuth errors thrown by the token-exchange layer per
>    the same reference's § Token-exchange failure decoding. **Carry
>    `upstream_step`** (`step1` / `step2` / `step3`) into
>    `details` — the next rule depends on it.
> 6. **Implement the re-mint-vs-re-authenticate rule.** `expired_token`
>    means two operationally different things:
>
>    | Raised at | What expired | What you do |
>    | --------- | ------------ | ----------- |
>    | **Step 3** (401, description mentions expired) | the access token | **Re-mint once.** Re-run Steps 1 + 2 and retry the fetch a single time. Return the retry's outcome. |
>    | **Step 1** (`invalid_grant`) | the **refresh token** | **Re-authenticate.** Return `expired_token` with a `requiresReauth: true` hint so the UI sends the user to `/login`. Do not retry. |
>
>    **Retry exactly once** on the Step 3 path. If a freshly minted
>    access token is *also* rejected as expired, the cause is clock skew
>    or misconfiguration, not expiry — surface it instead of looping.
>    Guard this with a counter, not recursion.
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
| Single-retry re-mint on Step 3 expiry | Bounded by a counter. Never recursive, never a loop.           |
| `requiresReauth` flag               | Set when Step 1 rejects the refresh token. The UI's cue to offer sign-in rather than retry. |
| `/api/call` route                   | Session-gated. Maps `ErrorCode → HTTP`. Always returns JSON.     |
| `/api/logs` route                   | GET returns the ring buffer; DELETE clears it.                   |

## Decisions to make

- **Tagged union shape.** Use `ok: true` and `ok: false` as **literals**
  (not just `boolean`) so type systems with discriminated unions can
  narrow on it. In dynamically-typed languages this is just convention
  but it pays off when serialising/deserialising at the boundary.
- **Where to attach `details`.** Include `upstream_status`,
  `upstream_error`, `upstream_description`, and `upstream_step` only on
  the `ok: false` branch. The frontend uses these for diagnostic alerts,
  and `upstream_step` is what makes `expired_token` actionable.
- **Whether to surface the retry.** If the Step 3 re-mint retry
  succeeds, you have a choice: return plain `ok: true`, or return
  `ok: true` with a `remintedAfterExpiry: true` marker. Prefer the
  marker — it makes E6 observable and stops a silently-working retry
  from looking like a first-try success in the log.

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
| 401 + `error="invalid_token"` description=expired, retry succeeds | `ok: true`; exactly **two** Step-1/2 rounds observed |
| 401 + `error="invalid_token"` description=expired, retry also 401 | `expired_token`; exactly **two** rounds, no third |
| 401 + `error="invalid_token"` description=signature | `invalid_token`           |
| 401 (generic, no `error=` in WWW-Authenticate)      | `unauthorized`            |
| 403 + `error="insufficient_scope"`                  | `insufficient_scope`      |
| Network error (TCP refused / DNS / timeout)         | `resource_failure`        |
| 5xx upstream                                        | `resource_failure`        |
| IdP returns `invalid_grant` on Step 1               | `expired_token`, `upstream_step: "step1"`, `requiresReauth: true`, and **no retry attempted** |
| Auth server returns `invalid_grant` on Step 2       | `expired_token`, `upstream_step: "step2"` |
| Session exists but holds no refresh token           | `unauthorized`            |

Live curl:

```bash
curl -sS -X POST http://localhost:<port>/api/call
# Expect: 401 {"ok":false,"error":"unauthorized","message":"Not authenticated. Log in first."}
```

End-to-end: with a real session, `POST /api/call` returns
`{ok:true, response:{status:200, body:{…}}, tokens:{idJag:"head…tail",
accessToken:"head…tail", scopes:["…"]}}`.
