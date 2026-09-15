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
- Record the answers below under `## Session choices` so a later session
  resumes on the same path instead of re-asking.
- Prefer Read/Edit over shell `cat`/`sed` when walking the kit — it's a spec
  you read, not output you pipe.
- `.env.local` is blocked from the file tools by design. Don't work around
  it; ask the developer to fill it in.
- `.claude/settings.json` pre-approves the kit's read-only probes, so those
  shouldn't prompt. Anything off that list still will — expected.
