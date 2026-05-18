# IGNITION — paste this as your first message

> **Audience:** OpenAI Codex, Claude Code, Cursor agent, or any AI
> coding agent with filesystem and shell access.
> **Action for the dev:** copy this file's contents (everything below
> the line) into your agent's first message. Don't paste any of the
> other kit files — the agent reads them itself.

---

You are an AI coding agent helping me build a **Cross-App Access (XAA)
Requesting App** against the public xaa.dev playground. Treat this
message as durable instructions for the entire build session.

## 0. Source of truth

All specifications are in `./hackathon-kit/` (relative to the current
working directory). Treat these files as the authoritative spec — do
not guess wire format, error codes, or env-var names. If the spec is
ambiguous, ask me; do not invent.

If your agent supports a project-memory file (`AGENTS.md` for Codex,
`CLAUDE.md` for Claude Code, `.cursorrules` for Cursor), write a
short note there capturing my stack choice (Step 2 below) and a
pointer to `./hackathon-kit/IGNITION.md` so future sessions resume
correctly.

## 1. Pre-flight (do this before any code)

Run these checks in order. If any fails, stop and report — don't
attempt to fix it yourself.

1. `./hackathon-kit/` exists and contains `README.md`, `00-brief.md`,
   `01-project-skeleton.md` … `07-testing.md`, and a `reference/`
   subdirectory. If not, ask me where the kit lives.
2. Read these files in this order, fully:
   - `hackathon-kit/README.md`
   - `hackathon-kit/00-brief.md`
   - `hackathon-kit/reference/glossary.md`
   - `hackathon-kit/reference/env-vars.md`
   - `hackathon-kit/reference/xaa-spec.md`
   - `hackathon-kit/reference/error-mapping.md`
   - `hackathon-kit/reference/architecture.md`
3. Check the project root for `.env.local`. If it is **missing**,
   stop and tell me:
   > "No `.env.local` found. Follow the registration walkthrough at
   > `hackathon-kit/reference/env-vars.md` § Registration walkthrough,
   > copy the `.env.example` template, fill in your credentials, and
   > re-run me."
   Do **not** prompt me for credentials interactively — secrets stay
   out of the chat.
4. Check that the local toolchain meets the Day-0 checklist in
   `hackathon-kit/README.md` (language runtime, `openssl`, `curl`,
   free port). Report any gaps; stop if fundamentals are missing.

## 2. Stack decision (ask me once)

Show me `hackathon-kit/README.md` § Quick stack picker. Ask me:

> "Which row from the stack picker should I use? (Or specify a custom
> combination.)"

After I answer, **commit to that stack for the rest of the session**.
Do not silently switch frameworks mid-build, even if a different one
seems easier for a sub-task.

## 3. Execution loop (hard-gated)

For each of `01-project-skeleton.md`, `02-oidc-login.md`,
`03-token-exchange.md`, `04-protected-resource-call.md`,
`05-ui-and-observability.md`, `07-testing.md` — **in that order**:

1. **Read** the file fully. Re-read referenced sections of
   `reference/*.md` as needed.
2. **Implement** based on the Prompt section, applying the chosen
   stack's idioms. Stay within the file's scope — do not start the
   next numbered step yet.
3. **Run** the Verification commands in your shell. Capture output.
4. **Show me**:
   - the diff of files changed,
   - the verification command output,
   - any deviations from the Prompt and why.
5. **STOP.** Wait for me to say "continue" (or feedback) before
   moving to the next numbered file. This is a hard gate. Do not
   chain steps.

Skip `06-debugging-playbook.md` in the linear pass — it's a reference
for failure modes, not a step to execute. Use it when a verification
fails (see § 4).

## 4. Failure protocol

If a Verification command fails, or implementation hits an error you
can't immediately resolve:

1. **First, consult `hackathon-kit/06-debugging-playbook.md`.** Match
   the symptom to a `D-N` entry. Apply the diagnostic prompt and
   resolution.
2. If the symptom isn't catalogued, run the curl recipe at the bottom
   of `06-debugging-playbook.md` § Generic diagnostic recipes to
   reproduce the failure on the wire. This isolates client bugs from
   server/registration bugs.
3. Fix the root cause. **Do not bypass:**
   - no `--no-verify` on git commits,
   - no skipping the state/nonce checks,
   - no swallowing 401s as 200s,
   - no widening type unions to `any` to silence narrowing errors.
4. Re-run the Verification. Show me the new output.

If you've spent more than ~5 attempts on the same failure, stop and
report what you've tried — I'll unblock.

## 5. Invariants (apply throughout)

These are non-negotiable across every file you write:

- **PKCE S256.** Never `plain`. Verifier and challenge are base64url
  unpadded.
- **Server-side session only.** The raw ID Token never reaches the
  browser. The session is encrypted+signed; the cookie is httpOnly +
  `SameSite=Lax`.
- **Two distinct OAuth client pairs.** `CLIENT_*` for the IdP (Steps
  0 + 1); `RESOURCE_CLIENT_*` for the resource auth server (Step 2).
  Mixing them is the most common cause of opaque `invalid_client`
  failures.
- **Re-mint per call.** The resource access token is not cached;
  re-run Steps 1 + 2 on each `/api/call`.
- **State + nonce verified.** State on callback, nonce on ID Token.
- **URN spelling matters.** `urn:ietf:params:oauth:grant-type:token-exchange`
  (Step 1, hyphen between `token` and `exchange`).
  `urn:ietf:params:oauth:grant-type:jwt-bearer` (Step 2, hyphen
  between `jwt` and `bearer`). Token-type URNs end in `id_token`
  (underscore) and `id-jag` (hyphen).
- **Token redaction.** Every log line touching a token, secret,
  assertion, ID-JAG, or JWT is reduced to `<head>…<tail>` (16 char+)
  or `***` (≤16 char) before write. Match keys with
  `/(token|secret|assertion|jag|jwt)/i`.
- **Tagged-union error shape.** `{ ok: true, … } | { ok: false, error:
  ErrorCode, … }`. `ok` is a literal, not a `bool`. See
  `reference/error-mapping.md`.

## 6. Done state

After `07-testing.md` is green (18 hermetic tests pass + 9 smoke
probes return expected status codes):

1. Tell me you're ready for E1.
2. I'll run E1 (the manual end-to-end against real xaa.dev) per
   `hackathon-kit/07-testing.md` § E1 — Successful flow.
3. If E1 passes, capture the test output in `FINAL_VALIDATION.md` at
   the project root and stop.

If E2–E5 are also part of my acceptance criteria (they're documented
in `07-testing.md`), walk through them with me one at a time after
E1 passes.

## 7. What you must not do

- Do not modify files inside `./hackathon-kit/` itself. The kit is
  the spec; treat it as read-only.
- Do not commit `.env.local`, `keys/`, `*.pem`, or `*.key`.
- Do not invent libraries, env-var names, scopes, or URN strings.
- Do not chain numbered steps to "save time."
- Do not silently change the stack we agreed on in § 2.

---

**First action:** complete § 1 pre-flight, then ask me the § 2 stack
question. Stop there.
