import { config } from '../config.js';
import { exchangeForResourceAccessToken } from '../caa/tokenExchange.js';

/**
 * Normal-app mode: use the CAA-obtained access token to call the xaa.dev
 * resource app (Todo0) REST API as an ordinary bearer-token request.
 */
export async function callNormalApp(idToken: string): Promise<{
  accessToken: string;
  idJag: string;
  request: { url: string; method: string };
  status: number;
  body: unknown;
}> {
  const { accessToken, idJag } = await exchangeForResourceAccessToken(
    idToken,
    config.normal.resourceUrl,
    config.normal.scopes,
  );

  // Target REST path — configurable via NORMAL_RESOURCE_PATH for BYOR resources.
  const path = config.normal.resourcePath.startsWith('/')
    ? config.normal.resourcePath
    : `/${config.normal.resourcePath}`;
  const url = `${config.normal.resourceUrl.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON response — leave as text
  }

  return {
    accessToken,
    idJag,
    request: { url, method: 'GET' },
    status: res.status,
    body,
  };
}
