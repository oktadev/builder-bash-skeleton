# CLAUDE.md

> Auto-loaded by Claude Code. Treat as durable project context for any
> session in this repository.
>
> **Kit version: v3.**

## What this repo is

A **hackathon kit** for building a Cross-App Access (XAA) Requesting
App against the public xaa.dev playground. The kit at `hackathon-kit/`
is the **authoritative spec** — wire format, error codes, env-var
contract, verification commands. You bring the language and framework;
the kit dictates the protocol.

## First action

Read `hackathon-kit/IGNITION.md` end-to-end **before doing anything
else**. It contains the full execution loop, pre-flight checks, and
hard-gates. This file is a digest, not a substitute.

## Two decisions, in this order

1. **Protocol path — OIDC or SAML.** Ask the dev before anything else.
   OIDC is the default; pick it unless they say otherwise. This
   determines Step 0, which env vars are required, and whether Step 0b
   runs. Set `XAA_PROTOCOL` to match.
2. **Stack.** Ask once, then commit for the session.

**Never implement both protocol paths.** In the kit's prompt files,
`### ▸ OIDC path` / `### ▸ SAML path` sections are alternatives, and
`> **SAML path only.**` / `> **OIDC path only.**` blocks are skippable.
Unmarked text applies to both. Don't read the other path's branches.

## Source-of-truth files (read in this order, fully)

1. `hackathon-kit/IGNITION.md` — the agent runbook
2. `README.md` (repo root) — developer help doc
3. `hackathon-kit/00-brief.md` — task brief
4. `hackathon-kit/reference/glossary.md` — terminology
5. `hackathon-kit/reference/env-vars.md` — env-var contract
6. `hackathon-kit/reference/xaa-spec.md` — wire format
7. `hackathon-kit/reference/error-mapping.md` — ErrorCode set
8. `hackathon-kit/reference/architecture.md` — flow diagrams

The numbered prompts (`01-…` through `07-…`) are walked one at a time
under the IGNITION.md execution loop.

## The flow in one block

```
OIDC:  authorize(+offline_access) ──► ID Token + REFRESH TOKEN ─┐
SAML:  SSO ─► assertion ─► [0b] ────► REFRESH TOKEN ────────────┤
                                                                ▼
       [1] refresh token → ID-JAG   [2] ID-JAG → access token   [3] Bearer call
                        └──── re-run 1+2 on every /api/call ────┘
```

## Non-negotiable invariants

These apply to every file you write, in every language:

- **The refresh token is the session anchor.** Obtained by requesting
  `offline_access`. Presented as `subject_token` with
  `subject_token_type=urn:ietf:params:oauth:token-type:refresh_token`
  on every ID-JAG exchange. Long-lived credential: server-side session
  only, never the browser, never a log, never an env file.
- **Never anchor on the ID Token.** It lives ~10 minutes on xaa.dev and
  is good for roughly one exchange right after login. This is the v2
  pattern; do not drift back to it.
- **The resource auth server issues no refresh token.** By design
  (draft-04 § 4.4.3). When the access token expires, mint a new ID-JAG.
- **`offline_access` on Step 0 / Step 0b.** Assert it came back.
- **PKCE S256.** Never `plain`. Verifier and challenge are base64url
  unpadded. *(OIDC path only.)*
- **State + nonce verified.** State on callback, nonce on the ID Token.
  *(OIDC path only. SAML equivalents — `RelayState`, `InResponseTo`,
  `AudienceRestriction` — are equally mandatory.)*
- **SAML assertion encoding: base64url, unpadded**, and the
  `subject_token` is the **bare `<saml:Assertion>` element**, not the
  whole `SAMLResponse`. *(SAML path only.)*
- **Server-side session only.** No raw token reaches the browser.
  Cookie is httpOnly + `SameSite=Lax`.
- **Two distinct OAuth client pairs.** `CLIENT_*` for the IdP (Steps 0,
  0b, 1); `RESOURCE_CLIENT_*` for the resource auth server (Step 2).
  Mixing them is the most common cause of opaque `invalid_client`
  failures.
