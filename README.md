# XAA Hackathon Kit

[![Claude Code](https://img.shields.io/badge/Claude_Code-ready-D97757?logo=anthropic&logoColor=white)](https://claude.com/claude-code)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-ready-412991?logo=openai&logoColor=white)](https://openai.com/codex/)
[![Cursor](https://img.shields.io/badge/Cursor-ready-000000?logo=cursor&logoColor=white)](https://cursor.com)
[![Aider](https://img.shields.io/badge/Aider-ready-14B789)](https://aider.chat)
[![GitHub Copilot](https://img.shields.io/badge/GitHub_Copilot-compatible-24292e?logo=githubcopilot&logoColor=white)](https://github.com/features/copilot)
[![ChatGPT](https://img.shields.io/badge/ChatGPT-chat--only-10A37F?logo=openai&logoColor=white)](https://chatgpt.com)
[![Sourcegraph Cody](https://img.shields.io/badge/Cody-compatible-FF5543?logo=sourcegraph&logoColor=white)](https://sourcegraph.com/cody)

> **Kit version: v3.** New since v2: the IdP refresh token as the
> session anchor. **This kit builds OIDC only** — SAML support has
> been dropped.
> **Status:** Tested against `xaa.dev` as of **2026-08-26**.
> Targets: Cross-App Access (ID-JAG) draft-04, RFC 8693 (Token Exchange),
> RFC 7523 (JWT-Bearer), RFC 7636 (PKCE), RFC 6750 (Bearer +
> WWW-Authenticate), RFC 8414 (Auth Server Metadata), RFC 9493 (Subject
> Identifiers).

## What is this?

A recipe you hand to an AI coding agent so it builds you a small web
app that logs a user in and calls a protected API on their behalf 
against a public practice playground, [xaa.dev](https://xaa.dev). You
pick the programming language; the kit tells the agent exactly what to
build and how to check its own work.

---

## Quick start

### **What do I need on my laptop before I start?**
Two things, installed and ready to go *before* you touch anything
below:

- **Git** — to get the kit onto your machine. Check: 
```bash 
git --version`
```
  Don't have it? [git-scm.com/downloads](https://git-scm.com/downloads).
- **An AI coding agent** — this kit is a set of instructions you hand
  to one; it writes the actual code. Any agent with filesystem + shell
  access works: [Claude Code](https://claude.com/claude-code),
  [Cursor](https://cursor.com), [OpenAI Codex CLI](https://openai.com/codex/),
  [Aider](https://aider.chat), or GitHub Copilot's coding agent. Have
  it installed and able to open a terminal in a project folder — ask
  at the booth if you're not sure yours can do that.

Everything else in this README assumes both are already working.

### **How do I get the kit?**
Clone the repo and get inside the project.... Use the below command in your terminal window

```bash
  git clone https://github.com/oktadev/builder-bash-skeleton.git
  cd builder-bash-skeleton
  ```

### **Where do I get the template?**
Copy the env template — run the below command in your terminal: 

``` 
cp .env.example .env.local
```
Every xaa.dev credential you get in the next step goes into this file; it's
gitignored and never touched by the agent.

### **Where do I get my credentials?**
Register your app at [xaa.dev](https://xaa.dev/?have=requesting&want=register&via=oidc)
and paste the client IDs/secrets it gives you into `.env.local`. Sign
in with a fake email — it's a practice playground, not a real account.
Stuck? Full walkthrough: `hackathon-kit/reference/env-vars.md` §
Registration walkthrough.

### **How do I actually start building?**
Paste `hackathon-kit/IGNITION.md` into your AI agent's first message.
It reads the rest of the kit itself and asks you an app-type question
and a stack question — answer those and it starts building.

### **Who starts the server once it's built?**
You do, in your own terminal — see *How do I start and stop my
server?* below. The agent tells you the command; it never runs it for
you.

The rest of this README fills in detail on each of these if you get
stuck.

---

## How do I start and stop my server?

**The agent never starts or stops your dev server for you.** Once
`01-project-skeleton.md` is scaffolded, your agent tells you the exact
boot command for your stack. It looks like one of these:

| Stack            | Start command                                    |
| ---------------- | ------------------------------------------------- |
| Python / FastAPI | `uvicorn xaa_app.main:app --reload --port 3000`   |
| Node / Express   | `npm run dev`                                     |
| Go / chi         | `go run ./cmd/server`                             |
| Rust / Axum      | `cargo run`                                       |
| Java / Spring    | `./gradlew bootRun` (or `mvn spring-boot:run`)    |
| Ruby / Rails     | `bin/rails server`                                |
| .NET             | `dotnet run`                                      |

Ask your agent for the exact command if your entrypoint differs.

**To stop it:** `Ctrl+C` in that terminal, or `kill <pid>` if it's
already running in the background.

---

## What am I actually building?

A small server-side web app that:

1. Logs a user in at **`https://idp.xaa.dev`** via OIDC Authorization
   Code + PKCE.
2. Holds an IdP **refresh token** as the session anchor, obtained by
   requesting `offline_access`.
3. Mints a delegated **ID-JAG** for `https://auth.resource.xaa.dev` from
   that refresh token, using **RFC 8693 Token Exchange**.
4. Trades the ID-JAG for a resource access token using **RFC 7523
   JWT-Bearer**.
5. Calls a protected API at **`https://api.resource.xaa.dev`** (default
   `/api/todos`, or your own BYOR endpoint) with the access token.
6. Surfaces every step — tokens redacted, errors classified, request
   timeline visible — in a UI you control.

By the end you'll have a test suite for the error handling, a smoke
flow that hits real xaa.dev, and an app that fails gracefully —
including knowing the difference between "re-mint the access token"
and "the session is over, sign in again."

---

## Do I need to choose anything?

Just one thing — how your app uses the token (`APP_TYPE`). Protocol
isn't a choice here: this kit builds **OIDC only**
(`XAA_PROTOCOL=oidc`, fixed).

| Type                       | What that means                                                                                 | Pick it when                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **standalone** *(default)* | Your app calls a protected REST resource itself with `Authorization: Bearer`. No extra deps.     | You're building a conventional web app or service.                  |
| **MCP client**             | Your app drives an MCP server through the **official MCP SDK**, using that same token. Adds one dependency and a fourth host. | You're building an agent-facing client that consumes MCP resources or tools. |

**No constraint? standalone.**

### If I pick MCP, what's the kit's job vs. the SDK's job?

| Concern | Owner |
| ------- | ----- |
| Login (OIDC), refresh token, ID-JAG, access token, session, config, redaction, error taxonomy, observability | **this kit** |
| JSON-RPC framing, `initialize`, capability negotiation, transport, `resources/*`, `tools/*` | **official MCP SDK** |
| MCP's own OAuth — RFC 9728 discovery, DCR, auth-code + PKCE | **neither, deliberately** |

**The kit mints the token; the SDK receives it.** Never let the SDK go
looking for its own credentials — one already exists before it
connects.

---

## What am I free to choose myself?

| Power                                | What that means                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pick any stack**                   | Python, Node/TS, Go, Rust, Java/Kotlin, Ruby, .NET, Elixir — anything that speaks HTTPS, JSON, SHA-256, and httpOnly cookies. |
| **Pick any OIDC library**            | The kit specifies *wire format*, not library calls. Use `authlib`, `openid-client@6`, `coreos/go-oidc`, `openidconnect`, Spring Security — whatever's idiomatic. |
| **Pick any session strategy**        | Sealed httpOnly cookie or server-stored (Redis / SQLite / Postgres) — as long as no raw token reaches the browser and the cookie is httpOnly + `SameSite=Lax`. |
| **Pick any UI shape**                | Server-rendered templates, an SPA, a TUI, plain HTML — the kit only specifies what must be visible (redacted tokens, the latest ID-JAG, a request timeline).        |
| **Bring Your Own Resource (BYOR)**   | Default resource is `https://api.resource.xaa.dev/api/todos`, but `RESOURCE_PATH` (and `RESOURCE_URL` for another resource server) can point anywhere xaa.dev knows. |
| **Bring your own AI agent**          | OpenAI Codex, Claude Code, Cursor, Aider, Copilot, ChatGPT, Cody — see *How do I tell my AI agent to start?* below.                                                                     |
| **Customise scopes + claims**        | `RESOURCE_SCOPES` controls what you ask for; the kit already handles `insufficient_scope` if you ask for too much.                                                                       |
| **Extend the test matrix**           | The tests in `hackathon-kit/07-testing.md` are the *minimum*, not the ceiling.          |

**What you can't change:** the xaa.dev hostnames, the URN spellings,
the PKCE method (S256), and the error-code set — those are the spec.

---

## How does the whole flow work, in one picture?

```
authorize(+offline_access) ──► ID Token + REFRESH TOKEN
                                          │
                                          ▼
       [1] refresh token → ID-JAG        [2] ID-JAG → access token
        RFC 8693, CLIENT_*                RFC 7523, RESOURCE_CLIENT_*
        5 min, single-use-ish             ~2 h, no refresh token
                                                    │
                              ┌─────────────────────┴─────────────────────┐
                              ▼                                           ▼
                    [3a] standalone                            [3b] MCP client
                    GET api.resource.xaa.dev/…                 POST mcp.xaa.dev/mcp
                    Authorization: Bearer                      via OFFICIAL MCP SDK

                        └──── re-run 1+2 on every /api/call ────┘
```

Two OAuth client pairs. The refresh token is the anchor — hang on to
it and re-mint everything below it on every call. Full sequence
diagrams: `hackathon-kit/reference/architecture.md`.

**The one rule people get wrong:** `expired_token` from the resource
call means *re-mint and retry once*. `expired_token` from the token
exchange means *the refresh token is dead — sign in again.* Never
retry the second one.

---

## How do I tell my AI agent to start?

| Your tool                                            | Do this                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Any agent with filesystem + shell access**          | Paste `hackathon-kit/IGNITION.md` verbatim as your first message. It reads the rest of the kit itself.           |
| **Chat-only tools without filesystem access**         | Paste `hackathon-kit/ignition/chat-only.md` instead — copy-paste–driven, slower but works without shell access.  |

### Does my agent need any setup to read this repo?

The repo ships one agent digest, **`AGENTS.md`**, which most agents
(Codex, Cursor, Copilot, Windsurf, Zed, and more) read automatically —
no setup needed. Aider and Gemini CLI need one config line each (see
their docs). **Claude Code** reads `CLAUDE.md`, a one-line file that
just points at `AGENTS.md` — nothing to configure.

Either way, the agent should still read `hackathon-kit/IGNITION.md`
first — the digest is a summary, not a substitute.

---

## What do I need installed before I start?

| Need                   | Why                                                                 | Quick check             |
| ---------------------- | ------------------------------------------------------------------- | ----------------------- |
| Language runtime       | Whatever you're building in (Python ≥3.11, Node ≥20, Go ≥1.22, …)   | `python --version` etc. |
| `openssl`              | Generate `SESSION_SECRET`.                                          | `openssl version`       |
| `curl`                 | Verification checks throughout the kit.                             | `curl --version`        |
| Accurate system clock  | xaa.dev allows only **30 s** of clock drift. Drift breaks token minting with an error that looks like a code bug. | `date -u` vs any NTP source |
| Free port              | Default `APP_URL=http://localhost:3000`. Pick another if 3000 is busy — change `APP_URL` + `REDIRECT_URI` together and re-register. | `lsof -i :3000`         |
| `.env.local`           | `cp .env.example .env.local`, then fill in your credentials.        | `test -f .env.local`    |
| xaa.dev account        | Registered with **two** client pairs + your callback URI, on the **OIDC tab**. | See `hackathon-kit/reference/env-vars.md` § Registration walkthrough. |

Windows: use Git Bash / WSL for the curl + openssl commands. Generate
`SESSION_SECRET` with `[Convert]::ToBase64String((1..32 | %{Get-Random -Min 0 -Max 256}))`
in PowerShell as a fallback.

---

## Which libraries should I use for my stack?

You can use anything that speaks HTTPS, parses JSON, can SHA-256 +
base64url, and stores an httpOnly encrypted cookie. If you want a
known-good default instead of researching it yourself:

| Language        | HTTP framework              | OIDC client                                          | MCP SDK *(mcp only)*        | Session                          | Test runner   |
| --------------- | --------------------------- | ---------------------------------------------------- | --------------------------- | --------------------------------- | ------------- |
| **Python**      | FastAPI                     | `authlib` or `oic`                                   | **`mcp`** (official)        | `itsdangerous` cookie / Redis    | `pytest`      |
| **Node/TS**     | Express / Fastify / Next.js | `openid-client@6`                                    | **`@modelcontextprotocol/sdk`** (official) | `iron-session` (sealed cookie)   | `vitest`      |
| **Go**          | `chi` / Gin                 | `coreos/go-oidc` + `golang.org/x/oauth2`             | see note below              | `gorilla/sessions` (cookie store)| `go test`     |
| **Rust**        | Axum                        | `openidconnect`                                      | see note below              | `tower-sessions` (cookie/Redis)  | `cargo test`  |
| **Java/Kotlin** | Spring Boot                 | `spring-security-oauth2-client`                      | see note below              | Spring Session                   | JUnit 5       |
| **Ruby**        | Rails / Sinatra             | `omniauth_openid_connect`                            | see note below              | Rails session (cookie)           | RSpec         |
| **.NET**        | ASP.NET Core                | `Microsoft.AspNetCore.Authentication.OpenIdConnect`  | see note below              | Cookie auth handler              | xUnit         |

> **Picking MCP?** Use the *official* SDK for your language — check
> <https://modelcontextprotocol.io> if yours isn't listed above. If
> your language has no official SDK, pick one that does rather than
> hand-rolling JSON-RPC yourself.

---

## What's in this repo?

```
.
├── README.md                       (this file — your help doc)
├── AGENTS.md                       the agent digest (agents.md standard, ~20 tools)
├── CLAUDE.md                       thin @AGENTS.md import for Claude Code
├── llms.txt                        AI-discoverable repo index
├── .env.example                    env template — copy to .env.local
└── hackathon-kit/                  (the spec — treat as read-only)
    ├── IGNITION.md                 paste-into-agent first message
    ├── 00-brief.md                 hackathon task brief
    ├── 01-project-skeleton.md      stack scaffold + env config + session + token storage
    ├── 02-user-login.md            OIDC Authorization Code + PKCE login
    ├── 03-token-exchange.md        RFC 8693 + RFC 7523 (the XAA core)
    ├── 04-protected-resource-call.md   bearer call + WWW-Authenticate + re-mint rule
    ├── 05-ui-and-observability.md  dashboard + log surface
    ├── 06-debugging-playbook.md    nineteen failure shapes + diagnostic prompts
    ├── 07-testing.md               hermetic + smoke + E1–E7 manual
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
your AI) → **Objective** → **Output** → **Issues** → **Fixes** →
**Verification**.

---

## What happens, step by step, once I'm building?

The kit is **hard-gated** — one step at a time, in order:
`01 → 02 → 03 → 04 → 05 → 07`. After each step the agent runs
Verification and waits for you to say "continue."
`hackathon-kit/06-debugging-playbook.md` is a reference catalog for
failure modes — open it only when something breaks.

If you ignited via `hackathon-kit/IGNITION.md`, the agent already knows
this loop. If you're driving manually:

1. Paste `hackathon-kit/00-brief.md` to set context.
2. Paste the **Prompt** section of `hackathon-kit/01-project-skeleton.md`.
3. Apply the AI's output. Run the Verification commands.
4. If Issues match what you see, apply Fixes. Otherwise → step 5.
5. Repeat for `02 → 05` and `07`.
6. Run E1 and E6 against your real xaa.dev credentials (see
   `hackathon-kit/07-testing.md`). E6 proves the refresh anchor works;
   a build can pass E1 and still fail it.

Each prompt is self-contained — you can also feed an AI just `03-…` to
add token exchange to an existing app.

---

## Can I go further than the basics?

- **BYOR (Bring Your Own Resource).** Register a second resource auth
  server with xaa.dev, point `RESOURCE_URL` + `RESOURCE_CLIENT_*` at it,
  set `RESOURCE_PATH` to your endpoint.
- **Custom scopes.** Set `RESOURCE_SCOPES=foo.read bar.write`
  (space-separated) and try a scope you're not authorized for — the
  error handling already covers it.
- **Multiple resources in one session.** Mint a separate ID-JAG per
  resource from the same refresh token. See
  `hackathon-kit/reference/xaa-spec.md` § Step 1. Don't reuse one
  ID-JAG across resources.
- **Access token caching.** The kit re-mints per call by default (the
  safe choice). The access token lives ~2 h and *could* be cached — key
  it by a hash of the refresh token, with a TTL under the upstream
  `expires_in`.
- **Production hardening.** Flip `secure: true` on the cookie, set
  `SameSite=Strict` if your callback origin matches, rotate
  `SESSION_SECRET`, encrypt the refresh token at rest, and move the
  session store off-process.

Extensions go in *your* repo, not the kit. The kit stays as the spec.

---

## Any tips for working with my AI agent?

- **Paste `00-brief.md` first** if you're driving manually — it's the
  system context. (`IGNITION.md` already has this baked in.)
- **Paste reference docs when a step asks for them.** Don't make the
  AI guess wire format.
- **One prompt per turn.** Don't paste `01` + `02` together — the
  Verification commands gate the next step for a reason.
- **Show your work when correcting.** Paste the diff plus the failing
  curl/test output. Don't just say "it didn't work."
- **Push back on library drift.** If the kit says "S256 PKCE" and the
  AI emits `code_challenge_method=plain`, cite the spec.
- **One stack per session.** Don't mix Python and Node in one chat.
- **Watch for the ID Token creeping back in.** If you see
  `subject_token_type=…:id_token` anywhere, that's wrong — it should be
  `…:refresh_token`. This is the single most common mistake an AI makes
  here.
- **Don't accept an invented refresh-token lifetime.** xaa.dev doesn't
  document one. A countdown timer means the AI made the number up.

---

## Found a bug in the kit itself?

If your hackathon hits a failure shape that isn't in
`hackathon-kit/06-debugging-playbook.md`, or a stack-specific gotcha
worth calling out, open a PR. Keep each entry short: Symptom → Root
cause → Debugging prompt → Resolution.
