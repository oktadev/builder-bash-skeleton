# IGNITION — chat-only tools (ChatGPT browser, Aider, etc.)

> **Use this** when your AI assistant **cannot read your filesystem
> directly** — e.g. ChatGPT in a browser tab, or any chat where you
> can't grant the model `cat`/`ls`/shell access.
>
> **For Codex, Claude Code, Cursor, or any agentic IDE tool**, use
> `hackathon-kit/IGNITION.md` instead — it's much shorter and lets
> the agent read the kit itself.
>
> **Kit version: v3.** Two protocol paths (OIDC and SAML); the IdP
> refresh token is the session anchor.

---

You're talking to an AI that can write code but **can't read your
files**. So you have to feed it the spec piece by piece. Use this
sequence:

## Step 1 — pick your protocol path (decide this first, yourself)

Before you paste anything, decide:

- **OIDC** (default, recommended) — Authorization Code + PKCE login.
  Pick this unless you have a specific reason not to. Fewer moving
  parts, and it's the path xaa.dev's own docs cover.
- **SAML** — SP-initiated SAML 2.0 Web Browser SSO, then one extra
  exchange (Step 0b) to trade the assertion for a refresh token. Pick
  this if you're modelling an app whose IdP integration is already
  SAML, or you specifically want to exercise the SAML path.

**Everything from Step 1 of the flow onward is identical on both
paths.** This is one fork near the start, not two builds.

When you paste kit sections later, **paste only the branches for your
path** — sections are marked `### ▸ OIDC path` / `### ▸ SAML path`, and
whole-step skips are marked `> **SAML path only.**` /
`> **OIDC path only.**`. Pasting both will make the AI mix them.

## Step 2 — establish context (paste verbatim, one message)

Replace `<OIDC|SAML>` with your choice from Step 1.

```
You are a senior engineer helping me build a Cross-App Access (XAA)
Requesting App against the public xaa.dev playground. I am building the
<OIDC|SAML> path. The full task spec follows in subsequent messages —
read each, but only act when I explicitly ask you to implement
something.

Non-negotiables across the whole build:
- The IdP REFRESH TOKEN is the session anchor, obtained by requesting the
  offline_access scope, and presented as subject_token on every ID-JAG
  exchange. Long-lived: server-side session only, never the browser,
  never a log, never an env file.
- Never anchor on the ID Token (~10 min on xaa.dev; good for roughly one
  exchange right after login).
- The resource auth server does NOT issue a refresh token, by design.
  Access token expired → mint a new ID-JAG from the refresh token.
- expired_token means two things: from the resource call, re-mint and
  retry ONCE; from the ID-JAG exchange, the refresh token is dead and the
  user must re-authenticate. Never retry-loop a dead refresh token.
- Two OAuth client pairs, never mixed: CLIENT_* at the IdP (Steps 0/0b/1),
  RESOURCE_CLIENT_* at the resource auth server (Step 2).
- Re-mint the ID-JAG and access token per call; the ID-JAG lives 5 min
  and may be single-use.
- No raw token of any kind reaches the browser.
- Token redaction: <head 8>…<tail 8> for strings >16 chars, *** for
  shorter; match keys with /(token|secret|assertion|jag|jwt)/i.
  SAMLResponse does NOT match that regex — handle it explicitly.
- Tagged-union errors: { ok: true, ... } | { ok: false, error, ... },
  with `ok` a literal, not a bool.
- OIDC only: PKCE S256 base64url unpadded; state + nonce verified.
- SAML only: RelayState, InResponseTo, and AudienceRestriction verified;
  assertion base64url-encoded UNPADDED.
- URN spelling exactly:
    urn:ietf:params:oauth:grant-type:token-exchange  (Steps 0b + 1)
    urn:ietf:params:oauth:grant-type:jwt-bearer      (Step 2)
    urn:ietf:params:oauth:token-type:saml2           (Step 0b subject)
    urn:ietf:params:oauth:token-type:refresh_token   (Step 1 subject)
    urn:ietf:params:oauth:token-type:id-jag          (hyphen)

Some spec details are marked TODO(confirm) — unverified against
xaa.dev. If you hit one, ask me; don't guess a value.

Acknowledge with one line, then wait for the next message.
```

## Step 3 — paste the brief

Open `hackathon-kit/00-brief.md`. Copy the **entire file** into the
next message.

## Step 4 — paste the reference docs the AI will need

In one message, paste each of these in turn (or attach if the tool
supports attachments):

1. `hackathon-kit/reference/glossary.md`
2. `hackathon-kit/reference/env-vars.md`
3. `hackathon-kit/reference/xaa-spec.md`
4. `hackathon-kit/reference/error-mapping.md`
5. `hackathon-kit/reference/architecture.md`

Tell the AI: "These are reference; don't act yet. Confirm you've read
each."

If you're on the OIDC path you can safely omit the SAML-marked sections
of `xaa-spec.md` and `architecture.md` to save context — and vice versa.

## Step 5 — choose your stack

Open the root `README.md` § Quick stack picker. Pick a row. Tell the AI
which stack you've chosen and that it must commit to that for the rest
of the session. On the SAML path, also pick the SAML library from that
table's SAML column — assertion signature verification is not something
to hand-roll.

## Step 6 — set up locally yourself

Without filesystem access the AI can't do this for you. Manually:

1. Confirm the Day-0 checklist (root `README.md` § Day 0).
2. Register at `https://xaa.dev/developer/register` per
   `hackathon-kit/reference/env-vars.md` § Registration walkthrough.
   **Pick the OIDC or SAML tab to match your path.**
3. Copy the `.env.example` template from
   `hackathon-kit/reference/env-vars.md` into `.env.local` and fill
   in your credentials. Set `XAA_PROTOCOL` to match your path.
4. Generate `SESSION_SECRET` with `openssl rand -base64 32`.

## Step 7 — execution loop (hard gate after every step)

For each of `01`, `02`, `03`, `04`, `05`, `07`:

1. Open `hackathon-kit/0N-….md`. Copy the **Prompt** section into a
   new message — **only the branches for your path**. Add: "Implement
   this in our chosen stack. After the code, list the verification
   commands I should run locally."
2. Apply the AI's output to your repo by hand.
3. Run the Verification commands locally. Paste the output back.
4. If verification fails: copy the relevant `D-N` entry from
   `hackathon-kit/06-debugging-playbook.md` plus the failing output
   into a new message. Ask the AI to apply the resolution. (D-14–D-19
   are SAML and refresh-token entries; D-6/D-7/D-12 are OIDC-only.)
5. Once verification passes: move to the next numbered file. Don't
   batch.

Note step `02` is `02-user-login.md` — it contains both paths, branched.

## Step 8 — done state

After `07-testing.md` passes (hermetic + smoke probes):

1. Walk E1 manually per `hackathon-kit/07-testing.md` § E1.
2. If E1 passes, copy your test output into `FINAL_VALIDATION.md` at
   the project root.

E6 (refresh) and E7 (SAML end-to-end) are new in v3 — run whichever
apply to your path.

## Why so much copy-pasting?

Chat-only tools have no view of your repo. The agentic flow in
`hackathon-kit/IGNITION.md` is dramatically shorter because the agent
reads files itself. If you're hitting friction here, try Codex / Claude
Code / Cursor — the kit is designed to be ignited from a single
file in those.
