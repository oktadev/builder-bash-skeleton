/**
 * Call the protected resource server with a freshly-minted access token.
 *
 * Translates upstream OAuth errors into a stable `ApiError` shape so the
 * UI can render distinct states for unauthorized / expired / insufficient
 * scope / resource failure scenarios.
 */

import { exchangeForResourceAccessToken } from './token-exchange';
import { loadConfig } from './config';
import { log, redactToken } from './logger';
import type { ApiError, CallResult, ErrorCode } from './types';

export async function callProtectedResource(
  idToken: string,
): Promise<CallResult | ApiError> {
  const config = loadConfig();
  const startedAt = Date.now();

  let accessToken: string;
  let idJag: string;
  try {
    const ex = await exchangeForResourceAccessToken(
      idToken,
      config.resourceUrl,
      config.resourceScopes,
    );
    accessToken = ex.accessToken;
    idJag = ex.idJag;
  } catch (err) {
    return mapExchangeError(err);
  }

  const path = config.resourcePath.startsWith('/')
    ? config.resourcePath
    : `/${config.resourcePath}`;
  const url = `${config.resourceUrl.replace(/\/$/, '')}${path}`;

  log('info', 'resource-call', `GET ${url}`, {
    accessToken: redactToken(accessToken),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    log('error', 'resource-call', 'Network error calling resource', {
      error: (err as Error).message,
    });
    return {
      ok: false,
      error: 'resource_failure',
      message: `Network error: ${(err as Error).message}`,
    };
  }

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON body — keep as text
  }

  log(
    res.ok ? 'info' : 'error',
    'resource-call',
    `Resource responded ${res.status}`,
    { status: res.status, contentType: res.headers.get('content-type') },
  );

  if (!res.ok) {
    return mapResourceError(res.status, body, res.headers.get('www-authenticate'));
  }

  return {
    ok: true,
    request: { url, method: 'GET' },
    status: res.status,
    body,
    tokens: {
      idJag: redactToken(idJag),
      accessToken: redactToken(accessToken),
    },
    scopes: config.resourceScopes,
    durationMs: Date.now() - startedAt,
  };
}

function mapExchangeError(err: unknown): ApiError {
  const message = (err as Error).message ?? 'unknown error';
  // openid-client throws ResponseBodyError with `error` codes from the spec.
  const errCode = (err as { error?: string }).error;
  let code: ErrorCode = 'token_exchange_failure';
  if (errCode === 'invalid_grant' || /expired|invalid_token/i.test(message)) {
    code = 'expired_token';
  } else if (errCode === 'invalid_request' || /invalid/i.test(message)) {
    code = 'invalid_token';
  }
  return {
    ok: false,
    error: code,
    message: `Token exchange failed: ${message}`,
    details: { upstream: errCode },
  };
}

function mapResourceError(
  status: number,
  body: unknown,
  wwwAuth: string | null,
): ApiError {
  if (status === 401) {
    if (wwwAuth && /error="invalid_token"/.test(wwwAuth)) {
      // Could be malformed signature, expired, or wrong audience.
      const expired = /expired|exp/i.test(wwwAuth);
      return {
        ok: false,
        error: expired ? 'expired_token' : 'invalid_token',
        message: expired
          ? 'Resource rejected the access token as expired.'
          : 'Resource rejected the access token as invalid.',
        details: { wwwAuthenticate: wwwAuth, body },
      };
    }
    return {
      ok: false,
      error: 'unauthorized',
      message: 'Resource returned 401 unauthorized.',
      details: { wwwAuthenticate: wwwAuth, body },
    };
  }
  if (status === 403) {
    return {
      ok: false,
      error: 'insufficient_scope',
      message: 'Resource returned 403 insufficient_scope.',
      details: { wwwAuthenticate: wwwAuth, body },
    };
  }
  return {
    ok: false,
    error: 'resource_failure',
    message: `Resource returned HTTP ${status}.`,
    details: { status, body },
  };
}
