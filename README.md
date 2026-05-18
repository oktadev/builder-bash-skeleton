# XAA Hackathon Kit

[![Claude Code](https://img.shields.io/badge/Claude_Code-ready-D97757?logo=anthropic&logoColor=white)](https://claude.com/claude-code)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-ready-412991?logo=openai&logoColor=white)](https://openai.com/codex/)
[![Cursor](https://img.shields.io/badge/Cursor-ready-000000?logo=cursor&logoColor=white)](https://cursor.com)
[![Aider](https://img.shields.io/badge/Aider-ready-14B789)](https://aider.chat)
[![GitHub Copilot](https://img.shields.io/badge/GitHub_Copilot-compatible-24292e?logo=githubcopilot&logoColor=white)](https://github.com/features/copilot)
[![ChatGPT](https://img.shields.io/badge/ChatGPT-chat--only-10A37F?logo=openai&logoColor=white)](https://chatgpt.com)
[![Sourcegraph Cody](https://img.shields.io/badge/Cody-compatible-FF5543?logo=sourcegraph&logoColor=white)](https://sourcegraph.com/cody)

> **Status:** Tested against `xaa.dev` as of **2026-05-18**.
> Targets: Cross-App Access (ID-JAG) draft, RFC 8693 (Token Exchange),
> RFC 7523 (JWT-Bearer), RFC 7636 (PKCE), RFC 6750 (Bearer +
> WWW-Authenticate), RFC 8414 (Auth Server Metadata).

A spec-first prompt kit for building a working **Cross-App Access (XAA)
Requesting App** against the public [xaa.dev](https://xaa.dev) playground
— in **any language or framework** you choose. You bring the stack and an
AI coding agent; the kit brings the wire format, the error contract, the
verification recipes, and a hard-gated execution loop the agent can
follow without drifting.

---

## What you'll build

A small server-side web app that:

1. Logs a user in at **`https://idp.xaa.dev`** via OIDC Authorization
   Code + PKCE.
2. Mints a delegated **ID-JAG** for `https://auth.resource.xaa.dev` using
   **RFC 8693 Token Exchange**.
3. Trades that ID-JAG for a resource access token using **RFC 7523
   JWT-Bearer**.
4. Calls a protected API at **`https://api.resource.xaa.dev`** (default
   `/api/todos`, or your own BYOR endpoint) with the access token.
5. Surfaces every step — tokens redacted, errors classified, request
   timeline visible — in a UI you control.

By the end you'll have a hermetic test suite for the error mapping, an
end-to-end smoke flow that hits real xaa.dev, and an app that fails
gracefully across five distinct error shapes.

---

## What you can do with this kit

Treat the kit as a template. Here's the surface area you control:

| Power                                | What that means                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pick any stack**                   | Python (FastAPI/Flask/Django), Node/TS (Express/Fastify/Next.js), Go (chi/Gin), Rust (Axum), Java/Kotlin (Spring/Ktor), Ruby (Rails/Sinatra), .NET, Elixir — anything that speaks HTTPS, JSON, SHA-256, and httpOnly cookies. |
| **Pick any OIDC client library**     | The kit specifies *wire format*, not library calls. Use `authlib`, `openid-client@6`, `coreos/go-oidc`, `openidconnect`, Spring Security — whatever's idiomatic. Hand-roll if you'd rather.                |
| **Pick any session strategy**        | Sealed httpOnly cookie or server-stored (Redis / SQLite / Postgres) — both are acceptable as long as the raw ID Token never reaches the browser and the cookie is httpOnly + `SameSite=Lax`.               |
| **Pick any UI shape**                | Server-rendered templates, an SPA, a TUI, plain HTML — the kit only specifies surfaces with behaviour ("show the access token, redacted; show the most recent ID-JAG; render a request timeline").        |
| **Bring Your Own Resource (BYOR)**   | Default resource is `https://api.resource.xaa.dev/api/todos`, but `RESOURCE_PATH` (and `RESOURCE_URL` if you've registered another resource auth server) can point at any protected endpoint xaa.dev knows. |
| **Bring your own AI agent**          | OpenAI Codex, Claude Code, Cursor, Aider, Copilot, ChatGPT, Cody — agentic and chat-only flows are both supported, see *Ignite* below.                                                                     |
| **Customise scopes + claims**        | `RESOURCE_SCOPES` controls what you ask for; the kit's error mapping handles `insufficient_scope` cleanly when you ask for too much.                                                                       |
| **Extend the test matrix**           | The 18 hermetic + 9 smoke + 5 manual scenarios in `hackathon-kit/07-testing.md` are the *minimum*. Add more — the error-mapping union is designed for it.                                                  |

What you do **not** control: the three xaa.dev hostnames (`idp.xaa.dev`,
`auth.resource.xaa.dev`, `api.resource.xaa.dev`), the URN spellings, the
PKCE method (S256), and the eight-element `ErrorCode` set. Those are the
spec.

---

## 30-second mental model

```
        Browser
           │ 1. /login → /api/auth/login
           ▼
   ┌──────────────────┐    OIDC Code + PKCE    ┌──────────────────┐
   │  Your app        │ ─────────────────────▶ │  idp.xaa.dev     │
   │  (any stack)     │ ◀───────────────────── │  (IdP)           │
   └──────────────────┘    ID Token            └──────────────────┘
           │
           │ 2. RFC 8693 token-exchange (CLIENT_*)
           ▼
   ┌──────────────────────────────────────────┐
   │   idp.xaa.dev → ID-JAG (audience=auth)   │
   └──────────────────────────────────────────┘
           │
           │ 3. RFC 7523 jwt-bearer (RESOURCE_CLIENT_*)
           ▼
   ┌──────────────────────────────────────────┐
   │   auth.resource.xaa.dev → access_token   │
   └──────────────────────────────────────────┘
           │
           │ 4. Bearer call
           ▼
   ┌──────────────────────────────────────────┐
   │   api.resource.xaa.dev/<RESOURCE_PATH>   │
   └──────────────────────────────────────────┘
```

Two OAuth client pairs. Re-mint per call. Server-side session only.
That's the whole game.

---

## Ignite the kit

Pick the path that matches your tool. After igniting, finish Day 0 below
so the agent's pre-flight passes.

| Tool                                                          | Ignition file                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI Codex / Claude Code / Cursor agent / Aider with FS** | `hackathon-kit/IGNITION.md` — paste verbatim as your first message; the agent reads the rest of the kit itself.              |
| **ChatGPT (browser) / chat-only tools without FS access**     | `hackathon-kit/ignition/chat-only.md` — copy-paste–driven, slower but works without shell access.                            |

Codex / Claude Code / Cursor will *also* auto-load the repo-root files
`AGENTS.md`, `CLAUDE.md`, and `.cursorrules` — those are short digests
of the invariants, not substitutes for `hackathon-kit/IGNITION.md`. The
agent should still read IGNITION first.

Inline-assist tools (Copilot, Cody) work best paired with one of the
agentic flows above — open `hackathon-kit/IGNITION.md` in your editor
and use the inline assistant for tab-completion as you walk through the
prompts.

---

## Day 0 — before any AI prompt

| Need                   | Why                                                                 | Quick check             |
| ---------------------- | ------------------------------------------------------------------- | ----------------------- |
| Language runtime       | Whatever you're building in (Python ≥3.11, Node ≥20, Go ≥1.22, …)   | `python --version` etc. |
| `openssl`              | Generate `SESSION_SECRET`.                                          | `openssl version`       |
| `curl`                 | Verification probes throughout the kit.                             | `curl --version`        |
| Free port              | Default `APP_URL=http://localhost:3000`. Pick another if 3000 is busy — change `APP_URL` + `REDIRECT_URI` together and re-register. | `lsof -i :3000`         |
| `.env.local`           | `cp .env.example .env.local`, then fill the per-developer block.    | `test -f .env.local`    |
| xaa.dev account        | Registered with **two** client pairs + your redirect URI.           | See `hackathon-kit/reference/env-vars.md` § Registration walkthrough. |

Windows: use Git Bash / WSL for the curl + openssl commands. Generate
`SESSION_SECRET` with `[Convert]::ToBase64String((1..32 | %{Get-Random -Min 0 -Max 256}))`
in PowerShell as a fallback.

---

## Quick stack picker

The kit is library-agnostic, but you'll move faster with a known-good
defaults set:

| Language        | HTTP framework              | OIDC client                                          | Session                          | Test runner   |
| --------------- | --------------------------- | ---------------------------------------------------- | -------------------------------- | ------------- |
| **Python**      | FastAPI                     | `authlib` or `oic`                                   | `itsdangerous` cookie / Redis    | `pytest`      |
| **Node/TS**     | Express / Fastify / Next.js | `openid-client@6`                                    | `iron-session` (sealed cookie)   | `vitest`      |
| **Go**          | `chi` / Gin                 | `coreos/go-oidc` + `golang.org/x/oauth2`             | `gorilla/sessions` (cookie store)| `go test`     |
| **Rust**        | Axum                        | `openidconnect`                                      | `tower-sessions` (cookie/Redis)  | `cargo test`  |
| **Java/Kotlin** | Spring Boot                 | `spring-security-oauth2-client`                      | Spring Session                   | JUnit 5       |
| **Ruby**        | Rails / Sinatra             | `omniauth_openid_connect`                            | Rails session (cookie)           | RSpec         |
| **.NET**        | ASP.NET Core                | `Microsoft.AspNetCore.Authentication.OpenIdConnect`  | Cookie auth handler              | xUnit         |

Anything that speaks HTTPS, parses JSON, can SHA-256 + base64url, and
stores an httpOnly encrypted cookie will work.

---

## Repo layout

```
.
├── README.md                       (this file — your help doc)
├── AGENTS.md                       auto-loaded by Codex / Cursor — invariants digest
├── CLAUDE.md                       auto-loaded by Claude Code — invariants digest
├── .cursorrules                    Cursor project rules
├── llms.txt                        AI-discoverable repo index
├── .env.example                    env template — copy to .env.local
└── hackathon-kit/                  (the spec — treat as read-only)
    ├── IGNITION.md                 paste-into-agent first message (Codex/Claude Code/Cursor)
    ├── 00-brief.md                 hackathon task brief
    ├── 01-project-skeleton.md      stack scaffold + env config + session
    ├── 02-oidc-login.md            Authorization Code + PKCE login
    ├── 03-token-exchange.md        RFC 8693 + RFC 7523 (the XAA core)
    ├── 04-protected-resource-call.md   bearer call + WWW-Authenticate mapping
    ├── 05-ui-and-observability.md  dashboard + log surface
    ├── 06-debugging-playbook.md    thirteen failure shapes + diagnostic prompts
    ├── 07-testing.md               T1–T5 hermetic + B1–B9 smoke + E1–E5 manual
    ├── ignition/
    │   └── chat-only.md            ignition variant for ChatGPT/Aider (no FS access)
    └── reference/
        ├── xaa-spec.md             canonical wire format
        ├── error-mapping.md        ErrorCode set + decoding tables
        ├── env-vars.md             fixed xaa.dev hosts + per-dev creds + registration walkthrough
        ├── architecture.md         flow diagrams
        └── glossary.md             terminology anchors
```

Each numbered prompt file follows the same shape: **Prompt** (paste into
your AI) → **Objective** → **Output** (capabilities, not files) →
**Issues** → **Fixes** → **Verification**.

---

## How execution flows

The kit is **hard-gated**. Walk `01 → 02 → 03 → 04 → 05 → 07` in order.
After each step the agent runs Verification and waits for you to say
"continue." `hackathon-kit/06-debugging-playbook.md` is a reference
catalog for failure modes — jump in only when something breaks.

If you ignited via `hackathon-kit/IGNITION.md`, the agent already knows
the loop. If you're driving manually:

1. Paste `hackathon-kit/00-brief.md` to set context.
2. Paste the **Prompt** section of `hackathon-kit/01-project-skeleton.md`.
3. Apply the AI's output. Run the Verification commands.
4. If Issues match what you see, apply Fixes. Otherwise → step 5.
5. Repeat for `02 → 05` and `07`.
6. Run E1 against your real xaa.dev credentials (see
   `hackathon-kit/07-testing.md`).

Each prompt is self-contained — you can also feed an AI just `03-…` to
add token exchange to an existing app, or just `04-…` to harden an
existing call layer.

---

## Decisions you control

The kit is intentionally silent on:

- **Language / framework.** See the stack picker above.
- **OIDC / OAuth library.** Whatever's idiomatic. The prompts describe
  *what* the wire format must be, not *which* library to call.
- **Session storage.** Sealed cookie (httpOnly + encrypted) or
  server-stored (Redis / SQLite / DB) — both pass the kit's checks.
- **UI shape.** Server-rendered templates, SPA, TUI, plain HTML — the
  kit just asks for surfaces with specific behaviour.
- **Logger.** stdout is fine in dev. The 200-entry FIFO ring buffer the
  observability surface reads from is the only structural requirement.
- **Test runner.** Whatever ships with your stack. The 18 hermetic
  scenarios in `hackathon-kit/07-testing.md` describe outcomes, not
  assertions.

The kit is silent because you should pick what you'll move fastest in.

---

## Extending the kit

Common extensions other hackathon teams have shipped:

- **BYOR (Bring Your Own Resource).** Register a second resource auth
  server with xaa.dev, point `RESOURCE_URL` + `RESOURCE_CLIENT_*` at it,
  set `RESOURCE_PATH` to your endpoint. The Step 2 audience claim is
  derived from `RESOURCE_URL` so no other code changes.
- **Custom scopes.** Set `RESOURCE_SCOPES=foo.read bar.write` (space-
  separated). The error mapping already handles
  `error="insufficient_scope"` — exercise it with a deliberately
  unauthorised scope.
- **Multiple resources in one session.** Run Step 2 multiple times with
  different audiences/scopes off the same ID-JAG. Section
  `hackathon-kit/reference/xaa-spec.md` § Step 2 covers the parameters.
- **Background refresh.** The kit re-mints per call by default (the safe
  choice). If you cache the access token, set a TTL well under the
  upstream `expires_in` and add a `expired_token`-on-refresh path —
  scenario T7 in your local extension to `hackathon-kit/07-testing.md`.
- **Production hardening.** Flip `secure: true` on the cookie, set
  `SameSite=Strict` if your callback origin matches, rotate
  `SESSION_SECRET`, and move the session store off-process.

Extensions go in *your* repo, not the kit. The kit stays as the spec.

---

## Working with your AI assistant

A few practices that make the kit go smoothly with any AI coding tool:

- **Always paste `hackathon-kit/00-brief.md` first** if you're driving
  manually — it's the system context. (`hackathon-kit/IGNITION.md` has
  this baked in.)
- **Paste reference docs on demand.** If a step Prompt says "see
  `reference/xaa-spec.md` § Step 1", paste that section into the chat
  the first time it comes up. The AI shouldn't be guessing wire format.
- **One prompt per turn.** Don't paste `01` + `02` together. The
  Verification commands gate the next step for a reason.
- **Share repo state when correcting.** Paste the file the AI produced
  (or the diff) plus the failing curl/test output. Don't just say
  "it didn't work."
- **Keep the AI honest about libraries.** If the kit says "S256 PKCE,
  base64url unpadded" and the AI emits `code_challenge_method=plain`,
  push back with the spec citation.
- **One stack only per session.** Don't mix Python and Node in one chat
  — the AI will helpfully drift between them.

---

## Contributing back

If your hackathon hits a failure shape that isn't in
`hackathon-kit/06-debugging-playbook.md`, or a stack-specific gotcha
that's worth calling out, open a PR. Each entry is short and follows the
same shape: Symptom → Root cause → Debugging prompt → Resolution.
