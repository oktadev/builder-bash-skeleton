# IGNITION — paste this as your first message

> **Audience:** OpenAI Codex, Claude Code, Cursor agent, or any AI
> coding agent with filesystem and shell access.
> **Action for the dev:** copy this file's contents (everything below
> the line) into your agent's first message. Don't paste any of the
> other kit files — the agent reads them itself.
>
> **Kit version: v3.** New since v2: two protocol paths (OIDC and SAML),
> and the IdP refresh token as the session anchor.

---

You are an AI coding agent helping me build a **Cross-App Access (XAA)
Requesting App** against the public xaa.dev playground. Treat this
message as durable instructions for the entire build session.

## 0. Source of truth

All specifications are in `./hackathon-kit/` (relative to the current
working directory). Treat these files as the authoritative spec — do
not guess wire format, error codes, or env-var names. If the spec is
ambiguous, ask me; do not invent.

Some spec details are marked `TODO(confirm)` — they could not be
verified against xaa.dev at the time of writing. When you hit one, stop
and ask me rather than filling in a plausible value.

This repo's agent digest is `AGENTS.md` (the
[agents.md](https://agents.md) standard, read by most agents; `CLAUDE.md`
imports it). Append a short note there capturing my protocol choice
(§ 2 below) and stack choice (§ 3) so future sessions resume on the same
path instead of re-asking.

## 1. Pre-flight (do this before any code)

Run these checks in order. If any fails, stop and report — don't
attempt to fix it yourself.

1. `./hackathon-kit/` exists and contains `00-brief.md`,
   `01-project-skeleton.md` … `07-testing.md`, and a `reference/`
   subdirectory. If not, ask me where the kit lives.
2. Read these files in this order, fully:
   - `README.md` (repo root — the developer help doc)
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
4. Check that the local toolchain meets the Day-0 checklist in the root
   `README.md` (language runtime, `openssl`, `curl`, free port). Report
   any gaps; stop if fundamentals are missing.

## 2. Protocol decision (ask me first)

**Ask me this before anything else, including the stack question:**

> "Which XAA protocol path — **OIDC** or **SAML**?
>
> - **OIDC** (default, recommended): Authorization Code + PKCE login.
>   Pick this unless you have a specific reason not to. Fewer moving
>   parts, and it's the path xaa.dev's own docs cover.
> - **SAML**: SP-initiated SAML 2.0 Web Browser SSO, then one extra
>   exchange (Step 0b) to trade the assertion for a refresh token.
>   Pick this if you're modelling an app whose IdP integration is
>   already SAML, or you specifically want to exercise the SAML path.
>
> If you have no constraint, say OIDC."

This decision determines what Step 0 looks like, which env vars matter,
and whether Step 0b runs at all. **Everything from Step 1 onward is
identical on both paths** — so this is one fork, not two builds.

Set `XAA_PROTOCOL` in `.env.local` to match, and **commit to that path
for the rest of the session.**

When you read the kit's prompt files, sections are marked:
- `### ▸ OIDC path` / `### ▸ SAML path` — do the one that matches.
- `> **SAML path only.**` / `> **OIDC path only.**` — skip if it isn't
  yours.
- Unmarked text applies to both.

Do not implement both paths. Do not read the other path's branches to
"be thorough" — it wastes context and invites mixing them.

## 3. Stack decision (ask me once)

Show me the root `README.md` § Quick stack picker. Ask me:

> "Which row from the stack picker should I use? (Or specify a custom
> combination.)"

If I chose SAML in Step 2, also confirm the SAML library for that
stack — the picker has a column for it. Signature verification on a
SAML assertion is not something to hand-roll.

After I answer, **commit to that stack for the rest of the session**.
Do not silently switch frameworks mid-build, even if a different one
seems easier for a sub-task.

## 4. Execution loop (hard-gated)

For each of `01-project-skeleton.md`, `02-user-login.md`,
`03-token-exchange.md`, `04-protected-resource-call.md`,
`05-ui-and-observability.md`, `07-testing.md` — **in that order**:

