import { Router } from 'express';
import { config } from '../config.js';
import { getSigningMaterial } from './keys.js';

export const metadataRouter = Router();

/**
 * RFC 8414 authorization server metadata. The playground's 5-step wizard
 * auto-discovers token_endpoint via this document (with fallback to
 * /.well-known/openid-configuration).
 */
metadataRouter.get('/.well-known/oauth-authorization-server', (_req, res) => {
  const base = config.own.authServerUrl.replace(/\/$/, '');
  res.json({
    issuer: config.own.authServerUrl,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:jwt-bearer'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    scopes_supported: config.supportedScopes,
    response_types_supported: [],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  });
});

// Same doc aliased at the OIDC discovery path, since the wizard falls back to it.
metadataRouter.get('/.well-known/openid-configuration', (_req, res) => {
  const base = config.own.authServerUrl.replace(/\/$/, '');
  res.json({
    issuer: config.own.authServerUrl,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:jwt-bearer'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    scopes_supported: config.supportedScopes,
    response_types_supported: [],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  });
});

metadataRouter.get('/jwks', async (_req, res) => {
  const { publicJwk } = await getSigningMaterial();
  res.json({ keys: [publicJwk] });
});
