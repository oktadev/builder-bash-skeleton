# 00 — Hackathon brief

> **Paste this prompt verbatim into your AI assistant.** It's the
> full task specification — stack-agnostic, AI-assistant-agnostic.
>
> **Kit version: v3.**

---

You are a senior engineer building a **Cross-App Access (XAA)
Requesting App** against the public xaa.dev playground. Pick whatever
stack you're fastest in (Python / Go / Rust / Java / Ruby / Node / .NET
/ Elixir / etc.) — the prompts that follow describe behaviour and wire
format, not libraries.

## Choose your two paths

**Answer both before writing anything.** They're independent.

### 1. Protocol — how you log in (`XAA_PROTOCOL`)

| Path                 | What Step 0 looks like                                        | Pick it when                                                             |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **OIDC** *(default)* | Authorization Code + PKCE at `https://idp.xaa.dev/authorize`. Returns an ID Token **and** a refresh token. | You have no constraint. Fewer moving parts, and the path xaa.dev's own docs cover. |
| **SAML**             | SP-initiated SAML 2.0 Web Browser SSO at `https://idp.xaa.dev/saml/sso`, then one extra exchange (**Step 0b**) trading the assertion for a refresh token. | You're modelling an app whose IdP integration is already SAML, or you want to exercise the SAML path deliberately. |

### 2. Application type — what you do with the token (`APP_TYPE`)

| Type                       | What Step 3 looks like                                                                 | Pick it when                                              |
| -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **standalone** *(default)* | Your app calls a protected REST resource itself: `GET …/api/todos` with `Authorization: Bearer`. | You're building a conventional web app or service.        |
| **MCP client**             | Your app drives an MCP server through the **official MCP SDK**, authenticated with the same XAA-minted token. Adds one dependency and a fourth host (`mcp.xaa.dev`). | You're building an agent-facing client that consumes MCP resources or tools. |

**No constraint? Pick OIDC + standalone.**

### Why this is two forks, not four builds

```
                 Step 0 / 0b      Step 1        Step 2      Step 3
  XAA_PROTOCOL   OIDC │ SAML      shared        shared      shared
  APP_TYPE       shared           scopes only   shared      Standalone │ MCP
```

The axes touch different parts of the flow and never interact. There is
no combined "SAML + MCP" variant to learn — it's the SAML Step 0 plus the
MCP Step 3. `APP_TYPE` reaches Step 1 only as configuration (MCP needs
`mcp.access` in the scope list), never as logic.

Set both in `.env.local` and commit to them. In the prompt files,
`### ▸ …` sections are alternatives and `> **… only.**` blocks are
skippable when they aren't yours; unmarked text applies to everyone.
**Do not implement both protocols or both app types.**

### Where the kit ends and the MCP SDK begins

If you picked MCP, this boundary is the point of the design:

| Concern | Owner |
| ------- | ----- |
| Login, refresh token, ID-JAG, access token, session, config, redaction, error taxonomy, observability | **this kit** |
| JSON-RPC framing, `initialize`, capability negotiation, transport, `resources/*`, `tools/*` | **official MCP SDK** |
| MCP's own OAuth — RFC 9728 discovery, DCR, auth-code + PKCE | **neither, deliberately** |

**The kit mints the token; the SDK receives it.** Don't reimplement MCP
protocol handling in your app, and don't let the SDK acquire its own
token — in this architecture it already has one.

---

## What the Requesting App MUST do

1. **Authenticate** a user against `https://idp.xaa.dev`:
   - **▸ OIDC path:** Authorization Code + PKCE (S256), with state +
     nonce verification, requesting `offline_access`.
   - **▸ SAML path:** SP-initiated Web Browser SSO with `RelayState`,
     `InResponseTo`, and `AudienceRestriction` verification. Then
     exchange the assertion for a refresh token (**RFC 8693**,
     `subject_token_type=…:saml2` →
     `requested_token_type=…:refresh_token`).
2. **Hold the refresh token as the session anchor.** `offline_access`
   is what makes the IdP issue one. It is the long-lived credential
   your session is built on. **Never anchor on the ID Token** — on
   xaa.dev it lives ~10 minutes and xaa.dev's own docs call it *"only
   good for one exchange right after login."*
3. **Mint a delegated access token** through the two-step XAA flow, on
   every protected call:
   - **RFC 8693** Token Exchange at the IdP
     (`refresh token → ID-JAG`).
   - **RFC 7523** JWT-Bearer Grant at the resource auth server
     (`ID-JAG → access token`).
4. **Use the access token**, per `APP_TYPE`:
   - **▸ standalone:** `GET https://api.resource.xaa.dev${RESOURCE_PATH}`
     with `Authorization: Bearer <access token>`, and render the response.
   - **▸ MCP client:** connect the **official MCP SDK** to
     `https://mcp.xaa.dev/mcp` (StreamableHTTP, protocol `2025-03-26`),
     supplying that same access token; then `resources/list` and
     `resources/read` on `todo0://todos`. The playground's `todo0-mcp`
     exposes **resources, not tools**.
5. **Handle the failure modes** with distinct UX: successful,
   unauthorized, invalid token, expired token, API failure — plus a
   dead refresh token, which is a *re-authenticate*, not a retry.
6. **Log the full lifecycle** with token redaction so a maintainer can
   see what went on the wire without leaking secrets.

