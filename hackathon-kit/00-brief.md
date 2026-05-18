# 00 — Hackathon brief

> **Paste this prompt verbatim into your AI assistant.** It's the
> full task specification — stack-agnostic, AI-assistant-agnostic.

---

You are a senior engineer building a **Cross-App Access (XAA)
Requesting App** against the public xaa.dev playground. Pick whatever
stack you're fastest in (Python / Go / Rust / Java / Ruby / Node / .NET
/ Elixir / etc.) — the prompts that follow describe behaviour and wire
format, not libraries.

The Requesting App MUST:

1. **Authenticate** a user against `https://idp.xaa.dev` via OIDC
   Authorization Code + PKCE (S256), with state + nonce verification.
2. **Mint a delegated access token** through the two-step XAA flow:
   - **RFC 8693** Token Exchange at the IdP (`ID Token → ID-JAG`).
   - **RFC 7523** JWT-Bearer Grant at the resource auth server
     (`ID-JAG → access token`).
3. **Call a protected resource** with `Authorization: Bearer <access
   token>` and render the response.
4. **Handle five failure modes** with distinct UX:
   - successful, unauthorized, invalid token, expired token, API failure.
5. **Log the full lifecycle** with token redaction so a maintainer can
   see what went on the wire without leaking secrets.

The exact wire format for both grants is in `reference/xaa-spec.md`.
The full error map is in `reference/error-mapping.md`. Both are short;
read them before starting.

---

## Required surfaces

Implement at minimum these surfaces (paths can vary by stack — the
shape is what matters):

| Surface                  | Method | Description                                                    |
| ------------------------ | ------ | -------------------------------------------------------------- |
| `/`                      | GET    | Redirect by session.                                           |
| `/login`                 | GET    | Sign-in entry point.                                           |
| `/dashboard`             | GET    | Authenticated landing — user, token state, resource viewer, log. |
| `/api/auth/login`        | GET    | Start PKCE flow, redirect to IdP.                              |
| `/api/auth/callback`     | GET    | Validate state/nonce, exchange code, store session.            |
| `/api/auth/logout`       | POST   | Destroy session.                                               |
| `/api/auth/session`      | GET    | Safe-to-render session view (no raw tokens).                   |
| `/api/call`              | POST   | Run the XAA flow + fetch resource. Return `CallResult \| ApiError`. |
| `/api/logs`              | GET    | Read the in-memory ring buffer.                                |
| `/api/logs`              | DELETE | Clear the buffer.                                              |

---

## Non-negotiables

- **PKCE S256.** Never `plain`.
- **Server-side token storage.** ID Token never leaves the server. The
  browser only ever sees an encrypted session cookie (or equivalent in
  your stack).
- **Two distinct client credential pairs.** `CLIENT_ID/SECRET` (Step 1)
  ≠ `RESOURCE_CLIENT_ID/SECRET` (Step 2). Mixing them is the most
  common source of opaque `invalid_client` failures.
- **Token redaction.** Every log line that holds a token, secret,
  assertion, ID-JAG, or JWT must be reduced to `head…tail` or `***`.
- **Re-mint per call.** Don't persist the resource access token.
  Re-run Steps 1 + 2 from the cached ID Token on each protected call.
- **State + nonce verification.** Mandatory.
- **Redirect URI byte-exact.** What you put in `REDIRECT_URI` must match
  what you registered at xaa.dev (scheme, host, port, path).

---

## Required test scenarios

All five must produce distinct, verifiable behaviour:

| #  | Scenario          | What to verify                                                           |
| -- | ----------------- | ------------------------------------------------------------------------ |
| E1 | Successful flow   | login → call → 200 + body rendered + log shows 4-step lifecycle.         |
| E2 | Unauthorized      | call without session → `unauthorized` (401). Dashboard gates.            |
| E3 | Invalid token     | wrong audience/resource → upstream `invalid_token` rendered distinctly.  |
| E4 | Expired token     | wait/simulate → `expired_token`, UI prompts re-auth.                     |
| E5 | API failure       | resource unreachable / 5xx → `resource_failure` with retry hint.         |

Concrete simulation recipes are in `07-testing.md`.

---

## Deliverables

The work is done when you can demonstrate:

1. End-to-end E1 against your real xaa.dev credentials.
2. The five scenarios produce five distinct UI states.
3. A reproducible `README` covering setup, env vars, and run commands.
4. Hermetic tests for the error mapping logic (no live network in CI).
5. The prompts under this kit are preserved or replaced with your
   own — leave a trail so the next engineer can replay.

---

## Reference assets

You'll be asked to read these as you go — bookmark them now:

- `reference/xaa-spec.md` — exact wire format.
- `reference/error-mapping.md` — error code decision table.
- `reference/env-vars.md` — fixed xaa.dev hosts + the 9 per-dev vars.
- `reference/architecture.md` — flow diagrams.
