# AGENTS.md

> The agent digest for this repo, per [agents.md](https://agents.md) —
> auto-loaded by Codex, Cursor, Copilot, Windsurf, Zed, Warp, Junie, Amp,
> Devin, goose, opencode, RooCode, Kilo and others; `CLAUDE.md` imports it.
> Two need one line of config: **Aider** (`.aider.conf.yml` → `read: AGENTS.md`)
> and **Gemini CLI** (`.gemini/settings.json` →
> `{"context":{"fileName":"AGENTS.md"}}`). For any other filename
> (`.clinerules`, `.windsurfrules`, `.junie/guidelines.md`) add a one-line
> pointer here rather than copying the content — copies go stale.
> **A digest, not the spec** — the spec is `hackathon-kit/SPEC.md`.

A hackathon kit for building a **Cross-App Access (XAA) Requesting App**
against the public xaa.dev playground. You bring the language and framework;
the kit dictates the protocol. **Kit v4.**

## First action

Read `hackathon-kit/IGNITION.md`. It has you ask the developer three
questions — protocol, app type, stack — **before reading anything else.** Do
that first; don't pre-read the kit.

## The four files

| File | What it's for |
| --- | --- |
| `hackathon-kit/IGNITION.md` | Entry point: the three questions, the build loop |
| `hackathon-kit/SPEC.md` | **The only reference.** Hosts, wire format for every step, URNs, env contract, ErrorCode set, invariants, all ten `TODO(confirm)` |
| `hackathon-kit/BUILD.md` | Six build phases. **One stop, after login.** |
| `hackathon-kit/DEBUG.md` | 28 failure shapes, indexed by path |

Never mix protocol paths or app types in one session. `### ▸ …` sections are
alternatives; `> **… only.**` blocks are skippable when they aren't yours.
Don't read the other branch — it wastes context and invites mixing them.

The flow, in one line: **login → hold a refresh token → [1] exchange it for
an ID-JAG → [2] exchange that for an access token → [3] use it**, re-running
1+2 on every protected call. Diagram and wire format in `SPEC.md`.

## The four things agents get wrong

Full list in `SPEC.md` § Invariants — read it there, it isn't duplicated
here. These four are where agents actually drift:

1. **The refresh token is the session anchor, not the ID Token.** Step 1
   sends `subject_token_type=urn:ietf:params:oauth:token-type:refresh_token`.
   Sending `…:id_token` is the v2 pattern and it's what most training data
   contains — it works for ~10 minutes, then fails.
2. **`offline_access` on Step 0 / 0b, and assert it came back.** No refresh
   token means no session past ~10 minutes, and the failure surfaces later
   as an unrelated-looking `invalid_grant`.
3. **`expired_token` is two states.** From Step 3 → re-mint and retry
   **once**, counter-bounded. From Step 1 → the refresh token is dead;
   **re-authenticate, never retry.** Branch on `details.upstream_step`.
   Conflating them is an infinite loop.
4. **Two client pairs, not interchangeable.** `CLIENT_*` at the IdP
   (Steps 0, 0b, 1); `RESOURCE_CLIENT_*` at the resource auth server
   (Step 2). The most common cause of opaque `invalid_client`.

*(mcp)* Plus: **the kit mints the token; the SDK receives it.** Never let
the SDK acquire its own — it would register a third client identity and
follow `mcp.xaa.dev`'s discovery document, which leaks unroutable internal
hostnames.

## Hard rules

- **`hackathon-kit/` is read-only** when building against the kit.
  (Maintaining the kit itself is a different job.)
- **Never commit** `.env.local`, `keys/`, `*.pem`, `*.key`. Never read or
  write `.env.local` — ask the developer to fill it in, and never solicit
  secrets in chat.
- **Never invent** libraries, env-var names, scopes, or URN strings — ask.
- **Never fill in a `TODO(confirm)`.** All nine are in `SPEC.md` § Unverified.
- **Never invent a refresh-token lifetime.** xaa.dev documents none, and
  there is **no revocation endpoint**. No countdown timers.
- **Never bypass a safety check** (`--no-verify`, swallowed 401s, widened
  type unions) — fix the root cause.
- **Never retry-loop a rejected refresh token.** It can't be repaired.
- **One stop only**, at the end of BUILD Phase 2. Don't gate elsewhere.

## Fixed hosts (never substitute)

`https://idp.xaa.dev` · `https://auth.resource.xaa.dev` ·
`https://api.resource.xaa.dev` · plus `https://mcp.xaa.dev/mcp` on
`APP_TYPE=mcp` only. Per-host discovery quirks, lifetimes, and the
registration walkthrough are in `SPEC.md`.
