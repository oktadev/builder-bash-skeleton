# Environment variables

The kit targets the public **xaa.dev** playground. The three host URLs
are fixed; you only set credentials, a session secret, and your local
callback URL.

---

## Fixed (xaa.dev — leave as-is)

These are the *only* values the kit supports. They're listed as env
vars so the code is mockable in tests, but in production / hackathon
use you set them once and never touch them.

| Variable            | Value                              | What it does                                          |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| `IDP_URL`           | `https://idp.xaa.dev`              | OIDC issuer. Drives discovery, login, Step 1.         |
| `AUTH_SERVER_URL`   | `https://auth.resource.xaa.dev`    | Resource auth server. Used as `audience` in Step 1.   |
| `RESOURCE_URL`      | `https://api.resource.xaa.dev`     | Default protected resource (Todo0). Used as `resource` in Step 1. |

> Bring-your-own-resource (BYOR) overrides `RESOURCE_URL` /
> `RESOURCE_PATH` / `RESOURCE_SCOPES` only. Discovery and login still
> go through the fixed IdP.

---

## Per-developer (you set)

These come from your registration at
[xaa.dev/developer/register](https://xaa.dev/developer/register).

| Variable                  | What it is / how to get it                                              |
| ------------------------- | ----------------------------------------------------------------------- |
| `CLIENT_ID`               | OAuth client ID at the IdP. Issued at registration. Used in Step 0 + Step 1. |
| `CLIENT_SECRET`           | Confidential secret for `CLIENT_ID`.                                    |
| `RESOURCE_CLIENT_ID`      | OAuth client ID at the resource auth server. Issued at registration alongside the main pair. Used in Step 2. |
| `RESOURCE_CLIENT_SECRET`  | Confidential secret for `RESOURCE_CLIENT_ID`.                           |
| `RESOURCE_PATH`           | Path on the resource server to call. Default `/api/todos` for Todo0.    |
| `RESOURCE_SCOPES`         | Space- or comma-separated scopes. Default `todos.read` for Todo0.       |
| `APP_URL`                 | Public origin of your app. Locally: `http://localhost:3000`.            |
| `REDIRECT_URI`            | Must equal what you registered. Default: `${APP_URL}/api/auth/callback`. |
| `SESSION_SECRET`          | ≥32-byte random string. Generate with `openssl rand -base64 32`.        |

---

## Registration walkthrough

At <https://xaa.dev/developer/register>:

### What the form asks for

| Field             | What to enter                                                | Why                                          |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Application name  | Anything (e.g. "Hackathon kit – $YOURNAME").                 | Shown to the user on the consent screen.    |
| Redirect URI      | `http://localhost:3000/api/auth/callback` (suggested).       | Must be **byte-exact** with `REDIRECT_URI` in `.env.local` later — scheme, host, port, path. |
| Resource          | `Todo0` (default) or your own BYOR resource.                | Determines `RESOURCE_*` defaults.            |
| Scopes (BYOR)     | Whatever your resource needs (e.g. `todos.read todos.write`).| Must be a subset of what the resource server registered. |

### What you get back

Two distinct OAuth client credential pairs — both required:

| Pair                                                  | Used at                                  | Used for                            |
| ----------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| `CLIENT_ID` / `CLIENT_SECRET`                         | `https://idp.xaa.dev/token`              | Step 0 (auth-code) + Step 1 (token-exchange) |
| `RESOURCE_CLIENT_ID` / `RESOURCE_CLIENT_SECRET`       | `https://auth.resource.xaa.dev/token`    | Step 2 (jwt-bearer)                 |

Mixing them up is the most common cause of opaque `invalid_client`
failures. See `06-debugging-playbook.md` § D-2.

### Gotchas

- **Redirect URI changes mean re-registration.** If you switch port,
  scheme, or path, the IdP will reject the callback with
  `redirect_uri_mismatch`. Update both sides together.
- **You see two client IDs that look similar.** The resource client ID
  often looks like `<CLIENT_ID>-at-<resource>` (e.g.
  `client_abc-at-todo0`). That suffix is meaningful — don't strip it.
- **Secrets are shown once.** Copy them into `.env.local` immediately;
  the dashboard typically won't show them again.

---

## Local convention

```
.env.local              # never committed; real credentials
.env.example            # committed; placeholder values + comments
```

Add `.env*` (except `.env.example`) to `.gitignore`. Never commit
`SESSION_SECRET`.

---

## `.env.example` template

Copy this into your repo as `.env.example`. Then `cp .env.example
.env.local` and fill in the per-developer block.

```dotenv
# === Fixed (xaa.dev — leave as-is) ===
IDP_URL=https://idp.xaa.dev
AUTH_SERVER_URL=https://auth.resource.xaa.dev
RESOURCE_URL=https://api.resource.xaa.dev

# === Per-developer (set from xaa.dev/developer/register) ===
# OAuth client at the IdP — used for login (Step 0) and token-exchange (Step 1)
CLIENT_ID=
CLIENT_SECRET=

# OAuth client at the resource auth server — used for jwt-bearer (Step 2)
RESOURCE_CLIENT_ID=
RESOURCE_CLIENT_SECRET=

# Resource target (defaults below are Todo0; override for BYOR)
RESOURCE_PATH=/api/todos
RESOURCE_SCOPES=todos.read

# Local app
APP_URL=http://localhost:3000
REDIRECT_URI=http://localhost:3000/api/auth/callback

# Generate with: openssl rand -base64 32   (Windows: see README § Day 0)
SESSION_SECRET=
```
