# CLAUDE.md

> Auto-loaded by Claude Code. Treat as durable project context for any
> session in this repository.

## What this repo is

A **hackathon kit** for building a Cross-App Access (XAA) Requesting
App against the public xaa.dev playground. The kit at `hackathon-kit/`
is the **authoritative spec** — wire format, error codes, env-var
contract, verification commands. You bring the language and framework;
the kit dictates the protocol.

## First action

Read `hackathon-kit/IGNITION.md` end-to-end **before doing anything
else**. It contains the full execution loop, pre-flight checks, and
hard-gates. This file is a digest, not a substitute.

## Source-of-truth files (read in this order, fully)

1. `hackathon-kit/IGNITION.md` — the agent runbook
2. `hackathon-kit/README.md` — developer help doc
3. `hackathon-kit/00-brief.md` — task brief
4. `hackathon-kit/reference/glossary.md` — terminology
5. `hackathon-kit/reference/env-vars.md` — env-var contract
6. `hackathon-kit/reference/xaa-spec.md` — wire format
7. `hackathon-kit/reference/error-mapping.md` — ErrorCode set
8. `hackathon-kit/reference/architecture.md` — flow diagrams

The numbered prompts (`01-…` through `07-…`) are walked one at a time
under the IGNITION.md execution loop.

## Non-negotiable invariants

These apply to every file you write, in every language:

- **PKCE S256.** Never `plain`. Verifier and challenge are base64url
  unpadded.
- **Server-side session only.** The raw ID Token never reaches the
  browser. Cookie is httpOnly + `SameSite=Lax`.
- **Two distinct OAuth client pairs.** `CLIENT_*` for the IdP (Steps 0
  + 1); `RESOURCE_CLIENT_*` for the resource auth server (Step 2).
  Mixing them is the most common cause of opaque `invalid_client`
  failures.
- **Re-mint per call.** The resource access token is not cached; re-run
  Steps 1 + 2 on each `/api/call`.
- **State + nonce verified.** State on callback, nonce on ID Token.
- **URN spelling matters.**
  - `urn:ietf:params:oauth:grant-type:token-exchange` (Step 1)
  - `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2)
  - `urn:ietf:params:oauth:token-type:id_token` (underscore)
  - `urn:ietf:params:oauth:token-type:id-jag` (hyphen)
- **Token redaction.** Every log line touching a token, secret,
  assertion, ID-JAG, or JWT is reduced to `<head 8>…<tail 8>` (>16
  char) or `***` (≤16 char) before write. Match keys with
  `/(token|secret|assertion|jag|jwt)/i`.
- **Tagged-union error shape.** `{ ok: true, … } | { ok: false, error:
  ErrorCode, … }`. `ok` is a literal, not a `bool`.

## Hard rules

- **One numbered step at a time.** After each Verification passes, stop
  and wait for the dev to say "continue."
- **Never modify `hackathon-kit/`.** It is the spec; treat it as
  read-only.
- **Never commit `.env.local`, `keys/`, `*.pem`, or `*.key`.**
- **Never invent libraries, env-var names, scopes, or URN strings.**
  If the spec is ambiguous, ask the dev.
- **Never bypass safety checks** (`--no-verify`, swallowed 401s,
  widened type unions to silence narrowing) — fix the root cause.
- **Never mix stacks in one session.** Once the dev picks Python,
  don't drift into Node.

## Fixed environment (xaa.dev)

These three URLs are constants — never substitute, never templatise:

- `https://idp.xaa.dev` — IdP
- `https://auth.resource.xaa.dev` — resource auth server
- `https://api.resource.xaa.dev` — resource (Todo0 default)

Per-developer credentials come from
<https://xaa.dev/developer/register>. The dev fills `.env.local`
themselves; never solicit secrets in chat.

## When stuck

Consult `hackathon-kit/06-debugging-playbook.md` *before* trying random
fixes. It catalogs thirteen failure shapes with diagnostic prompts. If
none match, run the curl recipes at the bottom of that file to isolate
client bugs from server/registration bugs.

After ~5 failed attempts on the same issue, stop and report.
