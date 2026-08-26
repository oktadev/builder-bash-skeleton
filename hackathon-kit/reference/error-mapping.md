# Error mapping — single source of truth

The XAA flow can fail at five layers (login / SAML exchange /
token-exchange / jwt-bearer / resource fetch). The UI needs **one stable
contract** so it can render distinct error states regardless of where the
failure originated.

---

## ErrorCode set

| Code                     | When                                                                                  | HTTP to client | UX hint                                                |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------ |
| `unauthorized`           | No session, or session expired client-side, or 401 with no `error=` param.            | 401            | "Sign in"                                              |
| `invalid_token`          | 401 + `WWW-Authenticate: Bearer error="invalid_token"`, description ≠ expired.        | 401            | "Token rejected — re-authenticate"                     |
| `expired_token`          | 401 + `WWW-Authenticate: Bearer error="invalid_token"`, description contains expired. | 401            | "Access token expired — retry (it re-mints)"           |
| `expired_token`          | Step 1 or Step 0b returns OAuth error `invalid_grant`.                                | 401            | "Session expired — sign in again"                      |
| `insufficient_scope`     | 403 + `WWW-Authenticate: Bearer error="insufficient_scope"`.                          | 403            | "Missing scope — request consent for X"                |
| `resource_failure`       | Resource returns 5xx, or network error / timeout.                                     | 502            | "Resource unavailable — retry"                         |
| `token_exchange_failure` | Step 0b, Step 1, or Step 2 returns an OAuth error other than `invalid_grant`.         | 502            | "Auth server error — see logs"                         |
| `config_error`           | Required env var missing at request time.                                             | 500            | "Server misconfigured"                                 |
| `unknown`                | Anything not classified.                                                              | 500            | "Unexpected error — see logs"                          |

The eight-code set is unchanged from v2. What changed is *what produces*
`expired_token`, and it now means two operationally different things —
see § The two faces of `expired_token`.

The shape of the error returned to the client:

```json
{
  "ok": false,
  "error": "<ErrorCode>",
  "message": "<short, user-safe description>",
  "details": {
    "upstream_status": 401,
    "upstream_error": "invalid_token",
    "upstream_description": "The access token expired",
    "upstream_step": "step1"
  }
}
```

`details` is optional and may omit fields the upstream did not provide.
`upstream_step` (one of `step0`, `step0b`, `step1`, `step2`, `step3`) is
worth adding in v3 — with five failure layers, knowing *which* hop
returned `invalid_grant` is the difference between "retry" and "log the
user out."

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

## The two faces of `expired_token`

Both map to `expired_token`, but the app must do different things.
This is the single most consequential decision in the v3 flow, so decide
it on `upstream_step`, not on the code alone.

| Origin                               | What actually expired      | What the app does                                     |
| ------------------------------------ | -------------------------- | ----------------------------------------------------- |
| **Step 3** 401 `…description=expired`| The resource access token  | **Re-mint.** Re-run Steps 1 + 2 and retry once. The refresh token is still good. |
| **Step 1** `invalid_grant`           | The **refresh token**      | **Re-authenticate.** Send the user through Step 0 (and Step 0b on the SAML path). Nothing to retry. |
| **Step 0b** `invalid_grant`          | The SAML assertion         | **Re-authenticate.** Restart SAML SSO.                |

A rejected refresh token cannot be repaired — expired, revoked, or
invalidated all look the same and none are retryable. Do not loop.

> **Retry exactly once** on the Step 3 path. If a freshly minted access
> token is also rejected as expired, the problem is clock skew or
> configuration, not expiry — surface it rather than spinning.

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

A failure during Step 0b, Step 1, or Step 2 returns an OAuth 2.0 error
response (RFC 6749 § 5.2):

```json
{
  "error": "invalid_grant",
  "error_description": "subject_token expired"
}
```

| `error` value             | Maps to                                                  |
| ------------------------- | -------------------------------------------------------- |
| `invalid_grant`           | `expired_token` — the refresh token, assertion, or ID-JAG is stale. **Branch on `upstream_step`**, see above. |
| `invalid_client`          | `token_exchange_failure` (credentials wrong; check which client pair you sent) |
| `unsupported_grant_type`  | `token_exchange_failure` (server doesn't recognise the grant URN — check the spelling) |
| `invalid_scope`           | `insufficient_scope`                                     |
| `invalid_request`         | `token_exchange_failure` (missing `audience`/`resource` on Step 1 lands here) |
| `invalid_target`          | `token_exchange_failure` (unknown `audience` or `resource`) |
| anything else             | `token_exchange_failure`                                 |

### `invalid_grant` sub-causes worth distinguishing in logs

All map to `expired_token`, but the description tells you what to fix:

| `error_description` mentions        | Actual cause                                                    |
| ----------------------------------- | --------------------------------------------------------------- |
| expiry / `subject_token`            | The refresh token (Step 1) or assertion (Step 0b) is past its life. |
| `iat` / clock / skew                | ID-JAG `iat` outside xaa.dev's **30 s** tolerance. Fix your clock, not your code. See `06-debugging-playbook.md` § D-18. |
| audience / resource                 | Step 1's `audience`/`resource` don't match what the auth server expects. § D-5. |
| `sub_id` / NameID / subject         | *SAML path.* The auth server can't resolve the subject, or the SAML issuer isn't associated with the validated ID-JAG issuer for your tenant. § D-15, § D-16. |

Draft-04 § 3.2.2 specifies `invalid_grant` for every `sub_id` resolution
failure: no `sub_id` in the required format, malformed or unsupported
format, or a `sub_id` not authorized by local policy for the validated
ID-JAG issuer. So a SAML tenant misconfiguration is indistinguishable
from an expired refresh token by code alone — another reason to record
`upstream_step` and the raw description.

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
duration, `upstream_step`).

That regex already covers v3's new material — `refresh_token` and
`subject_token` match on `token`, and a SAML assertion matches on
`assertion`. Two things to check in your implementation:

- **`SAMLResponse` does not match the regex.** A raw `SAMLResponse` form
  field contains the assertion. Add it explicitly, or normalise it into
  an `assertion`-named key before logging.
- **`sub_id` is not a secret** and should not be redacted — it's the
  diagnostic you need most on the SAML path. Log it in full.
