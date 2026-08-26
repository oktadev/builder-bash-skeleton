# 01 — Project skeleton

## Prompt

> Pick a stack you're fluent in. Scaffold a minimal HTTP application
> with: routing, server-rendered or templated views (or an SPA shell —
> your call), a session layer, a configuration layer, a logger, and a
> test runner.
>
> Constraints:
>
> 1. **Server-side session** with an encrypted httpOnly cookie (or an
>    equivalent server-stored session keyed by an httpOnly cookie). The
>    session must hold:
>    - the **refresh token** — the session anchor, and the longest-lived
>      credential in the system,
>    - user claims for rendering,
>    - a short-lived login transaction (OIDC: PKCE verifier + state +
>      nonce; SAML: `RelayState` + the `<AuthnRequest>` ID),
>    - optionally the ID Token, for claims only — do not depend on it
>      past ~10 minutes.
>
>    ≤4KB if cookie-based. **On the SAML path a cookie-based session is
>    likely to overflow** — see the note under Issues.
> 2. **Lazy config loading.** Don't validate env vars at import time —
>    validate on first use. This lets tests import modules without
>    every var being set.
> 3. **Strict types / strict mode.** Whatever your language's strongest
>    safety setting is, turn it on. Concrete defaults:
>    - **Static-typed:** TS `"strict": true`, Go `vet`+`staticcheck`,
>      Rust `#![deny(warnings)]` + clippy, C# nullable enabled.
>    - **Dynamic:** Python `mypy --strict` (or `pyright` strict) +
>      `ruff`. Ruby `rubocop` + `sorbet typed: true`. Node JS-only:
>      `eslint` + `tsc --noEmit --strict` even if you ship JS.
>    The error-mapping discriminated union (`ok: true | false`) only
>    narrows under strict mode — see `06-debugging-playbook.md` § D-10.
> 4. **Hermetic build.** No external services should be required to
>    install dependencies and start the dev server.
> 5. Use `reference/env-vars.md` for the env var contract. Which vars are
>    required depends on `XAA_PROTOCOL` **and** `APP_TYPE` — validate the
>    right set, don't demand all of them.
> 6. **`APP_TYPE=mcp` only — add the official MCP SDK** and nothing else:
>
>    | Language  | Dependency                                  |
>    | --------- | ------------------------------------------- |
>    | Node / TS | `@modelcontextprotocol/sdk`                 |
>    | Python    | `mcp`                                       |
>
>    Use the official SDK for the language you picked. Do not add a
>    community MCP client, and do not write a JSON-RPC layer yourself —
>    the SDK owns the protocol, the kit owns auth and config. If your
>    language has no official SDK, tell me before proceeding rather than
>    hand-rolling one.
>
>    On `APP_TYPE=standalone` there is **no** extra dependency; the
>    standard HTTP client is enough.

## Objective

Get to "the dev server boots and serves a placeholder homepage" in your
chosen stack, with the project layout the rest of the kit will fill in.

## Output (capabilities, not files)

| Capability                         | Notes                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| HTTP server with routing           | Whatever your stack's idiomatic choice is.                               |
| `loadConfig()` (or equivalent)     | Reads the env vars from `reference/env-vars.md`. Throws on first call if any required var is missing, with the missing var's name. **The required set depends on both axes** — `REDIRECT_URI` (OIDC) vs `SAML_ACS_URL` + `SAML_NAMEID_FORMAT` (SAML); `RESOURCE_PATH` (standalone) vs `MCP_SERVER_URL` + `MCP_PROTOCOL_VERSION` (MCP). Validate the right combination; don't demand all four groups. |
| Encrypted session adapter          | httpOnly cookie, `SameSite=Lax`, 8 h max-age. Must encrypt+sign with `SESSION_SECRET`. Holds the refresh token — see § Storing the refresh token. |
| Logger                             | Writes to stdout in dev. Holds a 200-entry FIFO ring buffer in memory for the observability surface (next prompt). |
| `.env.example`                     | Documents every required env var with a one-line comment.                |
| `.gitignore`                       | Excludes `.env*` (except `.env.example`), build output, dependencies, signing keys. |
| Project README skeleton            | One paragraph + a "see hackathon-kit/" pointer.                          |

