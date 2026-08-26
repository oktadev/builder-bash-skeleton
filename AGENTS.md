# AGENTS.md

> The single agent digest for this repo. Auto-loaded by Codex, Cursor,
> Copilot coding agent, Windsurf, Zed, Warp, Junie, Amp, Devin, Gemini
> CLI, goose, opencode, RooCode, Kilo, Aider and others per
> [agents.md](https://agents.md). `CLAUDE.md` imports this file.
>
> **A digest, not a substitute for the spec.** Read
> `hackathon-kit/IGNITION.md` before writing any code.

## What this repo is

A **hackathon kit** for building a Cross-App Access (XAA) Requesting App
against the public xaa.dev playground. The kit at `hackathon-kit/` is the
**authoritative spec** — wire format, error codes, env-var contract,
verification commands. You bring the language and framework; the kit
dictates the protocol.

**Kit version: v3.**

## First action

Read `hackathon-kit/IGNITION.md` end-to-end. It has the pre-flight
checks, the two decisions below, the hard-gated execution loop, and the
full invariant list.

## Two decisions, in this order

1. **Protocol path — OIDC or SAML.** Ask the dev *before* the stack
   question. **OIDC is the default**; pick it unless they say otherwise.
   Set `XAA_PROTOCOL` to match.
2. **Stack.** Ask once, then commit for the session.

Never implement both paths. In the prompt files, `### ▸ OIDC path` /
`### ▸ SAML path` are alternatives; `> **SAML path only.**` /
`> **OIDC path only.**` blocks are skippable. Unmarked text applies to
both. Don't read the other path's branches — it wastes context and
invites mixing them.

## The flow

```
OIDC:  authorize(+offline_access) ──► ID Token + REFRESH TOKEN ─┐
SAML:  SSO ─► assertion ─► [0b] ────► REFRESH TOKEN ────────────┤
                                                                ▼
       [1] refresh token → ID-JAG   [2] ID-JAG → access token   [3] Bearer call
                        └──── re-run 1+2 on every /api/call ────┘
```

Steps 0/0b diverge by path. Everything from Step 1 on is identical.

## The four things agents get wrong

The full invariant list is `hackathon-kit/reference/xaa-spec.md`
§ Invariants — read it there, it isn't duplicated here. These four are
called out because they're where agents actually drift:

1. **The refresh token is the session anchor, not the ID Token.**
   Step 1 sends `subject_token_type=urn:ietf:params:oauth:token-type:refresh_token`.
   Sending `…:id_token` is the v2 pattern and it's what most training
   data contains — it works for ~10 minutes, then fails. If you catch
   yourself writing `id_token` on Step 1, that's the drift.
2. **`offline_access` on Step 0 / Step 0b, and assert it came back.** No
   refresh token means no session past ~10 minutes, and the failure
   surfaces later as an unrelated-looking `invalid_grant`.
3. **`expired_token` is two states.** From Step 3 → re-mint and retry
   **once**, bounded by a counter. From Step 1 → the refresh token is
   dead; **re-authenticate, never retry.** Branch on
   `details.upstream_step`. Conflating them produces an infinite loop.
4. **Two client pairs are not interchangeable.** `CLIENT_*` at the IdP
   (Steps 0, 0b, 1); `RESOURCE_CLIENT_*` at the resource auth server
   (Step 2). This is the most common cause of opaque `invalid_client`.

## Hard rules

- **One numbered step at a time.** After each Verification passes, stop
  and wait for the dev to say "continue."
- **`hackathon-kit/` is read-only** when building against the kit.
  (Maintaining the kit itself is a different job.)
- **Never commit** `.env.local`, `keys/`, `*.pem`, `*.key`.
- **Never invent** libraries, env-var names, scopes, or URN strings. Ask.
- **Never fill in a `TODO(confirm)`** with a plausible value — those mark
  things unverified against xaa.dev. Ask.
- **Never invent a refresh-token lifetime.** xaa.dev documents none. No
  countdown timers, no proactive-refresh schedulers keyed to a made-up
  TTL.
- **Never bypass safety checks** (`--no-verify`, swallowed 401s, widened
  type unions to silence narrowing) — fix the root cause.
- **Never retry-loop a rejected refresh token.** It can't be repaired.
- **Never mix stacks or protocol paths** in one session.

## Fixed environment (xaa.dev)

Three constants — never substitute, never templatise:

| Host | Discovery |
| ---- | --------- |
| `https://idp.xaa.dev` | `/.well-known/openid-configuration`. SAML metadata at `/saml/metadata`. **`oauth-authorization-server` 404s here.** |
| `https://auth.resource.xaa.dev` | Use `/.well-known/oauth-authorization-server` — `openid-configuration` omits `authorization_grant_profiles_supported`. |
| `https://api.resource.xaa.dev` | Resource (Todo0 default). |

Lifetimes: ID Token ~10 min, ID-JAG 5 min (30 s `iat` skew tolerance),
access token ~2 h, refresh token **undocumented**. **No revocation
endpoint exists.**

Credentials come from <https://xaa.dev/developer/register> — it has an
**OIDC | SAML tab toggle**; use the tab matching the chosen path. The dev
fills `.env.local` themselves; never solicit secrets in chat.

## When stuck

`hackathon-kit/06-debugging-playbook.md` catalogs nineteen failure shapes
with diagnostic prompts, indexed by path. D-14–D-16 are SAML, D-6/D-7/D-12
are OIDC-only, D-17–D-19 cover refresh tokens, clock skew and retry
storms. If none match, the curl recipes at the bottom isolate client bugs
from server/registration bugs.

After ~5 failed attempts on the same issue, stop and report.
