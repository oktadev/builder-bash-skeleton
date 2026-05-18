import * as oidc from 'openid-client';
import { getIdpConfig, getResourceAuthConfig } from './client.js';
import { config } from '../config.js';

/**
 * Core Cross App Access (XAA / ID-JAG) token-exchange flow.
 *
 * Shared by both the "normal app" mode (downstream REST call) and the
 * "MCP client" mode (downstream MCP call). Only the `resource` parameter
 * and requested scopes differ per mode.
 *
 * Steps:
 *   1. POST to the IdP token endpoint with grant_type=token-exchange,
 *      subject_token=<id_token>, requested_token_type=id-jag.
 *      -> returns an ID-JAG (signed delegation assertion).
 *   2. POST to the resource auth server with grant_type=jwt-bearer,
 *      assertion=<id-jag>.
 *      -> returns a resource-specific access_token.
 */
export async function exchangeForResourceAccessToken(
  idToken: string,
  resourceUrl: string,
  scopes: string[],
): Promise<{ accessToken: string; idJag: string }> {
  const idJag = await exchangeIdTokenForIdJag(idToken, resourceUrl, scopes);
  const accessToken = await exchangeIdJagForAccessToken(idJag, scopes);
  return { accessToken, idJag };
}

async function exchangeIdTokenForIdJag(
  idToken: string,
  resourceUrl: string,
  scopes: string[],
): Promise<string> {
  const idp = await getIdpConfig();

  const params = {
    requested_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
    audience: config.authServerUrl,
    resource: resourceUrl,
    subject_token: idToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    scope: scopes.join(' '),
  };

  const response = await oidc.genericGrantRequest(
    idp,
    'urn:ietf:params:oauth:grant-type:token-exchange',
    params,
  );

  return response.access_token;
}

async function exchangeIdJagForAccessToken(
  idJag: string,
  scopes: string[],
): Promise<string> {
  const authConfig = await getResourceAuthConfig();

  const params = {
    assertion: idJag,
    scope: scopes.join(' '),
  };

  const response = await oidc.genericGrantRequest(
    authConfig,
    'urn:ietf:params:oauth:grant-type:jwt-bearer',
    params,
  );

  return response.access_token;
}
