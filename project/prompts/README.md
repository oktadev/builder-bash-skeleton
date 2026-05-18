# /prompts — AI-native development trail

Every major step of building this app is preserved here as a numbered prompt
file. Each file follows a fixed shape so a future engineer (or AI) can replay
the exact workflow against the same task spec.

```
00-original-task-prompt.md   ← verbatim user prompt (the brief)
01-project-setup.md
02-authentication.md
03-token-management.md
04-protected-api-calls.md
05-ui-dashboard.md
06-debugging.md
07-testing.md
```

## Per-prompt structure

Every step file documents:

| Section          | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| **Prompt**       | Exact natural-language instruction given to the AI assistant.   |
| **Objective**    | What we wanted out of the step.                                 |
| **Output**       | Files created/edited, decisions made.                           |
| **Issues**       | Anything that broke or required debugging.                      |
| **Fixes**        | The corrective action — including any debugging prompts issued. |
| **Verification** | How we proved the step worked (tests, curl, etc.).              |

## Replay protocol

1. Read `00-original-task-prompt.md`.
2. Open `01-…` and copy its **Prompt** section into your AI assistant.
3. Apply the resulting code, then run the **Verification** commands.
4. Repeat for `02-…` through `07-…`.

The numbering is the order you should execute. The chronology in the
**Issues / Fixes** sections of `06-debugging.md` reflects the real
debugging encountered during the original build, so you can predict and
prevent the same problems.
