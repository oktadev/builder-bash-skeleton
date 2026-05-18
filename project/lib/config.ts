/**
 * Server-side configuration for the XAA Requesting App.
 *
 * All values are read from environment variables — there are NO hardcoded
 * secrets and NO client-side leakage. Each value is required (or has a
 * documented default). Throws at module load if a required var is missing.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var: ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

/**
 * Build config lazily so that test suites can import this module without
 * blowing up when env vars aren't set. The actual validation happens on
 * the first read by an API route.
 */
export function loadConfig() {
  return {
    idpUrl: required('IDP_URL'),
    clientId: required('CLIENT_ID'),
    clientSecret: required('CLIENT_SECRET'),

    authServerUrl: required('AUTH_SERVER_URL'),
    resourceClientId: required('RESOURCE_CLIENT_ID'),
    resourceClientSecret: required('RESOURCE_CLIENT_SECRET'),

    resourceUrl: required('RESOURCE_URL'),
    resourcePath: optional('RESOURCE_PATH', '/api/todos'),
    resourceScopes: optional('RESOURCE_SCOPES', 'todos.read')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    appUrl: optional('APP_URL', 'http://localhost:3000'),
    redirectUri: optional(
      'REDIRECT_URI',
      'http://localhost:3000/api/auth/callback',
    ),
    sessionSecret: required('SESSION_SECRET'),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
