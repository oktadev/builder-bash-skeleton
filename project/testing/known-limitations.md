# Known limitations

## Scope

These are intentional simplifications — none of them affect the
functional success criteria, but they're worth documenting so a
future maintainer knows what's in/out of bounds.

## 1. Single resource target

The app is configured against ONE resource (`RESOURCE_URL` +
`RESOURCE_PATH` + `RESOURCE_SCOPES`). The reference Express app
shipped two modes (REST and MCP) that hit different resources via the
same XAA flow. We chose to focus the Next.js port on REST only — the
MCP path can be added by introducing a second mode parameter to
`/api/call` and a second config block.

## 2. No refresh-token handling

The IdP issues an ID Token; the auth server issues a short-lived access
token. We do not store the access token or use a refresh token — every
`/api/call` re-runs the two-step exchange. This simplifies state and
matches the typical xaa.dev playground configuration (1h ID Token, 1h
access token, no refresh token issued for the resource client).

If xaa.dev issues a refresh token in your registration, this app
ignores it.

## 3. In-memory log buffer

`/api/logs` returns process-local state. In a multi-instance deploy
(multiple Next.js workers / serverless functions) the log a user sees
will be partial. For dev/playground use this is acceptable. Production
would route logs to OpenTelemetry / Datadog / pino → file.

## 4. Iron-session in memory only

iron-session encrypts state into the cookie itself, so there is no
server-side session store to worry about. But the cookie is bounded by
~4KB. We keep the session minimal (ID Token + claims + 8-h expiry) so
this is comfortably under the limit, but nothing prevents a future
contributor from bloating it.

## 5. No CSRF protection on logout

`POST /api/auth/logout` does not currently require a CSRF token. The
session cookie is `SameSite=Lax`, which prevents the most common
cross-site attacks, but a strict CSRF layer (`next-csrf` or a custom
double-submit pattern) would be appropriate before production.

## 6. Tests do not exercise the live IdP

The Vitest suite stubs `globalThis.fetch`. Live tests against the real
xaa.dev IdP would require:

- Registered credentials (we don't ship them).
- A scriptable browser (Playwright) to handle the consent step.
- A periodic CI run, since the IdP's signing keys can rotate.

The five required test scenarios are validated through the mapping
layer (`resource-call.test.ts`) and replicated as documented manual
steps in `test-cases.md` § E1–E5.

## 7. shadcn/ui components are vendored, not CLI-installed

`components/ui/{button,card,badge,alert}.tsx` are checked in directly.
This makes the project hermetic but means future shadcn upgrades are
manual. To re-sync with the canonical shadcn template, run
`npx shadcn@latest add button card badge alert` and reconcile the
output.

## 8. No PKCE secret in the cookie

The PKCE `code_verifier` lives in the iron-session cookie. If a
malicious extension reads the cookie before the callback completes,
it can complete the flow. The 10-minute transaction expiry mitigates
this (the cookie is httpOnly so JS cannot read it directly), but
production deployments that need extra hardening should consider
rotating the cookie name and using a server-side store for the in-
flight transaction.

## 9. Light theme only

`globals.css` defines both light and dark CSS variables, but no theme
toggle is wired in. Add `next-themes` to enable.
