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

## Choose your protocol path

**Answer this before writing anything.**

| Path              | What Step 0 looks like                                        | Pick it when                                                             |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **OIDC** *(default)* | Authorization Code + PKCE at `https://idp.xaa.dev/authorize`. Returns an ID Token **and** a refresh token. | You have no constraint. Fewer moving parts, and the path xaa.dev's own docs cover. |
| **SAML**          | SP-initiated SAML 2.0 Web Browser SSO at `https://idp.xaa.dev/saml/sso`, then one extra exchange (**Step 0b**) trading the assertion for a refresh token. | You're modelling an app whose IdP integration is already SAML, or you want to exercise the SAML path deliberately. |

**If you have no existing constraint, pick OIDC.**

The two paths diverge only at Step 0 and Step 0b. **From Step 1 onward
they are byte-identical** — same grants, same URNs, same error handling.
This is one fork near the beginning, not two builds.

Set `XAA_PROTOCOL=oidc` or `XAA_PROTOCOL=saml` in `.env.local` and
commit to it. In the prompt files, sections marked `### ▸ OIDC path` /
`### ▸ SAML path` are yours to choose between; blocks marked
`> **SAML path only.**` or `> **OIDC path only.**` are skippable if
they aren't your path. Unmarked text applies to both. **Do not
implement both.**

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
4. **Call a protected resource** with `Authorization: Bearer <access
   token>` and render the response.
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

- **`offline_access` requested at Step 0 / Step 0b.** No refresh token
  means no session past ~10 minutes.
- **The refresh token never leaves the server.** Not to the browser, not
  to a log, not to `.env.local`. It is the longest-lived credential in
  the system and xaa.dev has **no revocation endpoint** — a leak cannot
  be undone from your app.
- **Server-side token storage.** No raw token of any kind reaches the
  browser. The browser only ever sees an encrypted session cookie (or
  equivalent in your stack).
- **Two distinct client credential pairs.** `CLIENT_ID/SECRET` (Steps 0,
  0b, 1) ≠ `RESOURCE_CLIENT_ID/SECRET` (Step 2). Mixing them is the most
  common source of opaque `invalid_client` failures.
- **Token redaction.** Every log line that holds a token, secret,
  assertion, ID-JAG, or JWT must be reduced to `head…tail` or `***`.
  Note `SAMLResponse` doesn't match the standard key regex — handle it.
- **Re-mint per call.** Don't persist the ID-JAG or the resource access
  token. Re-run Steps 1 + 2 from the session's refresh token on each
  protected call. The ID-JAG lives 5 minutes and may be single-use.
- **▸ OIDC path: PKCE S256, never `plain`. State + nonce verification
  mandatory.**
- **▸ SAML path: assertion base64url-encoded *unpadded*. Signature,
  `InResponseTo`, and `AudienceRestriction` verification mandatory.
  NameID format `emailAddress` or `persistent` — never `transient`.**
- **Callback URI byte-exact.** What you put in `REDIRECT_URI` (OIDC) or
  `SAML_ACS_URL` (SAML) must match what you registered at xaa.dev
  (scheme, host, port, path).

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
