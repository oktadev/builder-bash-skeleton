# Environment variables

The kit targets the public **xaa.dev** playground. The host URLs are
fixed; you only set credentials, a session secret, your local callback
URL, and — new in v3 — which protocol path and which application type
you're building.

---

## Fixed (xaa.dev — leave as-is)

These are the *only* values the kit supports. They're listed as env
vars so the code is mockable in tests, but in production / hackathon
use you set them once and never touch them.

| Variable            | Value                              | What it does                                          |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| `IDP_URL`           | `https://idp.xaa.dev`              | Issuer. Drives discovery, login, Steps 0b + 1.        |
| `AUTH_SERVER_URL`   | `https://auth.resource.xaa.dev`    | Resource auth server. Used as `audience` in Step 1.   |
| `RESOURCE_URL`      | `https://api.resource.xaa.dev`     | Default protected resource (Todo0). Used as `resource` in Step 1. |

Plus, **in MCP mode only**, a fourth host — `MCP_SERVER_URL`, default
`https://mcp.xaa.dev/mcp`. See § Resource target.

> Bring-your-own-resource (BYOR) overrides `RESOURCE_URL` /
> `RESOURCE_PATH` / `RESOURCE_SCOPES` (standalone) or `MCP_SERVER_URL`
> (MCP) only. Discovery and login still go through the fixed IdP.

---

## The two axes (new in v3)

Two independent knobs. They touch different parts of the flow, so all
four combinations are the same build with two small swaps.

| Variable        | Values                    | What it changes                                                     |
| --------------- | ------------------------- | ------------------------------------------------------------------- |
| `XAA_PROTOCOL`  | `oidc` \| `saml`          | **How you log in** — Step 0, and whether Step 0b runs. Default `oidc`. |
| `APP_TYPE`      | `standalone` \| `mcp`     | **What you do with the access token** — Step 3 only. Default `standalone`. |

```
                 Step 0 / 0b      Step 1        Step 2      Step 3
  XAA_PROTOCOL   OIDC │ SAML      shared        shared      shared
  APP_TYPE       shared           scopes only   shared      Standalone │ MCP
```

`APP_TYPE` affects Step 1 only through **configuration** — MCP mode needs
`mcp.access` in the scope list — never through logic.

---

## Resource target

Which block applies depends on `APP_TYPE`.

### ▸ `APP_TYPE=standalone`

| Variable          | Default            | What it is                                              |
| ----------------- | ------------------ | ------------------------------------------------------- |
| `RESOURCE_URL`    | `https://api.resource.xaa.dev` | The REST resource. Used as `resource` in Step 1. |
| `RESOURCE_PATH`   | `/api/todos`       | Path to call. Todo0 also exposes `/api/todos/completed`, `/incomplete`, `/stats`, `/:id` — all `GET`, all `todos.read`. |
| `RESOURCE_SCOPES` | `todos.read`       | Space- or comma-separated.                              |

### ▸ `APP_TYPE=mcp`

| Variable               | Default                        | What it is                                                    |
| ---------------------- | ------------------------------ | ------------------------------------------------------------- |
| `MCP_SERVER_URL`       | `https://mcp.xaa.dev/mcp`      | The MCP endpoint. **A fourth host** — see the note below.     |
| `MCP_PROTOCOL_VERSION` | `2025-03-26`                   | What the playground speaks. **Not** `2025-06-18`. Pin it.     |
| `RESOURCE_SCOPES`      | `todos.read mcp.access`        | **Both are required.** `mcp.access` alone is not enough.      |
| `RESOURCE_URL`         | `https://api.resource.xaa.dev` | Still set — it's the Step 1 `resource` value. See `TODO(confirm)` below. |

> **MCP mode introduces a fourth host.** The kit's other three
> (`idp`, `auth.resource`, `api.resource`) are unchanged; `mcp.xaa.dev`
> is additional and only exists on this path. The default MCP resource is
> the playground's built-in **`todo0-mcp`** ("Todo0 MCP Server"), which
> exposes **resources, not tools** — `todo0://todos`,
> `todo0://todos/completed`, `todo0://todos/incomplete`. Override
> `MCP_SERVER_URL` for BYOR-MCP.

> `TODO(confirm)` — **what Step 1's `resource` should be in MCP mode.**
> xaa.dev's docs say *"the MCP URL is not the audience — the resource URL
> is"*, but `todo0-mcp`'s registered `resource_server_url` **is**
> `https://mcp.xaa.dev/mcp`. Getting it wrong produces an `aud` mismatch
> at Step 2 or a rejected token at the MCP server. Try
> `RESOURCE_URL=https://api.resource.xaa.dev` first; if Step 2 succeeds
> but the MCP server 401s with "Invalid or expired access token", try
> `https://mcp.xaa.dev/mcp` and tell us which worked.

