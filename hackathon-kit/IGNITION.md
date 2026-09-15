# IGNITION — paste this as your first message

> **For the developer:** copy everything **between the two horizontal rules**
> below into your coding agent's first message — the appendix after the second
> rule is for you, not the agent. Don't paste any other kit file; the agent
> reads those itself. **Kit v4.**

---

You are helping me build a **Cross-App Access (XAA) Requesting App**
against the public xaa.dev playground. These are durable instructions for
the whole session.

## Ask me three questions now — before reading anything

Do **not** read any files yet. Ask all three in your first reply, in one
message, then wait:

1. **Protocol** — `oidc` or `saml`? *(default `oidc`: Authorization Code +
   PKCE. `saml` is SP-initiated SAML 2.0 SSO plus one extra exchange.)*
2. **App type** — `standalone` or `mcp`? *(default `standalone`: your app
   calls a REST resource with a Bearer token. `mcp` drives an MCP server
   through the official MCP SDK — one extra dependency, a fourth host.)*
3. **Stack** — language + HTTP framework? Offer me the rows from the root
   `README.md` § Stack picker (known-good OIDC/SAML/MCP library sets) rather
   than making me invent one. On `saml` also settle the SAML library; on `mcp`
   the **official** SDK (`@modelcontextprotocol/sdk`, or `mcp` for Python) is
   not a free choice.

If I say "defaults", that's `oidc` + `standalone` and you still need my stack.
**Commit to all three for the session** — never mix stacks or paths mid-build.

## Then, in order

1. Read `hackathon-kit/SPEC.md` — **only the branches matching my answers.**
   `### ▸ …` sections are alternatives; `> **… only.**` blocks are skippable
   when they aren't yours; unmarked text applies to everyone. Don't read the
   other branch "to be thorough" — it wastes context and invites mixing them.
2. Pre-flight, and stop if any fails: `.env.local` exists at the project root
   (if not, tell me to copy `.env.example` and fill it in from
   <https://xaa.dev/developer/register> — SPEC § Environment; **never ask me
   for secrets in chat**, and never read or write `.env.local` yourself);
   `openssl` and `curl` are present; my chosen runtime is installed; and
   **`date -u` is within ~30 s of real time** — xaa.dev allows only 30 s of
   skew on the ID-JAG, so clock drift breaks Step 2 with an error that looks
   like a code bug (DEBUG D-18). Also tell me the three values to put in
   `.env.local` for `XAA_PROTOCOL`, `APP_TYPE`, and `RESOURCE_SCOPES` based on
   my answers — the shipped defaults are `oidc`/`standalone`, so if I chose
   otherwise the file needs editing before Phase 1's config check passes.
3. Work through `hackathon-kit/BUILD.md` **one phase at a time** — read each
   phase when you reach it, not up front. Run that phase's single
   verification, then continue straight to the next.

**Exactly one stop:** after Phase 2 (login), because logging in needs my
browser and real credentials. Stop there, show me the diff and the
verification output, and wait. After I say continue, run Phases 3–6 to
completion and report once at the end. Don't gate on anything else.

Record my three answers in `AGENTS.md` under `## Session choices` so a
later session resumes on the same path instead of re-asking.

## Rules

- **`SPEC.md` is the source of truth** for wire format, error codes, and env
  var names. Never invent a library, env var, scope, or URN string — ask.
- **Never fill in a `TODO(confirm)`.** SPEC § Unverified collects all nine;
  each means stop and ask me.
- **Never invent a refresh-token lifetime.** xaa.dev documents none.
- **Never retry a rejected refresh token** — it can't be repaired, that's a
  re-authentication. SPEC § The two faces of `expired_token` is the single
  rule most builds get wrong.
- **`hackathon-kit/` is read-only** — the spec, not output. And never commit
  `.env.local`, `keys/`, `*.pem`, `*.key`.
- On failure check `hackathon-kit/DEBUG.md` (23 shapes, indexed by path)
  before improvising. After ~5 failed attempts on one issue, stop and report.

**First action: ask the three questions. Nothing else.**

---

## Appendix — chat-only tools (no filesystem access)

Using ChatGPT in a browser, or any tool that can't read your repo? Paste
manually instead: this file, then `SPEC.md` (your branches only), then each
`BUILD.md` phase as you reach it. Apply the output by hand, run the
verification yourself, and paste failures back with the matching `D-N`
entry from `DEBUG.md`. You'll also need to do Day 0 yourself — see the root
`README.md`. The agentic flow above is dramatically shorter because the
agent reads the files itself; prefer it when you can.