1. **Read** the file fully. Re-read referenced sections of
   `reference/*.md` as needed. Follow only the branches for my chosen
   protocol path.
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
fails (see § 5).

## 5. Failure protocol

If a Verification command fails, or implementation hits an error you
can't immediately resolve:

1. **First, consult `hackathon-kit/06-debugging-playbook.md`.** Match
   the symptom to a `D-N` entry. Apply the diagnostic prompt and
   resolution. D-14 through D-19 are the SAML and refresh-token
   entries; D-6, D-7, and D-12 are OIDC-only.
2. If the symptom isn't catalogued, run the curl recipe at the bottom
   of `06-debugging-playbook.md` § Generic diagnostic recipes to
   reproduce the failure on the wire. This isolates client bugs from
   server/registration bugs.
3. Fix the root cause. **Do not bypass:**
   - no `--no-verify` on git commits,
   - no skipping the state/nonce (OIDC) or `InResponseTo`/audience
     (SAML) checks,
   - no swallowing 401s as 200s,
   - no widening type unions to `any` to silence narrowing errors,
   - no retry loop on a rejected refresh token — that's a re-auth, not
     a retry.
4. Re-run the Verification. Show me the new output.

If you've spent more than ~5 attempts on the same failure, stop and
report what you've tried — I'll unblock.

## 6. Invariants (apply throughout)

**The canonical list is `reference/xaa-spec.md` § Invariants** — read it
there, once, during § 1 pre-flight. It is not duplicated here.

These four are repeated because they're where agents actually drift:

1. **The refresh token is the session anchor, not the ID Token.** Step 1
   sends `subject_token_type=…:refresh_token`. Sending `…:id_token` is
   the v2 pattern most training data contains; it works for ~10 minutes,
   then fails. If you find yourself writing `id_token` on Step 1, that's
   the drift.
2. **`offline_access` on Step 0 / Step 0b — and assert it came back.** No
   refresh token means no session past ~10 minutes, and it resurfaces
   later as an unrelated-looking `invalid_grant`.
3. **`expired_token` is two states.** From Step 3 → re-mint, retry
   **once**, bounded by a counter. From Step 1 → the refresh token is
   dead; **re-authenticate, never retry.** Branch on
   `details.upstream_step`. Conflating them is an infinite loop.
4. **The two client pairs aren't interchangeable.** `CLIENT_*` at the IdP
   (Steps 0, 0b, 1); `RESOURCE_CLIENT_*` at the resource auth server
   (Step 2). Most common cause of opaque `invalid_client`.

## 7. Done state

After `07-testing.md` is green (hermetic tests pass + smoke probes
return expected status codes):

1. Tell me you're ready for E1.
2. I'll run E1 (the manual end-to-end against real xaa.dev) per
   `hackathon-kit/07-testing.md` § E1 — Successful flow.
3. If E1 passes, capture the test output in `FINAL_VALIDATION.md` at
   the project root and stop.

E2–E7 are documented in `07-testing.md`. E6 (refresh) and E7 (SAML
end-to-end) are new in v3. Walk through them with me one at a time
after E1 passes if they're part of my acceptance criteria.

## 8. What you must not do

- Do not modify files inside `./hackathon-kit/` itself. The kit is
  the spec; treat it as read-only. *(This applies to you as a
  participant building against the kit. Maintainers updating the kit
  itself are a different job.)*
- Do not commit `.env.local`, `keys/`, `*.pem`, or `*.key`.
- Do not invent libraries, env-var names, scopes, or URN strings.
- Do not fill in a `TODO(confirm)` with a guess — ask me.
- Do not chain numbered steps to "save time."
- Do not silently change the protocol path (§ 2) or the stack (§ 3) we
  agreed on.
- Do not implement both protocol paths.

---

**First action:** complete § 1 pre-flight, then ask me the § 2 protocol
question. Stop there.
