# CLAUDE.md

@AGENTS.md

> The digest above is imported from `AGENTS.md`, which is the single
> canonical agent file for this repo — Claude Code isn't yet on the
> [agents.md](https://agents.md) roster, so this thin file bridges it.
> Keep edits in `AGENTS.md`; don't fork the content here.

## Claude Code specifics

- **First action:** read `hackathon-kit/IGNITION.md` end-to-end, then ask
  the dev the protocol question (OIDC or SAML) before the stack question.
- When you learn the dev's protocol and stack choices, record them here
  under a `## Session choices` heading so a later session resumes on the
  same path instead of re-asking.
- Prefer the Read/Edit tools over shell `cat`/`sed` when walking the kit —
  `hackathon-kit/` is a spec you read, not output you pipe.
- `.env.local` is blocked from the file tools by design. Don't work around
  it; ask the dev to fill it in themselves.
