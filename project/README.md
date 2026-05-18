# XAA Requesting App (Next.js)

A reproducible **Cross-App Access (XAA / ID-JAG)** Requesting Application
built for the [xaa.dev](https://xaa.dev) playground. Demonstrates an
AI-native development workflow end to end — every prompt, debug step,
and validation artifact is preserved in this repo.

---

## 1. What this is

A Next.js 16 App Router app that:

1. Authenticates a user against `https://idp.xaa.dev` via OIDC
   Authorization Code + PKCE.
2. Runs the two-step XAA flow to mint a resource access token:
   - **RFC 8693** Token Exchange (`ID Token → ID-JAG`)
   - **RFC 7523** JWT-Bearer Grant (`ID-JAG → access token`)
3. Calls a protected resource (defaults to the Todo0 REST API at
   `https://api.resource.xaa.dev/api/todos`) with the bearer token.
4. Renders the protected data, token state, and a live request log.
5. Handles unauthorized, invalid-token, expired-token, and resource
   failure paths with distinct UI states.

---

## 2. Architecture

```
Browser → Next.js (RSC + route handlers) → xaa.dev IdP
                                          ↓ (ID-JAG)
                                          xaa.dev resource auth-server
                                          ↓ (access token)
                                          xaa.dev resource API (Todo0/BYOR)
```

Server-only:

- iron-session encrypts the OIDC ID Token + PKCE transaction into a
  single httpOnly cookie. The browser never sees raw tokens.
- The two OAuth clients (`CLIENT_ID/SECRET` and
  `RESOURCE_CLIENT_ID/SECRET`) authenticate the two grant calls.
- An in-memory ring buffer (last 200 entries) drives the
  observability panel; token values are redacted to `head…tail`.

Client-only:

- `<ResourceViewer>` triggers `POST /api/call` and renders success or
  one of seven distinct error states.
- `<LogViewer>` polls `/api/logs` every 1.5–2 s.

See **`FINAL_VALIDATION.md`** for full architecture + flow diagrams.

---

## 3. Auth & token flow (TL;DR)

| Step | What                                                | Where                |
| ---- | --------------------------------------------------- | -------------------- |
| 1    | OIDC Authorization Code + PKCE login                | `lib/oidc.ts`        |
| 2    | Token Exchange (`subject_token=<ID Token>` → ID-JAG)| `lib/token-exchange.ts` |
| 3    | JWT-Bearer Grant (`assertion=<ID-JAG>` → access tok)| `lib/token-exchange.ts` |
| 4    | `GET /api/todos` with `Authorization: Bearer ...`   | `lib/resource-call.ts`  |
| 5    | Render result / error                               | `components/resource-viewer.tsx` |

---

## 4. API surface

| Route                    | Method | Description                                          |
| ------------------------ | ------ | ---------------------------------------------------- |
| `/`                      | GET    | Redirect by session                                  |
| `/login`                 | GET    | OIDC sign-in card                                    |
| `/dashboard`             | GET    | User + token state + resource viewer + logs         |
| `/logs`                  | GET    | Full-width observability                             |
| `/api/auth/login`        | GET    | Start PKCE flow → 302 to IdP                        |
| `/api/auth/callback`     | GET    | OIDC callback → store user → 302 to /dashboard      |
| `/api/auth/logout`       | POST   | Destroy session                                      |
| `/api/auth/session`      | GET    | Safe-to-render session state (no raw tokens)        |
| `/api/call`              | POST   | Run XAA flow + fetch resource                        |
| `/api/logs`              | GET    | Read in-memory log buffer                            |
| `/api/logs`              | DELETE | Clear log buffer                                     |

---

## 5. Setup

```bash
cd project
cp .env.example .env.local
# Fill in values from https://xaa.dev/developer/register
# Generate a session secret:
openssl rand -base64 32

npm install
```

### Required env vars

| Var                       | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `IDP_URL`                 | OIDC issuer (default `https://idp.xaa.dev`)        |
| `CLIENT_ID` / `_SECRET`   | OIDC client at the IdP                             |
| `AUTH_SERVER_URL`         | Resource auth server (default `https://auth.resource.xaa.dev`) |
| `RESOURCE_CLIENT_ID` / `_SECRET` | Client at the resource auth server         |
| `RESOURCE_URL`            | Resource server origin (default `https://api.resource.xaa.dev`) |
| `RESOURCE_PATH`           | Resource path (default `/api/todos`)               |
| `RESOURCE_SCOPES`         | Comma-separated (default `todos.read`)             |
| `APP_URL` / `REDIRECT_URI`| App URL + callback URI                             |
| `SESSION_SECRET`          | 32+ char random — encrypts iron-session cookie     |

---

## 6. Local development

```bash
npm run dev          # Next dev on http://localhost:3000
npm run build        # Production build
npm start            # Run production build
npm run lint         # ESLint via next lint
npm run typecheck    # tsc --noEmit
npm test             # Vitest
npm run test:watch   # Vitest watch mode
```

---

## 7. Testing workflow

```bash
npm test             # 25 hermetic tests, no network
npm run typecheck    # strict TypeScript
npm run dev          # ready in <1s, smoke-test routes
```

Plus the manual end-to-end scenarios E1–E5 in
**`testing/test-cases.md`** that drive the live xaa.dev flow:

1. **E1** Successful flow — login, call, success.
2. **E2** Unauthorized — call without session, dashboard gate.
3. **E3** Invalid token — wrong audience/resource → upstream rejection.
4. **E4** Expired token — wait or simulate `invalid_grant`.
5. **E5** API failure — pointed at unreachable resource.

Expected results live in **`testing/expected-results.md`**.

---

## 8. AI tools used

- **Claude Code** (CLI / Sonnet/Opus) drove the build. The full session
  trail — the original brief, every step prompt, every debugging
  prompt, and every fix — lives under **`prompts/`**.
- **`openid-client@6`** — battle-tested OIDC library. Carries the spec
  details (PKCE, state, nonce, generic grant requests) so the app can
  focus on the XAA semantics.
- **`iron-session@8`** — sealed-cookie session store; no separate
  session DB needed.
- **shadcn/ui** primitives — vendored in tree (no CLI dependency at
  build time).
- **`vitest@2`** with mocked `globalThis.fetch` — hermetic test suite.

---

## 9. Prompt preservation

Every step is reproducible from the prompts:

```
prompts/
├── 00-original-task-prompt.md   ← the user's brief, verbatim
├── 01-project-setup.md
├── 02-authentication.md
├── 03-token-management.md
├── 04-protected-api-calls.md
├── 05-ui-dashboard.md
├── 06-debugging.md              ← every issue + the prompt that fixed it
├── 07-testing.md
└── README.md                    ← per-prompt file structure + replay protocol
```

Each prompt file documents: **Prompt → Objective → Output → Issues →
Fixes → Verification**.

---

## 10. Reproduction guide

To reproduce this app from scratch with another AI assistant:

1. Start with the `prompts/00-original-task-prompt.md` brief — that is
   what the human asked for.
2. Walk `prompts/01-…` through `prompts/07-…` in order. Each step's
   **Prompt** section is a self-contained instruction that produces the
   files in its **Output** table.
3. After each step, run the commands in **Verification** to confirm the
   step landed.
4. The **Issues** and **Fixes** sections in `06-debugging.md` are the
   real debugging encountered during the original build. If your
   assistant produces the same shape of code, you'll hit the same
   issues — and the recorded fixes will resolve them in one move.
5. The full validation evidence is in `FINAL_VALIDATION.md`.

---

## 11. Project layout

```
project/
├── app/
│   ├── api/
│   │   ├── auth/{login,callback,logout,session}/route.ts
│   │   ├── call/route.ts
│   │   └── logs/route.ts
│   ├── dashboard/page.tsx
│   ├── login/page.tsx
│   ├── logs/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/{button,card,badge,alert}.tsx
│   ├── auth-button.tsx
│   ├── log-viewer.tsx
│   ├── resource-viewer.tsx
│   └── token-state.tsx
├── lib/
│   ├── config.ts
│   ├── logger.ts
│   ├── oidc.ts
│   ├── resource-call.ts
│   ├── session.ts
│   ├── token-exchange.ts
│   ├── types.ts
│   └── utils.ts
├── tests/
│   ├── setup.ts
│   ├── config.test.ts
│   ├── logger.test.ts
│   ├── oidc.test.ts
│   ├── resource-call.test.ts
│   ├── token-exchange.test.ts
│   └── utils.test.ts
├── prompts/
│   ├── 00-original-task-prompt.md
│   ├── 01-project-setup.md
│   ├── 02-authentication.md
│   ├── 03-token-management.md
│   ├── 04-protected-api-calls.md
│   ├── 05-ui-dashboard.md
│   ├── 06-debugging.md
│   ├── 07-testing.md
│   └── README.md
├── testing/
│   ├── test-plan.md
│   ├── test-cases.md
│   ├── expected-results.md
│   └── known-limitations.md
├── .env.example
├── FINAL_VALIDATION.md
├── README.md
├── next.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```