## Issues you may hit

- **`SESSION_SECRET` too short.** Most session libraries require ≥32
  bytes. Generate with `openssl rand -base64 32`.
- **httpOnly missing.** Some libraries default to `httpOnly: false` for
  dev — flip it on explicitly. The whole security model assumes JS
  cannot read the cookie.
- **Cookie-size overrun.** If you store tokens in the cookie itself
  (sealed-cookie pattern), keep the rest of the session lean. 4 KB is
  the practical browser limit.
- **Cookie-size overrun on the SAML path is near-certain if you keep the
  assertion.** A SAML assertion is XML with an embedded signature and
  certificate — routinely 4–10 KB before base64 encoding, i.e. larger
  than the entire cookie budget on its own. You don't need to keep it:
  the assertion is consumed once at Step 0b and the refresh token
  replaces it. Discard it after the exchange. If you keep it for
  debugging, use a server-stored session.

## Storing the refresh token

The refresh token is the session anchor and the longest-lived credential
in this system. Where it belongs:

| ✅ Belongs                                                      | ❌ Does not belong                                     |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| Encrypted server-side session (sealed cookie or server store)   | `localStorage` / `sessionStorage` / any JS-readable place |
| A server-side secret store, if you persist sessions across restarts | A non-httpOnly cookie                              |
| Redacted (`head…tail`) in logs, if at all                        | Plaintext in logs, stdout, or an error message        |
|                                                                 | `.env.local`, `.env`, or any committed file            |
|                                                                 | A URL, query param, or redirect fragment               |
|                                                                 | Any response body your app returns to the browser      |

Three properties make this stricter than it looks:

1. **There is no revocation endpoint on xaa.dev.** A leaked refresh
   token cannot be invalidated from your app. It stays usable until it
   expires — and its lifetime is `TODO(confirm)`, undocumented. (An
   `end_session_endpoint` exists and *might* invalidate outstanding
   refresh tokens, but that's also `TODO(confirm)`. Don't plan around
   it.)
2. **It is not consumed by use.** Unlike the ID-JAG, exchanging it
   returns a new ID-JAG without invalidating the refresh token, so a
   leaked copy keeps working alongside yours.
3. **It re-mints silently.** Possession lets someone mint ID-JAGs for
   your resource indefinitely with no user interaction and no consent
   prompt.

Practical consequence: **logout destroys your local session only**, and
the refresh token most likely remains valid upstream. That's a limitation
of the playground, not a bug in your app — but don't paper over it in the
UI. If you persist sessions to disk, encrypt at rest with a key that
isn't in the repo.

## Fixes

- Generate a real secret and stop using a placeholder:
  ```
  openssl rand -base64 32
  ```
- Set `httpOnly: true`, `sameSite: 'lax'`, `secure: <true in prod>`
  explicitly on every session config.
- If you bust 4 KB, switch to a server-stored session (Redis / DB) and
  put only the session ID in the cookie. The rest of the kit doesn't
  care which strategy you pick.

## `.gitignore` starter

Drop this in at the repo root and adjust per-stack as needed. The two
critical lines are the `.env*` block and `keys/` — the rest is just
build-output hygiene.

```gitignore
# === Secrets — never commit ===
.env
.env.local
.env.*.local
keys/
*.pem
*.key

# === Build output (uncomment for your stack) ===
# Node / TS
node_modules/
dist/
build/
.next/
*.tsbuildinfo
next-env.d.ts

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Go
*.test
*.out

# Rust
target/

# JVM
target/
build/
.gradle/

# OS / editor
.DS_Store
.vscode/
.idea/
coverage/
*.log
```

## Verification

```bash
# 1. Boot
<your dev command>

# 2. Smoke
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:<port>/
# → some 2xx or 3xx — placeholder homepage or redirect to /login

# 3. Confirm config validation
unset CLIENT_SECRET     # any required var
<your dev command>
# → should fail loudly with "Missing required env var: CLIENT_SECRET"
```
