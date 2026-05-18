# IGNITION — chat-only tools (ChatGPT browser, Aider, etc.)

> **Use this** when your AI assistant **cannot read your filesystem
> directly** — e.g. ChatGPT in a browser tab, or any chat where you
> can't grant the model `cat`/`ls`/shell access.
>
> **For Codex, Claude Code, Cursor, or any agentic IDE tool**, use
> the root-level `IGNITION.md` instead — it's much shorter and lets
> the agent read the kit itself.

---

You're talking to an AI that can write code but **can't read your
files**. So you have to feed it the spec piece by piece. Use this
sequence:

## Step 1 — establish context (paste verbatim, one message)

```
You are a senior engineer helping me build a Cross-App Access (XAA)
Requesting App against the public xaa.dev playground. The full task
spec follows in subsequent messages — read each, but only act when I
explicitly ask you to implement something.

Non-negotiables across the whole build:
- PKCE S256, base64url unpadded
- Server-side session only; raw ID Token never reaches the browser
- Two distinct OAuth client pairs (CLIENT_* for IdP, RESOURCE_CLIENT_*
  for resource auth server) — never mix them
- Re-mint the resource access token per call (don't cache)
- State + nonce verified on every callback
- Token redaction: <head 8>…<tail 8> for strings >16 chars; *** for
  shorter; match keys with /(token|secret|assertion|jag|jwt)/i
- Tagged-union error shape: { ok: true, ... } | { ok: false, error,
  ... } with `ok` as a literal, not a bool
- URN spelling exactly:
    urn:ietf:params:oauth:grant-type:token-exchange  (Step 1)
    urn:ietf:params:oauth:grant-type:jwt-bearer      (Step 2)
    urn:ietf:params:oauth:token-type:id_token        (underscore)
    urn:ietf:params:oauth:token-type:id-jag          (hyphen)

Acknowledge with one line, then wait for the next message.
```

## Step 2 — paste the brief

Open `hackathon-kit/00-brief.md`. Copy the **entire file** into the
next message.

## Step 3 — paste the reference docs the AI will need

In one message, paste each of these in turn (or attach if the tool
supports attachments):

1. `hackathon-kit/reference/glossary.md`
2. `hackathon-kit/reference/env-vars.md`
3. `hackathon-kit/reference/xaa-spec.md`
4. `hackathon-kit/reference/error-mapping.md`
5. `hackathon-kit/reference/architecture.md`

Tell the AI: "These are reference; don't act yet. Confirm you've read
each."

## Step 4 — choose your stack

Open `hackathon-kit/README.md` § Quick stack picker. Pick a row. Tell
the AI which stack you've chosen and that it must commit to that for
the rest of the session.

## Step 5 — set up locally yourself

Without filesystem access the AI can't do this for you. Manually:

1. Confirm the Day-0 checklist (`hackathon-kit/README.md` § Day 0).
2. Register at `https://xaa.dev/developer/register` per
   `hackathon-kit/reference/env-vars.md` § Registration walkthrough.
3. Copy the `.env.example` template from
   `hackathon-kit/reference/env-vars.md` into `.env.local` and fill
   in your credentials.
4. Generate `SESSION_SECRET` with `openssl rand -base64 32`.

## Step 6 — execution loop (hard gate after every step)

For each of `01`, `02`, `03`, `04`, `05`, `07`:

1. Open `hackathon-kit/0N-….md`. Copy the **Prompt** section into a
   new message. Add: "Implement this in our chosen stack. After the
   code, list the verification commands I should run locally."
2. Apply the AI's output to your repo by hand.
3. Run the Verification commands locally. Paste the output back.
4. If verification fails: copy the relevant `D-N` entry from
   `hackathon-kit/06-debugging-playbook.md` plus the failing output
   into a new message. Ask the AI to apply the resolution.
5. Once verification passes: move to the next numbered file. Don't
   batch.

## Step 7 — done state

After `07-testing.md` passes (18 hermetic + 9 smoke probes):

1. Walk E1 manually per `hackathon-kit/07-testing.md` § E1.
2. If E1 passes, copy your test output into `FINAL_VALIDATION.md` at
   the project root.

## Why so much copy-pasting?

Chat-only tools have no view of your repo. The agentic flow in
`IGNITION.md` (root) is dramatically shorter because the agent reads
files itself. If you're hitting friction here, try Codex / Claude
Code / Cursor — the kit is designed to be ignited from a single
file in those.