The exact wire format for every grant is in `reference/xaa-spec.md`.
The full error map is in `reference/error-mapping.md`. Both are short;
read them before starting.

> The resource auth server does **not** issue a refresh token at Step 2,
> by design — `draft-ietf-oauth-identity-assertion-authz-grant-04`
> § 4.4.3 says it SHOULD NOT, because *"the ID-JAG replaces the use of
> Refresh Token for the Resource Authorization Server."* When your
> access token expires, mint a new ID-JAG from your IdP refresh token.
> Don't go looking for a resource-side refresh token; there isn't one.

---

## Required surfaces

Implement at minimum these surfaces (paths can vary by stack — the
shape is what matters):

| Surface                  | Method | Description                                                    |
| ------------------------ | ------ | -------------------------------------------------------------- |
| `/`                      | GET    | Redirect by session.                                           |
| `/login`                 | GET    | Sign-in entry point.                                           |
| `/dashboard`             | GET    | Authenticated landing — user, token state, resource viewer, log. |
| `/api/auth/login`        | GET    | Start login. OIDC: PKCE + 302 to IdP. SAML: 302/form-POST to SSO. |
| `/api/auth/callback`     | GET    | **OIDC only.** Validate state/nonce, exchange code, store session. |
| `/api/auth/saml/acs`     | POST   | **SAML only.** Consume `SAMLResponse`, validate, run Step 0b, store session. |
| `/api/auth/logout`       | POST   | Destroy session.                                               |
| `/api/auth/session`      | GET    | Safe-to-render session view (no raw tokens).                   |
| `/api/call`              | POST   | Run the XAA flow + fetch resource. Return `CallResult \| ApiError`. |
| `/api/logs`              | GET    | Read the in-memory ring buffer.                                |
| `/api/logs`              | DELETE | Clear the buffer.                                              |

You implement one of `/api/auth/callback` or `/api/auth/saml/acs` — the
one matching your path.

---

## Non-negotiables

**The full list is `reference/xaa-spec.md` § Invariants.** Read it once
before you start; it's short and it's canonical. The four below are the
ones that most often get built wrong:

- **`offline_access` at Step 0 / Step 0b, and assert the refresh token
  came back.** No refresh token means no session past ~10 minutes, and
  the failure surfaces later as an unrelated-looking `invalid_grant`.
- **Never anchor on the ID Token.** ~10 min lifetime; xaa.dev calls it
  *"only good for one exchange right after login."*
- **`expired_token` is two states.** From the resource call → re-mint and
  retry **once**. From the ID-JAG exchange → the refresh token is dead,
  **re-authenticate, never retry.**
- **Two client pairs, not interchangeable.** `CLIENT_*` at the IdP
  (Steps 0, 0b, 1); `RESOURCE_CLIENT_*` at the resource auth server
  (Step 2).

Plus one per path: **OIDC** — PKCE S256 with state + nonce verified.
**SAML** — assertion base64url *unpadded*, with signature,
`InResponseTo`, and `AudienceRestriction` all verified.

---

## Required test scenarios

All must produce distinct, verifiable behaviour:

| #  | Scenario          | What to verify                                                           |
| -- | ----------------- | ------------------------------------------------------------------------ |
| E1 | Successful flow   | login → call → 200 + body rendered + log shows the full lifecycle.       |
| E2 | Unauthorized      | call without session → `unauthorized` (401). Dashboard gates.            |
| E3 | Invalid token     | wrong audience/resource → upstream `invalid_token` rendered distinctly.  |
| E4 | Dead refresh token| refresh token rejected → `expired_token`, UI prompts **re-auth** (not retry). |
| E5 | API failure       | resource unreachable / 5xx → `resource_failure` with retry hint.         |
| E6 | Refresh works     | **new in v3.** Two calls minutes apart both succeed off the same refresh token, without re-login. |
| E7 | SAML end-to-end   | **new in v3, SAML path only.** SSO → assertion → Step 0b → ID-JAG carries `sub_id`. |

Concrete simulation recipes are in `07-testing.md`.

---

## Deliverables

The work is done when you can demonstrate:

1. End-to-end E1 against your real xaa.dev credentials, on your chosen
   path.
2. The error scenarios produce distinct UI states.
3. A reproducible `README` covering setup, env vars (including
   `XAA_PROTOCOL`), and run commands.
4. Hermetic tests for the error mapping logic (no live network in CI).
5. **`offline_access` requested, the refresh token stored server-side
   only, and the re-mint-vs-re-authenticate rule implemented** —
   demonstrated by E6. A build that re-logs-the-user-in on every access
   token expiry has not met this bar.
6. The prompts under this kit are preserved or replaced with your
   own — leave a trail so the next engineer can replay.

---

## Reference assets

You'll be asked to read these as you go — bookmark them now:

- `reference/xaa-spec.md` — exact wire format, both paths.
- `reference/error-mapping.md` — error code decision table.
- `reference/env-vars.md` — fixed xaa.dev hosts + per-dev credentials.
- `reference/architecture.md` — flow diagrams.
- `reference/glossary.md` — terminology, OIDC and SAML side by side.

> **Step numbering differs from xaa.dev's own docs** — this kit's Step 1
> is their "Step 2", off by one throughout. Mapping table in
> `reference/xaa-spec.md` § Step numbering.
