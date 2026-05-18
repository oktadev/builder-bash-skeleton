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
>    session must hold an ID Token + claims + a short-lived PKCE
>    transaction. ≤4KB if cookie-based.
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
> 5. Use `reference/env-vars.md` for the env var contract.

## Objective

Get to "the dev server boots and serves a placeholder homepage" in your
chosen stack, with the project layout the rest of the kit will fill in.

## Output (capabilities, not files)

| Capability                         | Notes                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| HTTP server with routing           | Whatever your stack's idiomatic choice is.                               |
| `loadConfig()` (or equivalent)     | Reads the env vars from `reference/env-vars.md` (3 fixed + 9 per-developer). Throws on first call if any required var is missing, with the missing var's name.   |
| Encrypted session adapter          | httpOnly cookie, `SameSite=Lax`, 8 h max-age. Must encrypt+sign with `SESSION_SECRET`. |
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
- **Cookie-size overrun.** If you store the ID Token in the cookie
  itself (sealed-cookie pattern), keep the rest of the session lean.
  4 KB is the practical browser limit.

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