- **Re-mint per call.** Neither the ID-JAG nor the access token is
  cached; re-run Steps 1 + 2 on each `/api/call`. The ID-JAG lives 5
  minutes and may be single-use.
- **`expired_token` means two things.** From Step 3 → re-mint and retry
  **once** (bounded by a counter). From Step 1 → the refresh token is
  dead; **re-authenticate, never retry.** Branch on `upstream_step`.
- **URN spelling matters.**
  - `urn:ietf:params:oauth:grant-type:token-exchange` (Steps 0b + 1)
  - `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2)
  - `urn:ietf:params:oauth:token-type:refresh_token` (Step 1 subject)
  - `urn:ietf:params:oauth:token-type:saml2` (Step 0b subject)
  - `urn:ietf:params:oauth:token-type:id_token` (underscore; v2 pattern)
  - `urn:ietf:params:oauth:token-type:id-jag` (hyphen)
- **Token redaction.** Every log line touching a token, secret,
  assertion, ID-JAG, or JWT is reduced to `<head 8>…<tail 8>` (>16
  char) or `***` (≤16 char) before write. Match keys with
  `/(token|secret|assertion|jag|jwt)/i`. **`SAMLResponse` does not match
  that regex** — handle it explicitly. `sub_id` is not a secret; log it.
- **Tagged-union error shape.** `{ ok: true, … } | { ok: false, error:
  ErrorCode, … }`. `ok` is a literal, not a `bool`.

## Hard rules

- **One numbered step at a time.** After each Verification passes, stop
  and wait for the dev to say "continue."
- **Never modify `hackathon-kit/`.** It is the spec; treat it as
  read-only. *(True for building against the kit. Maintaining the kit
  itself is a separate job with different rules.)*
- **Never commit `.env.local`, `keys/`, `*.pem`, or `*.key`.**
- **Never invent libraries, env-var names, scopes, or URN strings.**
  If the spec is ambiguous, ask the dev.
- **Never fill in a `TODO(confirm)`** with a plausible value — those
  mark things unverified against xaa.dev. Ask.
- **Never invent a refresh-token lifetime.** xaa.dev doesn't document
  one. No countdown timers, no proactive-refresh schedulers keyed to a
  made-up TTL.
- **Never bypass safety checks** (`--no-verify`, swallowed 401s,
  widened type unions to silence narrowing) — fix the root cause.
- **Never retry-loop a rejected refresh token.** It cannot be repaired.
- **Never mix stacks or protocol paths in one session.** Once the dev
  picks Python + OIDC, don't drift into Node or SAML.

## Fixed environment (xaa.dev)

These three URLs are constants — never substitute, never templatise:

- `https://idp.xaa.dev` — IdP (OIDC discovery at
  `/.well-known/openid-configuration`; SAML metadata at `/saml/metadata`;
  note `/.well-known/oauth-authorization-server` returns **404** here)
- `https://auth.resource.xaa.dev` — resource auth server (use
  `/.well-known/oauth-authorization-server`, **not**
  `openid-configuration` — the latter omits
  `authorization_grant_profiles_supported`)
- `https://api.resource.xaa.dev` — resource (Todo0 default)

Documented lifetimes: ID Token ~10 min, ID-JAG 5 min (30 s `iat` skew
tolerance), access token ~2 h, refresh token **undocumented**. There is
**no revocation endpoint**.

Per-developer credentials come from
<https://xaa.dev/developer/register> — it has an **OIDC | SAML tab
toggle**; use the tab matching the chosen path. The dev fills
`.env.local` themselves; never solicit secrets in chat.

## When stuck

Consult `hackathon-kit/06-debugging-playbook.md` *before* trying random
fixes. It catalogs nineteen failure shapes with diagnostic prompts,
marked by path — D-14…D-16 are SAML-specific, D-6/D-7/D-12 are
OIDC-only, D-17…D-19 cover refresh tokens, clock skew, and retry storms.
If none match, run the curl recipes at the bottom of that file to isolate
client bugs from server/registration bugs.

After ~5 failed attempts on the same issue, stop and report.
