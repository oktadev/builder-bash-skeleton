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
>   1. Authenticated user (`loggedInAt`, email, name, plus the subject —
>      see § Rendering the subject below, which differs by path).
>   2. Token state — show the **refresh token**'s presence (redacted
>      `head…tail`) and the requested scopes. The refresh token is the
>      session anchor; the ID-JAG and access token are re-minted per call
>      and shouldn't be surfaced in this card. (Render their `head…tail`
>      in the resource-viewer success alert instead.)
>
>      Also surface, honestly, what you *don't* know: the refresh token's
>      expiry is not documented by xaa.dev and isn't in the token
>      response, so show "expires: unknown" rather than inventing a
>      countdown. If you also kept the ID Token, label it clearly as
>      claims-only and *not* the anchor — otherwise the card teaches the
>      v2 mental model.
>   3. Resource viewer (button to call, success/error rendering).
>   4. Resource target config (URL, path, scopes, and `XAA_PROTOCOL` —
>      read-only).
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
> distinct icon/colour and an actionable hint. Surface
> `details.upstream_*` — including `upstream_step` — in a collapsed
> diagnostic panel.
>
> **`expired_token` needs two different alerts, not one.** This is the
> one place the UI must not collapse a code into a single state:
>
> | `details.upstream_step` | Message                                    | Action offered            |
> | ----------------------- | ------------------------------------------ | ------------------------- |
> | `step3`                 | "Access token expired — re-minted and retried." | None, or a "try again" if the retry also failed |
> | `step1` (`requiresReauth`) | "Your session has ended. Sign in again."| **Sign-in link.** Never a retry button. |
>
> Offering "retry" on a dead refresh token produces a button that cannot
> ever work. If `requiresReauth` is set, the only affordance is sign-in.
>
> **Rendering the subject.** The claim differs by path, so read
> whichever is present rather than hardcoding one:
> - **▸ OIDC path:** a plain `sub`.
> - **▸ SAML path:** a `sub_id` object with `format: "saml-nameid"`.
>   Render `nameid` as the display identity, and show `issuer` plus
>   `sp_name_qualifier` (when present) as secondary detail — under
>   SP-scoped NameIDs the qualifier is part of the identity, so hiding
>   it makes two distinct users look identical.
>
> Write the component to prefer `sub_id` when present and fall back to
> `sub`, displaying whichever it found. Don't assume `sub` exists on the
> SAML path — see `reference/xaa-spec.md` § ID-JAG structure for the
> open question there. `sub_id` is not a secret; render it in full.
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
| Resource viewer component        | Async fetch + 9 distinct render states (1 success + 7 errors + the `expired_token` split by `upstream_step`). |
| Token state component            | Renders **refresh-token** presence (redacted) + scopes from `/api/auth/session`. States expiry as unknown rather than guessing. |
| Subject renderer                 | Prefers `sub_id` (SAML, with `issuer` + `sp_name_qualifier`), falls back to `sub` (OIDC). |
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
  Audit: search the SSR output for any prefix of the raw **refresh
  token** (and the ID Token, and on the SAML path any assertion
  fragment). If it's there, your "safe" session view is leaking. Filter
  at the serialiser, not at the template. The refresh token is the worst
  possible thing to leak here — it has no expiry you know of and no way
  to revoke it.
- **CORS on `/api/logs`.** If your UI is a different origin (dev
  proxies), the fetch will fail. Either run UI and API on the same
  origin or set permissive CORS for the dev environment only.
- **Polling races on slow `/api/call`.** A new poll fires while a call
  is in-flight; the log entries appear out of sync with the viewer.
  Acceptable — the viewer is the source of truth for the call's
  outcome, not the log.

## Fixes

- Server-render the safe session view (claims + token state); never
  pass the raw refresh token, ID Token, or SAML assertion through the
  renderer.
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
2. Land on `/dashboard`. Confirm email + name + the subject (a `sub` on
   OIDC, or a `sub_id` with `nameid`/`issuer` on SAML) + a **redacted
   refresh token** marked present are visible. Confirm no raw token
   appears anywhere in the page source.
3. Click "Call protected resource". Confirm a 200 alert with a JSON
   body, redacted ID-JAG + access token chips, scope badges.
4. Switch to `/logs`. Confirm the lifecycle is recorded:
   `auth → token-exchange → jwt-bearer → resource-call`. On the SAML
   path an earlier `saml` + `token-exchange (step=0b)` pair precedes it.
5. **Click "Call protected resource" a second time.** Confirm it
   succeeds with `token-exchange → jwt-bearer → resource-call` again and
   **no new `auth` line** — the refresh token was reused. This is the E6
   check and the fastest way to catch a build that still anchors on the
   ID Token.
