# Error mapping — single source of truth

The XAA flow can fail at four layers (login / token-exchange / jwt-bearer
/ resource fetch). The UI needs **one stable contract** so it can render
distinct error states regardless of where the failure originated.

---

## ErrorCode set

| Code                     | When                                                                                  | HTTP to client | UX hint                                                |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| `unauthorized`           | No session, or session expired client-side, or 401 with no `error=` param.            | 401            | "Sign in"                                              |
| `invalid_token`          | 401 + `WWW-Authenticate: Bearer error="invalid_token"`, description ≠ expired.        | 401            | "Token rejected — re-authenticate"                     |
| `expired_token`          | 401 + `WWW-Authenticate: Bearer error="invalid_token"`, description contains expired. | 401            | "Session expired — re-authenticate"                    |
| `expired_token`          | Step 1 IdP returns OAuth error `invalid_grant`.                                       | 401            | (same as above — the underlying ID Token is stale)     |
| `insufficient_scope`     | 403 + `WWW-Authenticate: Bearer error="insufficient_scope"`.                          | 403            | "Missing scope — request consent for X"                |
| `resource_failure`       | Resource returns 5xx, or network error / timeout.                                     | 502            | "Resource unavailable — retry"                         |
| `token_exchange_failure` | Step 1 or Step 2 returns OAuth error other than `invalid_grant`.                      | 502            | "Auth server error — see logs"                         |
| `config_error`           | Required env var missing at request time.                                             | 500            | "Server misconfigured"                                 |
| `unknown`                | Anything not classified.                                                              | 500            | "Unexpected error — see logs"                          |

The shape of the error returned to the client:

```json
{
  "ok": false,
  "error": "<ErrorCode>",
  "message": "<short, user-safe description>",
  "details": {
    "upstream_status": 401,
    "upstream_error": "invalid_token",
    "upstream_description": "The access token expired"
  }
}
```

`details` is optional and may omit fields the upstream did not provide.

The success shape:

```json
{
  "ok": true,
  "request":  { "url": "...", "method": "GET" },
  "response": { "status": 200, "durationMs": 142, "body": { ... } },
  "tokens":   { "idJag": "head…tail", "accessToken": "head…tail", "scopes": ["todos.read"] }
}
```

`ok` is a **literal `true`** on success and a **literal `false`** on
error so type systems with discriminated unions can narrow on it. (In
dynamically typed stacks this is just a convention but it pays off
when you serialize / deserialize.)

---

## Decoding `WWW-Authenticate`

Per RFC 6750 the header looks like:

```
WWW-Authenticate: Bearer realm="…", error="invalid_token", error_description="The access token expired"
```

Parse in this order:

1. If status is **403** and `error="insufficient_scope"` → `insufficient_scope`.
2. If status is **401**:
   - No header or no `error=` param → `unauthorized`.
   - `error="invalid_token"` and `error_description` matches `/expired|exp/i` → `expired_token`.
   - `error="invalid_token"` otherwise → `invalid_token`.
   - Any other `error=` value → `invalid_token`.
3. Status **5xx** or network failure → `resource_failure`.

---

## Token-exchange failure decoding

A failure during Step 1 or Step 2 returns an OAuth 2.0 error response
(RFC 6749 § 5.2):

```json
{
  "error": "invalid_grant",
  "error_description": "subject_token expired"
}
```

| `error` value             | Maps to                                                  |
| ------------------------- | -------------------------------------------------------- |
| `invalid_grant`           | `expired_token` (the ID Token / ID-JAG is stale)         |
| `invalid_client`          | `token_exchange_failure` (credentials wrong; check which client pair you sent) |
| `unsupported_grant_type`  | `token_exchange_failure` (server doesn't recognise the grant URN — check the spelling) |
| `invalid_scope`           | `insufficient_scope`                                     |
| anything else             | `token_exchange_failure`                                 |

---

## Token redaction

Every log line that contains a token, secret, assertion, ID-JAG, or JWT
must be redacted before write:

- Strings ≤16 chars → `***`.
- Strings >16 chars → `<first 8>…<last 8>`.
- `null` / `undefined` → `undefined` (don't print empty quotes).

A simple rule that works in any language: **redact any object key that
matches `/(token|secret|assertion|jag|jwt)/i`** before serialising for
the log. Preserve all non-matching keys verbatim — they're the
diagnostically useful ones (audience, resource, scope, status,
duration).
