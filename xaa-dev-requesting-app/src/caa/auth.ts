import * as oidc from 'openid-client';
import { getIdpConfig } from './client.js';
import { config } from '../config.js';

export interface LoginUrl {
  authUrl: string;
  codeVerifier: string;
  state: string;
  nonce: string;
}

/**
 * Build an OIDC Authorization Code + PKCE URL for the xaa.dev IdP.
 */
export async function buildLoginUrl(): Promise<LoginUrl> {
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
  accessToken?: string;
  claims: Record<string, unknown>;
}

/**
 * Complete the Authorization Code + PKCE exchange and return the ID Token
 * that the CAA flow will then exchange for downstream access tokens.
 */
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
    accessToken: tokens.access_token,
    claims: (tokens.claims() ?? {}) as Record<string, unknown>,
  };
}
