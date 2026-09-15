# XAA Hackathon Kit

[![Claude Code](https://img.shields.io/badge/Claude_Code-ready-D97757?logo=anthropic&logoColor=white)](https://claude.com/claude-code) [![OpenAI Codex](https://img.shields.io/badge/Codex-ready-412991?logo=openai&logoColor=white)](https://openai.com/codex/) [![Cursor](https://img.shields.io/badge/Cursor-ready-000000?logo=cursor&logoColor=white)](https://cursor.com) [![Copilot](https://img.shields.io/badge/Copilot-compatible-24292e?logo=githubcopilot&logoColor=white)](https://github.com/features/copilot)

> **Kit v4** — same protocol coverage as v3, a quarter of the reading.
> Tested against `xaa.dev` as of **2026-08-26**.

Build a working **Cross-App Access (XAA) Requesting App** against the public
[xaa.dev](https://xaa.dev) playground, in **any language or framework**. You
bring the stack and an AI coding agent; the kit brings the wire format, the
error contract, and the verification recipes.

**It's four HTTP calls:** log the user in and hold a refresh token → trade
that for an **ID-JAG** (RFC 8693) → trade the ID-JAG for an access token
(RFC 7523) → use it. Steps 2–4 re-run on every protected call.

## Ignite

Paste **`hackathon-kit/IGNITION.md`** into your agent as its first message. It
asks three questions — protocol, app type, stack — and starts building. One
stop, after login, because that needs your browser.

| Choice | Options | Default |
| --- | --- | --- |
| `XAA_PROTOCOL` — how you log in | `oidc` (Auth Code + PKCE) · `saml` (SP-initiated SSO + one extra exchange) | **`oidc`** |
| `APP_TYPE` — what you do with the token | `standalone` (REST + Bearer) · `mcp` (official MCP SDK, adds a dependency and a fourth host) | **`standalone`** |

The two axes branch in different places and never interact, so all four
combinations are one build with two swaps. **No constraint? `oidc` +
`standalone`.**

## Day 0 — before you start

| Need | Check |
| --- | --- |
| Language runtime (Python ≥3.11 / Node ≥20 / Go ≥1.22 / …) | `python --version` |
| `openssl` — generates `SESSION_SECRET` | `openssl version` |
| `curl` — the kit's verification probes | `curl --version` |
| **Accurate clock** — xaa.dev allows only **30 s** of skew on the ID-JAG's `iat`; drift breaks Step 2 with an error that looks like a code bug | `date -u` vs any NTP source |
| Free port — default `APP_URL=http://localhost:3000` | `lsof -i :3000` |
| `.env.local` — `cp .env.example .env.local`, then fill it in | `test -f .env.local` |
| xaa.dev account with **two** client pairs + your callback URI, registered on the **OIDC or SAML tab** matching your path | <https://xaa.dev/developer/register> |

Registration walkthrough and the full env contract are in
`hackathon-kit/SPEC.md` § Environment. Windows: use Git Bash or WSL.

## Stack picker

Library-agnostic, but you'll move faster with known-good defaults:

| Language | Framework | OIDC client | SAML *(saml only)* | MCP SDK *(mcp only)* | Tests |
| --- | --- | --- | --- | --- | --- |
| **Python** | FastAPI | `authlib` | `python3-saml` / `pysaml2` | **`mcp`** | `pytest` |
| **Node/TS** | Express / Fastify / Next.js | `openid-client@6` | `@node-saml/node-saml` | **`@modelcontextprotocol/sdk`** | `vitest` |
| **Go** | `chi` / Gin | `coreos/go-oidc` | `crewjam/saml` | see note | `go test` |
| **Rust** | Axum | `openidconnect` | `samael` | see note | `cargo test` |
| **Java/Kotlin** | Spring Boot | `spring-security-oauth2-client` | `spring-security-saml2-service-provider` | see note | JUnit 5 |
| **Ruby** | Rails / Sinatra | `omniauth_openid_connect` | `ruby-saml` | see note | RSpec |
| **.NET** | ASP.NET Core | `Microsoft.AspNetCore.Authentication.OpenIdConnect` | `Sustainsys.Saml2` | see note | xUnit |

Anything that speaks HTTPS, parses JSON, can SHA-256 + base64url, and sets an
httpOnly cookie will work. Two library choices aren't free: on `saml` use a
maintained library for signature verification (XML-DSIG signature-wrapping and
XXE are live risks), and on `mcp` use the **official** SDK — see
<https://modelcontextprotocol.io> for languages not listed above.

## Layout

Four kit files: **`IGNITION.md`** (entry point — paste this), **`SPEC.md`** (the
only reference: hosts, wire format, env, errors, invariants), **`BUILD.md`**
(six phases, one stop), **`DEBUG.md`** (23 failure shapes). At the root:
`AGENTS.md` (agent digest, ~20 tools auto-load it), `CLAUDE.md` (thin import of
it), `.env.example`. `hackathon-kit/` is the spec — read-only while building.

**One caveat before you start:** a build can pass the E1 happy path and still
fail **E6**, the one that proves the refresh token is really your session
anchor. If your agent writes `subject_token_type=…:id_token` on Step 1, that's
the drift — it should be `…:refresh_token`. See `BUILD.md` § Phase 6.

Hit a failure shape that isn't in `DEBUG.md`? PRs welcome.
