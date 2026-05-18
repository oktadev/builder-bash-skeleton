import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export type AuthMode = 'playground' | 'own';

const authMode = optional('AUTH_MODE', 'playground') as AuthMode;
if (authMode !== 'playground' && authMode !== 'own') {
  throw new Error(`AUTH_MODE must be "playground" or "own", got "${authMode}"`);
}

// The Auth Server does not normalize URLs — whatever you entered in Wizard
// Step 1 is what lands in the `aud` claim. RESOURCE_URL here must match that
// registration exactly (trailing slash and all).
const resourceUrl = optional('RESOURCE_URL', 'http://localhost:4000');

export const config = {
  port: parseInt(optional('PORT', '4000'), 10),
  authPort: parseInt(optional('AUTH_PORT', '4001'), 10),
  resourceUrl,
  authMode,

  playground: {
    issuer: optional('PLAYGROUND_ISSUER', 'https://auth.resource.xaa.dev'),
    jwksUrl: optional('PLAYGROUND_JWKS_URL', 'https://auth.resource.xaa.dev/jwks'),
  },

  own: {
    idpIssuer: optional('OWN_IDP_ISSUER', 'https://idp.xaa.dev'),
    idpJwksUrl: optional('OWN_IDP_JWKS_URL', 'https://idp.xaa.dev/oauth2/v1/keys'),
    authServerUrl: optional('OWN_AUTH_SERVER_URL', 'http://localhost:4001'),
    accessTokenTtl: parseInt(optional('OWN_ACCESS_TOKEN_TTL', '7200'), 10),
    privateKeyPath: optional('OWN_PRIVATE_KEY_PATH', './keys/private.pem'),
    publicKeyPath: optional('OWN_PUBLIC_KEY_PATH', './keys/public.pem'),
    keyId: optional('OWN_KEY_ID', 'xaa-resource-1'),
  },

  supportedScopes: optional('SUPPORTED_SCOPES', 'files.read,files.write,folders.read,folders.write')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

/**
 * Issuer + JWKS that the REST/MCP layer validates incoming access tokens
 * against. Switches based on AUTH_MODE.
 */
export function tokenIssuer(): { issuer: string; jwksUrl: string } {
  if (config.authMode === 'playground') {
    return { issuer: config.playground.issuer, jwksUrl: config.playground.jwksUrl };
  }
  return {
    issuer: config.own.authServerUrl,
    jwksUrl: `${config.own.authServerUrl.replace(/\/$/, '')}/jwks`,
  };
}
