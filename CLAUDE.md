# CLAUDE.md

@AGENTS.md

> The digest above is imported from `AGENTS.md`, which is the single
> canonical agent file for this repo — Claude Code isn't yet on the
> [agents.md](https://agents.md) roster, so this thin file bridges it.
> Keep edits in `AGENTS.md`; don't fork the content here.

## Claude Code specifics

- **First action:** read `hackathon-kit/IGNITION.md` end-to-end, then ask
  the dev the application type (`standalone` or `mcp`) before the stack
  question. Protocol is fixed to OIDC — don't ask, don't read the SAML path.
- Don't record the dev's choices in a tracked file. Ask each session — a
  committed choice pre-answers the next developer's decisions.
- Prefer the Read/Edit tools over shell `cat`/`sed` when walking the kit —
  `hackathon-kit/` is a spec you read, not output you pipe.
- **Never read, print, or diff `.env.local`**, including via `cat`, `grep`
  or `diff`. Nothing in the repo enforces this. Ask the dev to fill it in
  themselves.
