# XAA Hackathon Kit

[![Claude Code](https://img.shields.io/badge/Claude_Code-ready-D97757?logo=anthropic&logoColor=white)](https://claude.com/claude-code)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI_Codex-ready-412991?logo=openai&logoColor=white)](https://openai.com/codex/)
[![Cursor](https://img.shields.io/badge/Cursor-ready-000000?logo=cursor&logoColor=white)](https://cursor.com)
[![Aider](https://img.shields.io/badge/Aider-ready-14B789)](https://aider.chat)
[![GitHub Copilot](https://img.shields.io/badge/GitHub_Copilot-compatible-24292e?logo=githubcopilot&logoColor=white)](https://github.com/features/copilot)
[![ChatGPT](https://img.shields.io/badge/ChatGPT-chat--only-10A37F?logo=openai&logoColor=white)](https://chatgpt.com)
[![Sourcegraph Cody](https://img.shields.io/badge/Cody-compatible-FF5543?logo=sourcegraph&logoColor=white)](https://sourcegraph.com/cody)

> **Kit version: v3** — see [CHANGELOG.md](CHANGELOG.md). On v2? Read the
> [migration note](hackathon-kit/MIGRATION-v2-to-v3.md).
> **Status:** Tested against `xaa.dev` as of **2026-08-26**.
> Targets: Cross-App Access (ID-JAG) draft-04, RFC 8693 (Token Exchange),
> RFC 7523 (JWT-Bearer), RFC 7636 (PKCE), RFC 6750 (Bearer +
> WWW-Authenticate), RFC 8414 (Auth Server Metadata), RFC 9493 (Subject
> Identifiers), SAML 2.0 (Web Browser SSO).

A spec-first prompt kit for building a working **Cross-App Access (XAA)
Requesting App** against the public [xaa.dev](https://xaa.dev) playground
— in **any language or framework** you choose. You bring the stack and an
AI coding agent; the kit brings the wire format, the error contract, the
verification recipes, and a hard-gated execution loop the agent can
follow without drifting.

---

## What you'll build

A small server-side web app that:

1. Logs a user in at **`https://idp.xaa.dev`**, via **either** OIDC
   Authorization Code + PKCE **or** SAML 2.0 Web Browser SSO — you pick
   at the start.
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

By the end you'll have a hermetic test suite for the error mapping, an
end-to-end smoke flow that hits real xaa.dev, and an app that fails
gracefully — including knowing the difference between "re-mint the access
token" and "the session is over, sign in again."

---

## Pick a protocol path first

The one decision to make before anything else.

| Path                 | Step 0 is…                                                                 | Pick it when                                                          |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **OIDC** *(default)* | Authorization Code + PKCE. Returns an ID Token **and** a refresh token.    | You have no constraint. Fewer moving parts; the path xaa.dev's own docs cover. |
| **SAML**             | SP-initiated Web Browser SSO, then one extra exchange (**Step 0b**) trading the assertion for a refresh token. | You're modelling an app whose IdP integration is already SAML, or you want to exercise SAML deliberately. |

**No constraint? Pick OIDC.** Set `XAA_PROTOCOL` accordingly.

The paths diverge only at Step 0 and Step 0b — **from Step 1 onward they
are identical.** One fork near the start, not two builds. Reading load
for a single path is roughly what v2 was.

---

## What you can do with this kit

Treat the kit as a template. Here's the surface area you control:

| Power                                | What that means                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pick either protocol path**         | OIDC (Authorization Code + PKCE) or SAML 2.0 (SP-initiated Web Browser SSO). Both converge on the same refresh-token-anchored flow from Step 1 onward. |
| **Pick any stack**                   | Python (FastAPI/Flask/Django), Node/TS (Express/Fastify/Next.js), Go (chi/Gin), Rust (Axum), Java/Kotlin (Spring/Ktor), Ruby (Rails/Sinatra), .NET, Elixir — anything that speaks HTTPS, JSON, SHA-256, and httpOnly cookies. |
| **Pick any OIDC / SAML library**     | The kit specifies *wire format*, not library calls. Use `authlib`, `openid-client@6`, `coreos/go-oidc`, `openidconnect`, Spring Security — whatever's idiomatic. Hand-roll the OIDC bits if you'd rather; **do not hand-roll SAML signature verification.** |
| **Pick any session strategy**        | Sealed httpOnly cookie or server-stored (Redis / SQLite / Postgres) — both are acceptable as long as no raw token reaches the browser and the cookie is httpOnly + `SameSite=Lax`. On the SAML path, a cookie-based session is likely to overflow if you keep the assertion — so discard it after Step 0b, or use a server store. |
| **Pick any UI shape**                | Server-rendered templates, an SPA, a TUI, plain HTML — the kit only specifies surfaces with behaviour ("show the access token, redacted; show the most recent ID-JAG; render a request timeline").        |
| **Bring Your Own Resource (BYOR)**   | Default resource is `https://api.resource.xaa.dev/api/todos`, but `RESOURCE_PATH` (and `RESOURCE_URL` if you've registered another resource auth server) can point at any protected endpoint xaa.dev knows. |
| **Bring your own AI agent**          | OpenAI Codex, Claude Code, Cursor, Aider, Copilot, ChatGPT, Cody — agentic and chat-only flows are both supported, see *Ignite* below.                                                                     |
| **Customise scopes + claims**        | `RESOURCE_SCOPES` controls what you ask for; the kit's error mapping handles `insufficient_scope` cleanly when you ask for too much.                                                                       |
| **Extend the test matrix**           | The hermetic rows (~36 on OIDC, ~41 on SAML) + 9 smoke probes + E1–E7 manual scenarios in `hackathon-kit/07-testing.md` are the *minimum*. Add more — the error-mapping union is designed for it.          |

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
   ┌──────────────────┐   OIDC Code + PKCE     ┌──────────────────┐
   │  Your app        │   (+ offline_access)   │                  │
   │  (any stack)     │ ─────────── OR ──────▶ │  idp.xaa.dev     │
   │                  │   SAML 2.0 SSO         │  (IdP)           │
   └──────────────────┘ ◀───────────────────── └──────────────────┘
           │              ID Token + refresh token   (OIDC)
           │              assertion → [Step 0b] → refresh token (SAML)
           │
           │   ══ REFRESH TOKEN = the session anchor ══
           │
           │ 2. RFC 8693 token-exchange (CLIENT_*)
           │    subject_token = refresh token
           ▼
   ┌──────────────────────────────────────────┐
   │   idp.xaa.dev → ID-JAG (audience=auth)   │   5 min, may be single-use
   └──────────────────────────────────────────┘
           │
           │ 3. RFC 7523 jwt-bearer (RESOURCE_CLIENT_*)
           ▼
   ┌──────────────────────────────────────────┐
   │   auth.resource.xaa.dev → access_token   │   ~2 h, no refresh token
   └──────────────────────────────────────────┘
           │
           │ 4. Bearer call
           ▼
   ┌──────────────────────────────────────────┐
   │   api.resource.xaa.dev/<RESOURCE_PATH>   │
   └──────────────────────────────────────────┘

   Steps 2–4 re-run on every /api/call, off the same refresh token.
```

Two OAuth client pairs. The refresh token is the anchor. Re-mint
everything below it per call. Server-side session only. That's the whole
game.

**The one rule participants get wrong:** `expired_token` from the
resource call means *re-mint and retry once*. `expired_token` from the
token exchange means *the refresh token is dead — sign in again.* Never
retry the second one.

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
| **Protocol choice**    | OIDC or SAML. Determines your registration tab and env vars.         | Set `XAA_PROTOCOL`.     |
| Language runtime       | Whatever you're building in (Python ≥3.11, Node ≥20, Go ≥1.22, …)   | `python --version` etc. |
| `openssl`              | Generate `SESSION_SECRET`.                                          | `openssl version`       |
| `curl`                 | Verification probes throughout the kit.                             | `curl --version`        |
| Accurate system clock  | xaa.dev allows **30 s** of skew on the ID-JAG's `iat`. Drift breaks Step 2 with an error that looks like a code bug. | `date -u` vs any NTP source |
| Free port              | Default `APP_URL=http://localhost:3000`. Pick another if 3000 is busy — change `APP_URL` + `REDIRECT_URI`/`SAML_ACS_URL` together and re-register. | `lsof -i :3000`         |
| `.env.local`           | `cp .env.example .env.local`, then fill the per-developer block.    | `test -f .env.local`    |
| xaa.dev account        | Registered with **two** client pairs + your callback URI, on the **OIDC or SAML tab** matching your path. | See `hackathon-kit/reference/env-vars.md` § Registration walkthrough. |

Windows: use Git Bash / WSL for the curl + openssl commands. Generate
`SESSION_SECRET` with `[Convert]::ToBase64String((1..32 | %{Get-Random -Min 0 -Max 256}))`
in PowerShell as a fallback.

---

## Quick stack picker

The kit is library-agnostic, but you'll move faster with a known-good
defaults set:

| Language        | HTTP framework              | OIDC client                                          | SAML library *(SAML path only)*        | Session                          | Test runner   |
| --------------- | --------------------------- | ---------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------- |
| **Python**      | FastAPI                     | `authlib` or `oic`                                   | `python3-saml` or `pysaml2`             | `itsdangerous` cookie / Redis    | `pytest`      |
| **Node/TS**     | Express / Fastify / Next.js | `openid-client@6`                                    | `@node-saml/node-saml` or `samlify`     | `iron-session` (sealed cookie)   | `vitest`      |
| **Go**          | `chi` / Gin                 | `coreos/go-oidc` + `golang.org/x/oauth2`             | `crewjam/saml`                          | `gorilla/sessions` (cookie store)| `go test`     |
| **Rust**        | Axum                        | `openidconnect`                                      | `samael`                                | `tower-sessions` (cookie/Redis)  | `cargo test`  |
| **Java/Kotlin** | Spring Boot                 | `spring-security-oauth2-client`                      | `spring-security-saml2-service-provider`| Spring Session                   | JUnit 5       |
| **Ruby**        | Rails / Sinatra             | `omniauth_openid_connect`                            | `ruby-saml`                             | Rails session (cookie)           | RSpec         |
| **.NET**        | ASP.NET Core                | `Microsoft.AspNetCore.Authentication.OpenIdConnect`  | `Sustainsys.Saml2`                      | Cookie auth handler              | xUnit         |

Anything that speaks HTTPS, parses JSON, can SHA-256 + base64url, and
stores an httpOnly encrypted cookie will work.

> **On the SAML path, use a maintained library for assertion signature
> verification.** This is the one place in the kit where hand-rolling is
> actively dangerous — XML-DSIG signature-wrapping and XXE are both live
> risks, and both are easy to get subtly wrong. The OIDC path has no
> equivalent hazard.

---

## Repo layout

```
.
├── README.md                       (this file — your help doc)
├── CHANGELOG.md                    version history — what changed in v3
├── AGENTS.md                       auto-loaded by Codex / Cursor — invariants digest
├── CLAUDE.md                       auto-loaded by Claude Code — invariants digest
├── .cursorrules                    Cursor project rules
├── llms.txt                        AI-discoverable repo index
├── .env.example                    env template — copy to .env.local
└── hackathon-kit/                  (the spec — treat as read-only)
    ├── IGNITION.md                 paste-into-agent first message (Codex/Claude Code/Cursor)
    ├── MIGRATION-v2-to-v3.md       upgrading a working v2 (OIDC-only) build
    ├── 00-brief.md                 hackathon task brief + protocol choice
    ├── 01-project-skeleton.md      stack scaffold + env config + session + token storage
    ├── 02-user-login.md            OIDC (PKCE) or SAML (SSO + Step 0b) — branched
    ├── 03-token-exchange.md        RFC 8693 + RFC 7523 (the XAA core)
    ├── 04-protected-resource-call.md   bearer call + WWW-Authenticate + re-mint rule
    ├── 05-ui-and-observability.md  dashboard + log surface
    ├── 06-debugging-playbook.md    nineteen failure shapes + diagnostic prompts
    ├── 07-testing.md               hermetic + smoke + E1–E7 manual
    ├── ignition/
    │   └── chat-only.md            ignition variant for ChatGPT/Aider (no FS access)
    └── reference/
        ├── xaa-spec.md             canonical wire format, both paths
        ├── error-mapping.md        ErrorCode set + decoding tables
        ├── env-vars.md             fixed xaa.dev hosts + per-dev creds + registration walkthrough
        ├── architecture.md         flow diagrams
        └── glossary.md             terminology anchors (OIDC + SAML side by side)
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

1. Paste `hackathon-kit/00-brief.md` to set context — it opens with the
   protocol choice.
2. Paste the **Prompt** section of `hackathon-kit/01-project-skeleton.md`.
3. Apply the AI's output. Run the Verification commands.
4. If Issues match what you see, apply Fixes. Otherwise → step 5.
5. Repeat for `02 → 05` and `07`, pasting **only your path's branches**.
6. Run E1 and E6 against your real xaa.dev credentials (see
   `hackathon-kit/07-testing.md`). E6 is what proves the refresh anchor
   works; a build can pass E1 and still fail it.

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
- **Test runner.** Whatever ships with your stack. The hermetic
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
- **Multiple resources in one session.** Mint a separate ID-JAG per
  resource from the same refresh token — different `audience`/`resource`
  on Step 1. Section `hackathon-kit/reference/xaa-spec.md` § Step 1
  covers the parameters. (Don't reuse one ID-JAG across resources; its
  `aud` and `resource` are baked in.)
- **Access token caching.** The kit re-mints per call by default (the
  safe choice, and the only correct one for the ID-JAG, which lives 5
  minutes and may be single-use). The access token lives ~2 h and *could*
  be cached — key it by a hash of the refresh token so logout
  invalidates it implicitly, and set a TTL well under the upstream
  `expires_in`.
- **Both protocol paths in one app.** The kit deliberately has you build
  one. If you want a runtime switch, the seam is clean: everything from
  Step 1 onward is shared, so only Step 0/0b needs branching. Keep
  `XAA_PROTOCOL` per-session rather than per-process.
- **Production hardening.** Flip `secure: true` on the cookie, set
  `SameSite=Strict` if your callback origin matches (**not** on the SAML
  path — the ACS POST needs `Lax` or a `RelayState`-carried session id),
  rotate `SESSION_SECRET`, encrypt the refresh token at rest, and move
  the session store off-process.

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
- **One protocol path only.** Same reasoning, sharper consequences. If
  you paste both the OIDC and SAML branches of a step, expect a build
  that half-implements each. State your path once, up front.
- **Watch for the ID Token creeping back in.** Anchoring on the ID Token
  is the v2 pattern and it's what most training data contains, so an AI
  will drift toward it. If you see `subject_token_type=…:id_token` on
  Step 1, that's the drift — the correct value is
  `…:refresh_token`. Cite `hackathon-kit/reference/xaa-spec.md` § Step 1.
- **Don't accept an invented refresh-token lifetime.** xaa.dev doesn't
  document one. If the AI writes a countdown timer or a proactive-refresh
  scheduler based on a specific TTL, it made the number up.

---

## Contributing back

If your hackathon hits a failure shape that isn't in
`hackathon-kit/06-debugging-playbook.md`, or a stack-specific gotcha
that's worth calling out, open a PR. Each entry is short and follows the
same shape: Symptom → Root cause → Debugging prompt → Resolution.
