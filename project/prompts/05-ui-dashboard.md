# 05 — UI dashboard

## Prompt

> Build the App Router pages and shadcn/ui components:
>
> - `/login` — sign-in card with `LoginButton` and surface any
>   `?error=` from the callback redirect.
> - `/dashboard` — three-section layout:
>   1. Authenticated user (sub, email, name, loggedInAt)
>   2. Token state (ID Token presence + expiry, scopes)
>   3. Resource viewer (run XAA flow + render success/error)
>   4. Resource target config (URL/path/scopes)
>   5. Live observability log (poll `/api/logs` every 2s)
> - `/logs` — full-width observability page (poll every 1.5s).
> - `/` — redirect to `/dashboard` if logged in, else `/login`.
>
> Every async UI must show a loading state. Every error must show a
> distinct alert with an actionable hint (e.g. "expired → re-authenticate").
> Token values shown in the UI must be the redacted `head…tail` form.

## Objective

Make the XAA flow legible at a glance — the user should be able to
trigger the flow and see exactly what happened in the network and what
state the tokens are in.

## Output

| File                                | Notes                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| `app/layout.tsx`                    | Imports `globals.css`, sets metadata.                        |
| `app/page.tsx`                      | Server component: redirect by session.                       |
| `app/login/page.tsx`                | Server component: renders `?error=` if present.              |
| `app/dashboard/page.tsx`            | Server component: gates by session, renders the 5-card grid. |
| `app/logs/page.tsx`                 | Server component shell wrapping `<LogViewer pollMs={1500} />`. |
| `components/auth-button.tsx`        | `<LoginButton>` and `<LogoutButton>`.                         |
| `components/token-state.tsx`        | ID Token + access-token state cards with scope badges.        |
| `components/resource-viewer.tsx`    | "Call protected resource" button + `<SuccessView>` / `<ErrorView>`. |
| `components/log-viewer.tsx`         | Polling log buffer with `Refresh`/`Clear`.                    |
| `components/ui/{button,card,badge,alert}.tsx` | Vendored shadcn primitives.                       |

## Decisions

- **Server-rendered claims, client-rendered logs/calls.** Pages that
  show user identity are RSCs (no client JS for sensitive data). The
  resource-viewer and log-viewer must be `'use client'` because they
  fetch + poll from the browser.
- **Redacted tokens in UI.** The dashboard displays `head…tail` token
  fragments only — never the full bearer token, even though the user
  is the authenticated owner. This trains good muscle memory.
- **Polling, not WebSocket.** Logs poll at 1.5–2s. WebSocket would be
  marginally nicer but adds infrastructure for a dev-only tool — not
  worth the complexity.

## Issues

- Initial `auth-button.tsx` had a leftover `asChildLike` prop and a
  spurious `declare module 'react'` augmentation — reverted to a
  straightforward `onClick` handler.

## Fixes

```diff
- <Button asChildLike onClick={...}>...</Button>
+ <Button onClick={...}>...</Button>
- declare module 'react' { interface ButtonHTMLAttributes<T> { asChildLike?: boolean } }
```

## Verification

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/login
# → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/logs
# → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/
# → 307 (redirect to /login when no session)
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/dashboard
# → 307 (redirect to /login when no session — gate works)
```
