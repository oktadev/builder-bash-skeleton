import * as oidc from 'openid-client';
import { config } from '../config.js';

let idpConfigPromise: Promise<oidc.Configuration> | null = null;
let resourceConfigPromise: Promise<oidc.Configuration> | null = null;

/**
 * Discover the xaa.dev IdP (OIDC) configuration. Used for the initial login
 * and for the token-exchange call (ID Token -> ID-JAG).
 */
export function getIdpConfig(): Promise<oidc.Configuration> {
  const cached = idpConfigPromise;
  if (cached) return cached;
  const fresh = oidc.discovery(
    new URL(config.idpUrl),
    config.clientId,
    config.clientSecret,
    oidc.ClientSecretPost(config.clientSecret),
  );
  idpConfigPromise = fresh;
  return fresh;
}

/**
 * Discover the resource-app authorization server. Used for the JWT-bearer
 * exchange (ID-JAG -> access token). xaa.dev issues a separate resource
 * client (client_id is "{client_id}-at-{resource_id}" in the ID-JAG), so
 * this uses RESOURCE_CLIENT_ID/SECRET, not the IdP client credentials.
 */
export function getResourceAuthConfig(): Promise<oidc.Configuration> {
  const cached = resourceConfigPromise;
  if (cached) return cached;
  const fresh = oidc.discovery(
    new URL(config.authServerUrl),
    config.resourceClientId,
    config.resourceClientSecret,
    oidc.ClientSecretPost(config.resourceClientSecret),
  );
  resourceConfigPromise = fresh;
  return fresh;
}
