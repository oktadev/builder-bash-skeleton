# xaa-dev-requesting-app

A **Cross App Access (XAA / ID-JAG)** requesting app that can run in two modes
behind a single UI toggle:

- **Normal app** &mdash; REST call to the xaa.dev resource app (`api.resource.xaa.dev`).
- **MCP client** &mdash; MCP call to the xaa.dev Todo0 MCP server (`mcp.xaa.dev/mcp`).

Both modes share the same CAA core:

1. OIDC login (Authorization Code + PKCE) against the xaa.dev IdP &rarr; **ID Token**
2. RFC 8693 token exchange at the IdP with `requested_token_type=id-jag` &rarr; **ID-JAG**
3. RFC 7523 `jwt-bearer` grant at the resource auth server &rarr; **access token**
4. Downstream call (REST or MCP) using the access token

## Setup

1. Register a client at <https://xaa.dev/developer/register>. Use
   `http://localhost:3000/auth/callback` as the redirect URI. Registration
   issues **two** credential pairs: an IdP pair (`CLIENT_ID` /
   `CLIENT_SECRET`) and a resource-app pair (`RESOURCE_CLIENT_ID` /
   `RESOURCE_CLIENT_SECRET`) &mdash; the ID-JAG `client_id` is
   `{client_id}-at-{resource_id}`, so the JWT-bearer call uses the second
   pair.
2. `cp .env.example .env` and fill in all four credentials.
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open <http://localhost:3000>, click **Log in with xaa.dev IdP**, then
   flip the mode switch and hit **Run flow**.

## Layout

```
src/
  server.ts              Express entrypoint, sessions, wiring
  config.ts              Env loader
  session.ts             express-session type augmentation
  caa/
    client.ts            openid-client discovery (IdP + resource AS)
    auth.ts              PKCE login + callback handling
    tokenExchange.ts     Shared CAA core: ID Token -> ID-JAG -> access token
  modes/
    normalApp.ts         REST call to api.resource.xaa.dev
    mcpClient.ts         MCP client using @modelcontextprotocol/sdk
  routes/
    index.ts             Home page + mode toggle
    auth.ts              /auth/login, /auth/callback, /auth/logout
    call.ts              POST /call -> dispatches to the selected mode
views/index.ejs          Single-page UI with the mode switch
public/                  styles.css, app.js
```

## References

- xaa.dev playground: <https://xaa.dev>
- OAuth ID-JAG draft: <https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/>
- Okta NestJS sample: <https://github.com/oktadev/okta-js-xaa-requestor-example>
- Okta MCP+XAA sample: <https://github.com/okta-samples/okta-xaa-dev-mcp-client-example>
