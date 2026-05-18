# XAA Hackathon Kit

> **Status:** Tested against `xaa.dev` as of **2026-05-18**.
> Targets: Cross-App Access (ID-JAG) draft, RFC 8693 (Token Exchange),
> RFC 7523 (JWT-Bearer), RFC 7636 (PKCE), RFC 6750 (Bearer + WWW-Authenticate),
> RFC 8414 (Auth Server Metadata).

A stack-agnostic prompt set that walks an AI assistant through building
a working **Cross-App Access (XAA)** Requesting App against the public
[xaa.dev](https://xaa.dev) playground — in **any language or framework
you're comfortable with**.

The kit is **stack-agnostic, not host-agnostic**. xaa.dev is the only
target environment: `https://idp.xaa.dev` (IdP),
`https://auth.resource.xaa.dev` (resource auth server), and
`https://api.resource.xaa.dev` (Todo0 default resource). You bring the
language, framework, and AI assistant — the three host URLs are fixed.

You bring: a registered xaa.dev client pair, an AI assistant
(Claude / Cursor / Copilot / Cody / Aider / ChatGPT / etc.), and a few
hours.

You leave with: a working app that does OIDC + PKCE login, the
RFC 8693 + RFC 7523 token exchange, calls a protected API, handles
five distinct failure modes, and ships hermetic tests for the error
mapping.

---

## Quickstart — ignite the kit

Pick the path that matches your tool:

| Tool                                                    | Ignition file                  |
| ------------------------------------------------------- | ------------------------------ |
| **OpenAI Codex / Claude Code / Cursor agent / Aider with FS** | `IGNITION.md` (root) — paste verbatim as your first message; the agent reads the rest of the kit itself. |
| **ChatGPT (browser) / chat-only tools without FS access** | `ignition/chat-only.md` — copy-paste–driven, slower but works without shell access. |

Either way, finish Day 0 below first so the agent's pre-flight passes.

---

## Day 0 — before any AI prompt

Get these out of the way locally so the AI's first instruction can run
clean:

| Need                   | Why                                                                 | Quick check             |
| ---------------------- | ------------------------------------------------------------------- | ----------------------- |
| Language runtime       | Whatever you're building in (Python ≥3.11, Node ≥20, Go ≥1.22, …)   | `python --version` etc. |
| `openssl`              | Generate `SESSION_SECRET`.                                          | `openssl version`       |
| `curl`                 | Verification probes throughout the kit.                             | `curl --version`        |
| Free port              | Default `APP_URL=http://localhost:3000`. Pick another if 3000 is busy — change `APP_URL` + `REDIRECT_URI` together and re-register. | `lsof -i :3000`         |
| xaa.dev account        | Registered with **two** client pairs + your redirect URI.           | See registration walkthrough in `reference/env-vars.md`. |

Windows: use Git Bash / WSL for the curl + openssl commands. Generate
`SESSION_SECRET` with `[Convert]::ToBase64String((1..32 | %{Get-Random -Min 0 -Max 256}))`
in PowerShell as a fallback.

---

## Quick stack picker

The kit is library-agnostic, but you'll move faster with a known-good
defaults set. Pick the row closest to what you reach for daily:

| Language     | HTTP framework  | OIDC client            | Session                  | Test runner   |
| ------------ | --------------- | ---------------------- | ------------------------ | ------------- |
| **Python**   | FastAPI         | `authlib` or `oic`     | `itsdangerous` cookie / Redis | `pytest` |
| **Node/TS**  | Express / Fastify / Next.js | `openid-client@6` | `iron-session` (sealed cookie) | `vitest` |
| **Go**       | `chi` / Gin     | `coreos/go-oidc` + `golang.org/x/oauth2` | `gorilla/sessions` (cookie store) | `go test` |
| **Rust**     | Axum            | `openidconnect`        | `tower-sessions` (cookie/Redis) | `cargo test` |
| **Java/Kotlin** | Spring Boot  | `spring-security-oauth2-client` | Spring Session   | JUnit 5       |
| **Ruby**     | Rails / Sinatra | `omniauth_openid_connect` | Rails session (cookie) | RSpec |
| **.NET**     | ASP.NET Core    | `Microsoft.AspNetCore.Authentication.OpenIdConnect` | Cookie auth handler | xUnit |

These are starting points, not requirements. Anything that speaks
HTTPS, parses JSON, can SHA-256 + base64url, and stores an httpOnly
encrypted cookie will work.

---

## How to use the kit

1. **Register** at <https://xaa.dev/developer/register>. You get two
   client credential pairs (`CLIENT_*` for the IdP, `RESOURCE_CLIENT_*`
   for the resource auth server) and you choose a redirect URI. See
   `reference/env-vars.md` § Registration walkthrough for the form
   fields and gotchas.
2. **Skim** the five reference docs — each is short:
   - `reference/xaa-spec.md` — the exact wire format for both grants.
   - `reference/error-mapping.md` — the error code decision table.
   - `reference/env-vars.md` — the 12 env vars (3 fixed + 9 per-developer).
   - `reference/architecture.md` — flow diagrams.
   - `reference/glossary.md` — definitions for every term the kit uses
     (read first if OAuth/OIDC isn't second nature yet).
3. **Open `00-brief.md`** and paste it verbatim into your AI assistant.
   That's the task spec.
4. **Walk through `01-…` to `05-…` in order, then `07-…`.** `06-…` is
   the debugging playbook — jump in only when something breaks. Each
   file follows the same shape:
   - **Prompt** — the natural-language instruction to feed your AI.
   - **Objective** — what you should have when the step is done.
   - **Output** — a list of *capabilities* (modules / endpoints /
     behaviours), not files. Names are up to you and your stack.
   - **Issues** — failure modes you're likely to hit.
   - **Fixes** — what to try.
   - **Verification** — curl probes and behaviour checks that work on
     any stack.
5. **When you hit a wall**, jump to `06-debugging-playbook.md`. It
   catalogues the eleven failures every implementation runs into.
6. **Close out with `07-testing.md`** — the five mandatory end-to-end
   scenarios are non-negotiable.

The numbering is the order to execute. Skipping is fine if you're
confident, but the verification commands are designed to compose from
prior steps.

---

## What the kit does NOT prescribe

- **Language / framework.** Use Python (FastAPI, Flask, Django), Go
  (chi, gin, echo), Rust (Axum, Rocket), Java/Kotlin (Spring, Ktor),
  Ruby (Rails, Sinatra), Node (Express, Fastify, Next.js), Elixir
  (Phoenix), .NET (ASP.NET Core), or anything else with an HTTP server
  and a crypto library.
- **OIDC / OAuth library.** Whatever's idiomatic. The prompts describe
  *what* the wire format must be, not *which* library to call.
- **Session storage.** Encrypted-cookie (sealed cookie) or
  server-stored (Redis / sqlite / DB) — pick whichever fits.
- **UI shape.** Server-rendered templates, SPA, TUI, plain HTML — the
  kit just asks for surfaces with specific behaviour.

The reference Next.js implementation is at `../project/`. Look there
for *one* concrete way to build it, but don't feel obliged to mirror
its structure.

---

## File map

```
hackathon-kit/
├── README.md                       (this file)
├── IGNITION.md                     paste-into-agent first message (Codex/Claude Code/Cursor)
├── 00-brief.md                     hackathon task brief
├── 01-project-skeleton.md          stack scaffold + env config + session
├── 02-oidc-login.md                Authorization Code + PKCE login
├── 03-token-exchange.md            RFC 8693 + RFC 7523 (the XAA core)
├── 04-protected-resource-call.md   bearer call + WWW-Authenticate mapping
├── 05-ui-and-observability.md      dashboard + log surface
├── 06-debugging-playbook.md        thirteen failure shapes + diagnostic prompts
├── 07-testing.md                   T1–T5 hermetic + B1–B9 smoke + E1–E5 manual
├── ignition/
│   └── chat-only.md                ignition variant for ChatGPT/Aider (no FS access)
└── reference/
    ├── xaa-spec.md                 canonical wire format
    ├── error-mapping.md            ErrorCode set + decoding tables
    ├── env-vars.md                 fixed xaa.dev hosts + per-dev creds
    ├── architecture.md             flow diagrams
    └── glossary.md                 terminology anchors
```

---

## Replay protocol

For an AI to take you from zero to a working app:

1. Open `00-brief.md`. Copy the whole file into your AI assistant.
2. Open `01-project-skeleton.md`. Copy the **Prompt** section.
3. Apply the AI's output. Run the **Verification** commands.
4. If anything in **Issues** matches what you see, apply the **Fixes**.
5. Repeat for `02` through `05`, then `07`.
6. Run E1 against your real xaa.dev credentials (see `07-testing.md`).

Each prompt is self-contained — you can also feed an AI just `03-…` to
add token exchange to an existing app, or just `04-…` to harden an
existing call layer.

---

## Working with your AI assistant

A few practices that make the kit go smoothly with any AI coding tool:

- **Always paste `00-brief.md` first** — it's the system context. The
  numbered prompts assume the AI has read it.
- **Paste reference docs on demand.** If a step Prompt says "see
  `reference/xaa-spec.md` § Step 1", paste that section into the chat
  the first time it comes up. The AI shouldn't be guessing wire
  format.
- **One prompt per turn.** Don't paste `01` + `02` together — let the
  AI complete `01`, run the Verification, *then* paste `02`. The
  Verification commands gate the next step for a reason.
- **Share your repo state when correcting.** If the AI's output for
  `02` has a bug, paste the actual file it produced (or the diff)
  back, plus the failing curl/test output. Don't just say "it didn't
  work".
- **Keep the AI honest about libraries.** If the kit says "S256 PKCE,
  base64url unpadded" and the AI emits `code_challenge_method=plain`,
  push back with the spec citation. The Prompt sections are
  spec-anchored; the AI's defaults are not.
- **One stack only per session.** Don't mix Python and Node in one
  chat — the AI will helpfully drift between them. Pick one (see
  Quick stack picker above).

---

## Reference implementation

A working Next.js 16 + TypeScript implementation lives at
`../project/`. It mirrors this kit's structure 1:1 (its
`prompts/00-…07-…` are the framework-specific equivalents of the
files here). Use it as a sanity check when an answer here feels
ambiguous — but don't translate it line-for-line into your stack. The
kit is the spec; the project is one realisation of it.

---

## Contributing back

If your hackathon hits a failure shape that isn't in
`06-debugging-playbook.md`, or a stack-specific gotcha that's worth
calling out, open a PR adding it. Each entry is short and follows the
same shape: Symptom → Root cause → Debugging prompt → Resolution.
