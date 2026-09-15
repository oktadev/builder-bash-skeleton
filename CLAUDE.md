# CLAUDE.md

@AGENTS.md

> The digest above is imported from `AGENTS.md`, the single canonical agent
> file for this repo — Claude Code isn't yet on the
> [agents.md](https://agents.md) roster, so this thin file bridges it.
> Keep edits in `AGENTS.md`; don't fork the content here.

## Claude Code specifics

- **First action:** read `hackathon-kit/IGNITION.md`, then ask its three
  questions — protocol, app type, stack — in your first reply. Don't read the
  rest of the kit before asking.
- Record the answers in **`AGENTS.md`** under a `## Session choices` heading
  (not here — this file imports that one, and every other tool reads it too)
  so a later session resumes on the same path instead of re-asking.
- Prefer Read/Edit over shell `cat`/`sed` when walking the kit — it's a spec
  you read, not output you pipe.
- `.env.local` is blocked from the file tools by design. Don't work around
  it; ask the developer to fill it in.
- `.claude/settings.json` pre-approves the **direct** read-only probes (plain
  `curl` to the fixed hosts or localhost, `openssl rand`, `test -f`, `lsof`).
  **Piped probes still prompt** — a pipeline is one compound command and
  doesn't match a prefix rule — and that's deliberate: a blanket
  `Bash(curl:*)` would also permit exfiltration. Expect a prompt for the
  `| grep -q offline_access` checks.
