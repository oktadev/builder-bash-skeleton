/**
 * Cross-App Access (XAA / ID-JAG) token-exchange flow.
 *
 * Two-step exchange:
 *
 *   Step 1 — RFC 8693 Token Exchange at the IdP
 *     POST {idp}/token
 *       grant_type=urn:ietf:params:oauth:grant-type:token-exchange
 *       subject_token=<ID Token>
 *       subject_token_type=urn:ietf:params:oauth:token-type:id_token
 *       requested_token_type=urn:ietf:params:oauth:token-type:id-jag
 *       audience=<resource auth server URL>
 *       resource=<resource URL>
 *       scope=<requested scopes>
 *     ← returns the ID-JAG (signed delegation assertion).
 *
 *   Step 2 — RFC 7523 JWT-Bearer Grant at the resource auth server
 *     POST {auth_server}/token
 *       grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
 *       assertion=<ID-JAG>
 *       scope=<requested scopes>
 *     ← returns the resource access_token.
 *
 * Both steps are authenticated with the corresponding client credentials
 * (handled by openid-client via the cached configs).
 */

import * as oidc from 'openid-client';
import { getIdpConfig, getResourceAuthConfig } from './oidc';
import { loadConfig } from './config';
import { log, redactToken } from './logger';

export interface ExchangeResult {
  accessToken: string;
  idJag: string;
  scopes: string[];
}

export async function exchangeForResourceAccessToken(
  idToken: string,
  resourceUrl: string,
  scopes: string[],
): Promise<ExchangeResult> {
  const idJag = await exchangeIdTokenForIdJag(idToken, resourceUrl, scopes);
  const accessToken = await exchangeIdJagForAccessToken(idJag, scopes);
  return { accessToken, idJag, scopes };
}

async function exchangeIdTokenForIdJag(
  idToken: string,
  resourceUrl: string,
  scopes: string[],
): Promise<string> {
  const config = loadConfig();
  const idp = await getIdpConfig();

  log('info', 'token-exchange', 'POST IdP /token (RFC 8693 token-exchange → id-jag)', {
    audience: config.authServerUrl,
    resource: resourceUrl,
    scope: scopes.join(' '),
    subject_token: redactToken(idToken),
  });

  try {
    const response = await oidc.genericGrantRequest(
      idp,
      'urn:ietf:params:oauth:grant-type:token-exchange',
      {
        requested_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
        audience: config.authServerUrl,
        resource: resourceUrl,
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        scope: scopes.join(' '),
      },
    );
    log('info', 'token-exchange', 'Received ID-JAG from IdP', {
      idJag: redactToken(response.access_token),
      token_type: response.token_type,
      expires_in: response.expires_in,
    });
    return response.access_token;
  } catch (err) {
    log('error', 'token-exchange', 'IdP token-exchange failed', {
      error: (err as Error).message,
    });
    throw err;
  }
}

async function exchangeIdJagForAccessToken(
  idJag: string,
  scopes: string[],
): Promise<string> {
  const authConfig = await getResourceAuthConfig();

  log('info', 'jwt-bearer', 'POST AuthServer /token (RFC 7523 jwt-bearer → access_token)', {
    assertion: redactToken(idJag),
    scope: scopes.join(' '),
  });

  try {
    const response = await oidc.genericGrantRequest(
      authConfig,
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      {
        assertion: idJag,
        scope: scopes.join(' '),
      },
    );
    log('info', 'jwt-bearer', 'Received resource access_token', {
      accessToken: redactToken(response.access_token),
      token_type: response.token_type,
      expires_in: response.expires_in,
      scope: response.scope,
    });
    return response.access_token;
  } catch (err) {
    log('error', 'jwt-bearer', 'jwt-bearer grant failed', {
      error: (err as Error).message,
    });
    throw err;
  }
}