> `TODO(confirm)` — the resource URI scheme. xaa.dev's docs say
> `todo0://todos`; the IdP's resource catalog says `todo://todos`. Try
> `todo0://` first.

---

## Per-developer (you set)

These come from your registration at
[xaa.dev/developer/register](https://xaa.dev/developer/register).

### Both paths

| Variable                  | What it is / how to get it                                              |
| ------------------------- | ----------------------------------------------------------------------- |
| `CLIENT_ID`               | OAuth client ID at the IdP. Issued at registration. Used in Steps 0, 0b, 1. |
| `CLIENT_SECRET`           | Confidential secret for `CLIENT_ID`.                                    |
| `RESOURCE_CLIENT_ID`      | OAuth client ID at the resource auth server. Derived as `{CLIENT_ID}-at-{resource_id}`. Used in Step 2. |
| `RESOURCE_CLIENT_SECRET`  | Confidential secret for `RESOURCE_CLIENT_ID`.                           |
| `APP_URL`                 | Public origin of your app. Locally: `http://localhost:3000`.            |
| `SESSION_SECRET`          | ≥32-byte random string. Generate with `openssl rand -base64 32`.        |

Resource-target vars (`RESOURCE_PATH`, `RESOURCE_SCOPES`,
`MCP_SERVER_URL`, …) depend on `APP_TYPE` — see § Resource target above.

### OIDC path only

| Variable       | What it is                                                              |
| -------------- | ----------------------------------------------------------------------- |
| `REDIRECT_URI` | Must equal what you registered. Default: `${APP_URL}/api/auth/callback`. |

### SAML path only

| Variable              | What it is                                                                     |
| --------------------- | ------------------------------------------------------------------------------ |
| `SAML_ACS_URL`        | Your Assertion Consumer Service URL — where the IdP POSTs the `SAMLResponse`. Suggested: `${APP_URL}/api/auth/saml/acs`. Must be byte-exact with what you register. |
| `SAML_NAMEID_FORMAT`  | `emailAddress` (recommended) or `persistent`. **`transient` is unsupported.**   |

> `TODO(confirm)` — the SAML registration form at
> `xaa.dev/developer/register?tab=saml` is behind an email gate, so its
> rendered field list is unverified. Two things you may need and the kit
> cannot yet name:
> - the variable for your **SP entityID** (the form asks for one; the
>   name it hands back is unobserved),
> - whether xaa.dev issues an **SP signing key**. Its IdP metadata sets
>   `WantAuthnRequestsSigned="false"`, so you should not need one to send
>   an `<AuthnRequest>` — but assertion decryption, if enabled, would.
>
> Register first, see what you're given, then add the vars you actually
> received. Don't guess names from this file.

---

## Registration walkthrough

At <https://xaa.dev/developer/register>. **The form has an
`OIDC | SAML` tab toggle** — pick the tab matching your `XAA_PROTOCOL`
before filling anything in.

### ▸ OIDC tab — "Register an OIDC requesting app"

| Field             | What to enter                                                | Why                                          |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Application name  | Anything (e.g. "Hackathon kit – $YOURNAME").                 | Shown to the user on the consent screen.    |
| Redirect URI      | `http://localhost:3000/api/auth/callback` (suggested).       | Must be **byte-exact** with `REDIRECT_URI` in `.env.local` later — scheme, host, port, path. |
| Resource          | `Todo0` (default) or your own BYOR resource.                | Determines `RESOURCE_*` defaults.            |
| Scopes (BYOR)     | Whatever your resource needs (e.g. `todos.read todos.write`).| Must be a subset of what the resource server registered. |

### ▸ SAML tab — "Register a SAML requesting app"

Registers a SAML 2.0 Service Provider so the IdP can issue signed
assertions to it.

| Field             | What to enter                                                | Why                                          |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Application name  | Anything.                                                    | —                                            |
| ACS URL           | `http://localhost:3000/api/auth/saml/acs` (suggested).       | Must be byte-exact with `SAML_ACS_URL`.      |
| NameID format     | **`emailAddress`** (recommended) or `persistent`.            | Your resource server keys users by NameID. **Not `transient`** — a per-session random value creates a new user on every login. |
| Resource          | `Todo0` or your own BYOR resource.                          | Determines `RESOURCE_*` defaults.            |

You will also need the IdP's SAML metadata to validate assertions:

```bash
curl -sS https://idp.xaa.dev/saml/metadata
```

`entityID` is `https://idp.xaa.dev/saml`; the signing certificate's CN is
`IdenX SAML IdP`. SSO endpoint `https://idp.xaa.dev/saml/sso`, SLO
`https://idp.xaa.dev/saml/slo`, both with HTTP-Redirect and HTTP-POST
bindings.

> **The resource auth server must have SAML enabled for your tenant.**
> Each tenant carries a `saml_id_jag` config with an `enabled` flag and
> an allow-list of SAML issuers. If yours is disabled, Step 2 rejects
> your ID-JAG no matter how correct Steps 0–1 were. See
> `06-debugging-playbook.md` § D-16.

### What you get back — both paths

Two distinct OAuth client credential pairs — both required:

| Pair                                                  | Used at                                  | Used for                            |
| ----------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| `CLIENT_ID` / `CLIENT_SECRET`                         | `https://idp.xaa.dev/token`              | Step 0 (login) + Step 0b + Step 1   |
| `RESOURCE_CLIENT_ID` / `RESOURCE_CLIENT_SECRET`       | `https://auth.resource.xaa.dev/token`    | Step 2 (jwt-bearer)                 |

Mixing them up is the most common cause of opaque `invalid_client`
failures. See `06-debugging-playbook.md` § D-2.

### Gotchas

- **Callback URL changes mean re-registration.** If you switch port,
  scheme, or path, the IdP rejects the callback —
  `redirect_uri_mismatch` on the OIDC path, or a silent ACS mismatch on
  the SAML path. Update both sides together.
- **You see two client IDs that look similar.** The resource client ID
  looks like `<CLIENT_ID>-at-<resource>` (e.g. `client_abc-at-todo0`).
  That suffix is meaningful — don't strip it.
- **Secrets are shown once.** Copy them into `.env.local` immediately;
  the dashboard typically won't show them again.
- **`offline_access` is not a registration field** — it's a scope you
  request at Step 0 / Step 0b. See `xaa-spec.md`. Forget it and your
  session dies after ~10 minutes.

---

## Local convention

```
.env.local              # never committed; real credentials
.env.example            # committed; placeholder values + comments
```

Add `.env*` (except `.env.example`) to `.gitignore`. Never commit
`SESSION_SECRET`.

> **The refresh token is a long-lived credential and it lives in your
> session, not in an env var.** Never write it to `.env.local`, a log
> file, or the browser. xaa.dev has **no revocation endpoint**, so a
> leaked refresh token cannot be invalidated from your app — it stays
> usable until it expires. Storage guidance is in
> `01-project-skeleton.md`.

---

## `.env.example` template

Copy this into your repo as `.env.example`. Then `cp .env.example
.env.local` and fill in the per-developer block.

```dotenv
# === Fixed (xaa.dev — leave as-is) ===
IDP_URL=https://idp.xaa.dev
AUTH_SERVER_URL=https://auth.resource.xaa.dev
RESOURCE_URL=https://api.resource.xaa.dev

# === The two axes (new in v3) ===
XAA_PROTOCOL=oidc                 # oidc | saml        — how you log in
APP_TYPE=standalone               # standalone | mcp   — what you do with the token

# === Per-developer (set from xaa.dev/developer/register) ===
# OAuth client at the IdP — login (Step 0), SAML exchange (Step 0b), token-exchange (Step 1)
CLIENT_ID=
CLIENT_SECRET=

# OAuth client at the resource auth server — used for jwt-bearer (Step 2)
RESOURCE_CLIENT_ID=
RESOURCE_CLIENT_SECRET=

# --- APP_TYPE=standalone only ---
RESOURCE_PATH=/api/todos
RESOURCE_SCOPES=todos.read

# --- APP_TYPE=mcp only ---
# Default is the playground's built-in todo0-mcp (resources, no tools).
MCP_SERVER_URL=https://mcp.xaa.dev/mcp
MCP_PROTOCOL_VERSION=2025-03-26
# RESOURCE_SCOPES=todos.read mcp.access   # BOTH required in MCP mode

# Local app
APP_URL=http://localhost:3000

# --- OIDC path only ---
REDIRECT_URI=http://localhost:3000/api/auth/callback

# --- SAML path only (ignore when XAA_PROTOCOL=oidc) ---
SAML_ACS_URL=http://localhost:3000/api/auth/saml/acs
SAML_NAMEID_FORMAT=emailAddress   # or persistent; transient unsupported
# TODO(confirm) SP entityID var name — register at
#   xaa.dev/developer/register?tab=saml to see the rendered field list.
# TODO(confirm) whether an SP signing key is issued.

# Generate with: openssl rand -base64 32   (Windows: see README § Day 0)
SESSION_SECRET=
```
