# 05 — UI and observability

## Prompt

> Build a UI that makes the XAA flow legible at a glance. The shape of
> the UI is up to you (server-rendered templates, SPA, TUI, even a
> minimal HTML page) — but it must surface these states clearly.
>
> **Pages**
>
> - `/login` — sign-in entry. Surface any `?error=` from the callback
>   redirect with a distinct alert.
> - `/dashboard` — gated by session; redirect to `/login` if no
>   session. Cards or sections for:
>   1. Authenticated user (sub, email, name, loggedInAt).
>   2. Token state — show the **ID Token**'s presence + ISO `exp` +
>      requested scopes. The ID Token is the long-lived session anchor;
>      access tokens are re-minted per call and shouldn't be surfaced
>      in this card. (Render the access token's `head…tail` in the
>      resource-viewer success alert instead, alongside the ID-JAG.)
>   3. Resource viewer (button to call, success/error rendering).
>   4. Resource target config (URL, path, scopes — read-only).
>   5. Live observability log (poll `/api/logs` every 2 s).
> - `/logs` — full-width observability page (poll every 1.5 s) for when
>   you want the log front and centre.
> - `/` — redirect to `/dashboard` if logged in, else `/login`.
>
> **Resource viewer behaviour**
>
> On click → `POST /api/call`. While the request is in-flight, show a
> loading state. On success, render:
> - HTTP status, duration in ms.
> - The response body pretty-printed (JSON viewer or `<pre>`).
> - Token chips: ID-JAG and access token both as `head…tail`. Scopes as
>   small badges.
>
> On failure, render *one of seven* alerts keyed by `ApiError.error`
> per `reference/error-mapping.md` § ErrorCode set. Each alert shows a
> distinct icon/colour and an actionable hint (e.g. "expired →
> re-authenticate"). Surface `details.upstream_*` in a collapsed
> diagnostic panel.
>
> **Observability log**
>
> A scrolling list, newest first, of the ring buffer entries. Each row
> shows ISO timestamp, level, category, message, and a JSON pill for
> structured `data`. Token values must already be redacted by the
> server — don't re-redact in the client. Provide a "Clear" button
> that calls `DELETE /api/logs`.

## Objective

Give the developer (you, during the hackathon) and any reviewer enough
in-app visibility to debug end-to-end without opening DevTools.

## Output (capabilities, not files)

| Capability                       | Notes                                                                |
| -------------------------------- | -------------------------------------------------------------------- |
| Login page                       | Static; surfaces error query param.                                  |
| Dashboard page                   | Gated; renders the 5 sections.                                       |
| Logs page                        | Full-width observability.                                            |
| Resource viewer component        | Async fetch + 8 distinct render states (1 success + 7 errors).       |
| Token state component            | Renders ID Token presence + expiry + scopes from `/api/auth/session`. |
| Log viewer component             | Polls `/api/logs`. 1.5–2 s interval.                                 |

## Decisions to make

- **Polling interval.** 1.5–2 s is a sweet spot — fast enough to feel
  live, slow enough to be free. WebSockets are nicer but rarely worth
  the setup cost for a hackathon.
- **What to render server-side vs client-side.** Identity rendering
  benefits from server-side (no JS exposure of claims). Async fetches
  and polling have to be client-side. Pick what's idiomatic for your
  stack.
- **Redacted tokens in UI.** Even though the user owns the session,
  display tokens only in `head…tail` form. This builds the right
  muscle memory — the next person to look at this UI shouldn't be
  exposed to the raw bearer token.

## Issues you may hit

- **Logs page renders empty on first load.** The ring buffer is
  process-local; if your dev server cold-restarted, expect an empty
  buffer. This is correct behaviour.
- **Tokens leak via the route handler that renders the dashboard.**
  Audit: search the SSR output for any prefix of the raw ID Token. If
  it's there, your "safe" session view is leaking. Filter at the
  serialiser, not at the template.
- **CORS on `/api/logs`.** If your UI is a different origin (dev
  proxies), the fetch will fail. Either run UI and API on the same
  origin or set permissive CORS for the dev environment only.
- **Polling races on slow `/api/call`.** A new poll fires while a call
  is in-flight; the log entries appear out of sync with the viewer.
  Acceptable — the viewer is the source of truth for the call's
  outcome, not the log.

## Fixes

- Server-render the safe session view (claims + token state); never
  pass the raw ID Token through the renderer.
- If your stack's templating leaks objects via `__repr__` /
  `toJSON`, override it for the session type to redact.

## Verification

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:<port>/login
# → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:<port>/logs
# → 200
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:<port>/
# → 30x → /login (no session)
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:<port>/dashboard
# → 30x → /login (no session — gating works)
```

End-to-end visual check (E1):

1. Log in via `/login` against real xaa.dev.
2. Land on `/dashboard`. Confirm sub + email + redacted ID Token + ISO
   expiry are visible.
3. Click "Call protected resource". Confirm a 200 alert with a JSON
   body, redacted ID-JAG + access token chips, scope badges.
4. Switch to `/logs`. Confirm the four-step lifecycle is recorded:
   `auth → token-exchange → jwt-bearer → resource-call`.
