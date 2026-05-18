import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  idpUrl: required('IDP_URL'),
  clientId: required('CLIENT_ID'),
  clientSecret: required('CLIENT_SECRET'),

  authServerUrl: required('AUTH_SERVER_URL'),
  resourceClientId: required('RESOURCE_CLIENT_ID'),
  resourceClientSecret: required('RESOURCE_CLIENT_SECRET'),

  normal: {
    resourceUrl: required('NORMAL_RESOURCE_URL'),
    // REST path to hit with the access token. Defaults to Todo0's `/api/todos`;
    // override for BYOR resources (e.g. `/api/files`).
    resourcePath: process.env.NORMAL_RESOURCE_PATH ?? '/api/todos',
    scopes: (process.env.NORMAL_SCOPES ?? 'todos.read').split(',').map((s) => s.trim()),
  },

  mcp: {
    serverUrl: required('MCP_SERVER_URL'),
    resourceUrl: required('MCP_RESOURCE_URL'),
    scopes: (process.env.MCP_SCOPES ?? 'todos.read,mcp.access').split(',').map((s) => s.trim()),
  },

  port: parseInt(process.env.PORT ?? '3000', 10),
  redirectUri: process.env.REDIRECT_URI ?? 'http://localhost:3000/auth/callback',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-insecure-secret',
};

export type Mode = 'normal' | 'mcp';
