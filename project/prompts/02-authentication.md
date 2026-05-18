# 02 — Authentication (OIDC + PKCE login)

## Prompt

> Implement OIDC Authorization Code + PKCE login against the real xaa.dev
> Identity Provider at `https://idp.xaa.dev`. Use the `openid-client@^6`
> library. Discovery must be cached. The login flow must:
>
> 1. Generate `code_verifier`, S256 `code_challenge`, `state`, `nonce`.
> 2. Build the IdP authorization URL with `scope=openid profile email`.
> 3. Stash PKCE material in an iron-session cookie before redirecting.
> 4. On callback: validate `state` + `nonce`, exchange code for tokens,
>    store `id_token` + `claims` on the session.
> 5. Reject stale callbacks (PKCE transactions older than 10 min).
> 6. Provide `POST /api/auth/logout` (destroy session) and `GET
>    /api/auth/session` (return safe-to-render claims + token state).
>
> The ID Token MUST be stored server-side only (httpOnly iron-session
> cookie). The browser never sees the raw token.

## Objective

Get a real OIDC ID Token from xaa.dev into a server-side session, with
PKCE + state + nonce protections, and expose only redacted state to the
client.

## Output

| File                          | Notes                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| `lib/config.ts`               | `loadConfig()` validates 8 env vars at first call. Throws with the missing var name. |
| `lib/types.ts`                | `SessionData`, `SessionUser`, `PkceTransaction`, `TokenState`. |
| `lib/oidc.ts`                 | `getIdpConfig()` (cached discovery promise, invalidated on failure), `buildLoginUrl()`, `completeLogin()`. |
| `lib/session.ts`              | iron-session config — httpOnly, sameSite=lax, 8h maxAge. Keyed off `SESSION_SECRET`. |
| `app/api/auth/login/route.ts` | Generates PKCE, saves to session, 302 → IdP authorize URL.   |
| `app/api/auth/callback/route.ts` | Verifies PKCE/state/nonce, exchanges code, stores user on session. Maps failures to `?error=` redirects. |
| `app/api/auth/logout/route.ts` | `session.destroy()` for both POST (JSON) and GET (302 → /login). |
| `app/api/auth/session/route.ts` | Returns `{ authenticated, claims, tokenState }`. Never returns the raw token. |

## Issues

None during initial build — the existing `xaa-dev-requesting-app` was a
direct reference for the exact `openid-client` calls and parameters.

## Fixes

n/a

## Verification

```bash
# With .env.local pointing at https://idp.xaa.dev:
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3010/api/auth/login
# → 307 (redirect to https://idp.xaa.dev/oauth2/v1/authorize?...)
curl -sS http://localhost:3010/api/auth/session
# → {"authenticated":false}
```

Plus the unit test in `tests/oidc.test.ts` proves the URL contains
`client_id`, `redirect_uri`, `scope=openid…`, `code_challenge_method=S256`,
`state`, `nonce`, and a valid base64url `code_challenge`.
