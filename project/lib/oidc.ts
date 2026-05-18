/**
 * OIDC discovery + login URL builder + callback completion.
 *
 * Mirrors the spec-compliant pattern from the existing xaa-dev requesting
 * app: lazy discovery (cached promise), Authorization Code + PKCE, S256
 * code challenge, state + nonce.
 */

import * as oidc from 'openid-client';
import { loadConfig } from './config';

let idpConfigPromise: Promise<oidc.Configuration> | null = null;
let resourceAuthConfigPromise: Promise<oidc.Configuration> | null = null;

/**
 * Cached OIDC discovery for the IdP (issues ID Tokens and ID-JAGs).
 *
 * We cache the promise so concurrent requests don't trigger duplicate
 * discovery. If discovery fails the cache is invalidated so the next
 * caller gets a fresh attempt.
 */
export function getIdpConfig(): Promise<oidc.Configuration> {
  if (idpConfigPromise) return idpConfigPromise;
  const config = loadConfig();
  const fresh = oidc.discovery(
    new URL(config.idpUrl),
    config.clientId,
    config.clientSecret,
    oidc.ClientSecretPost(config.clientSecret),
  );
  fresh.catch(() => {
    idpConfigPromise = null;
  });
  idpConfigPromise = fresh;
  return fresh;
}

/**
 * Cached OIDC discovery for the resource authorization server (mints
 * access tokens from ID-JAGs via RFC 7523 jwt-bearer grant).
 */
export function getResourceAuthConfig(): Promise<oidc.Configuration> {
  if (resourceAuthConfigPromise) return resourceAuthConfigPromise;
  const config = loadConfig();
  const fresh = oidc.discovery(
    new URL(config.authServerUrl),
    config.resourceClientId,
    config.resourceClientSecret,
    oidc.ClientSecretPost(config.resourceClientSecret),
  );
  fresh.catch(() => {
    resourceAuthConfigPromise = null;
  });
  resourceAuthConfigPromise = fresh;
  return fresh;
}

export interface LoginUrl {
  authUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}

export async function buildLoginUrl(): Promise<LoginUrl> {
  const config = loadConfig();
  const idp = await getIdpConfig();

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const authUrl = oidc.buildAuthorizationUrl(idp, {
    redirect_uri: config.redirectUri,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return { authUrl: authUrl.href, codeVerifier, state, nonce };
}

export interface LoginResult {
  idToken: string;
  claims: Record<string, unknown>;
}

export async function completeLogin(
  currentUrl: URL,
  codeVerifier: string,
  state: string,
  nonce: string,
): Promise<LoginResult> {
  const idp = await getIdpConfig();

  const tokens = await oidc.authorizationCodeGrant(idp, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
    idTokenExpected: true,
  });

  if (!tokens.id_token) {
    throw new Error('No ID token returned from IdP');
  }

  return {
    idToken: tokens.id_token,
    claims: (tokens.claims() ?? {}) as Record<string, unknown>,
  };
}

/** Reset the cached discovery promises — used by tests. */
export function __resetOidcCache(): void {
  idpConfigPromise = null;
  resourceAuthConfigPromise = null;
}
