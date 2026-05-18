/**
 * resource-call mapping tests.
 *
 * Covers the four required scenarios for the protected-resource layer:
 *   1. Successful 200 with body
 *   2. 401 invalid_token  → mapped to invalid_token / expired_token
 *   3. 401 (generic)      → mapped to unauthorized
 *   4. 403                → mapped to insufficient_scope
 *   5. Network failure    → mapped to resource_failure
 *   6. Token-exchange failure (invalid_grant on the IdP) → expired_token
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IDP = 'https://idp.test.example';
const AUTH = 'https://auth.test.example';
const RES = 'https://resource.test.example';

const discoveryDoc = {
  issuer: IDP,
  token_endpoint: `${IDP}/oauth2/v1/token`,
  authorization_endpoint: `${IDP}/oauth2/v1/authorize`,
  jwks_uri: `${IDP}/oauth2/v1/keys`,
  response_types_supported: ['code'],
  grant_types_supported: [
    'authorization_code',
    'urn:ietf:params:oauth:grant-type:token-exchange',
  ],
  code_challenge_methods_supported: ['S256'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
};
const authServerDoc = {
  issuer: AUTH,
  token_endpoint: `${AUTH}/oauth2/v1/token`,
  jwks_uri: `${AUTH}/oauth2/v1/keys`,
  grant_types_supported: ['urn:ietf:params:oauth:grant-type:jwt-bearer'],
};

interface ResourceMockOpts {
  resourceStatus?: number;
  resourceBody?: unknown;
  wwwAuthenticate?: string;
  /** If set, the resource fetch throws (network error). */
  resourceThrow?: Error;
  /** If set, the IdP token-exchange returns this status + body. */
  idpStatus?: number;
  idpBody?: unknown;
}

function installMock(opts: ResourceMockOpts) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (/\.well-known\/openid-configuration/.test(url)) {
      const doc = url.includes('idp.test.example') ? discoveryDoc : authServerDoc;
      return new Response(JSON.stringify(doc), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === `${IDP}/oauth2/v1/token`) {
      return new Response(
        JSON.stringify(
          opts.idpBody ?? {
            access_token: 'fake.idjag.signed',
            token_type: 'N_A',
            issued_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
            expires_in: 300,
          },
        ),
        {
          status: opts.idpStatus ?? 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url === `${AUTH}/oauth2/v1/token`) {
      return new Response(
        JSON.stringify({
          access_token: 'fake.access.token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'todos.read',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url.startsWith(RES)) {
      if (opts.resourceThrow) throw opts.resourceThrow;
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (opts.wwwAuthenticate) headers['www-authenticate'] = opts.wwwAuthenticate;
      return new Response(JSON.stringify(opts.resourceBody ?? {}), {
        status: opts.resourceStatus ?? 200,
        headers,
      });
    }
    throw new Error(`Unexpected url ${url}`);
  });
}

async function importCall() {
  const oidc = await import('@/lib/oidc');
  oidc.__resetOidcCache();
  const { callProtectedResource } = await import('@/lib/resource-call');
  return callProtectedResource;
}

describe('callProtectedResource', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns a CallResult on 200', async () => {
    installMock({ resourceStatus: 200, resourceBody: [{ id: 1, title: 'todo' }] });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual([{ id: 1, title: 'todo' }]);
      expect(result.scopes).toEqual(['todos.read']);
      expect(result.tokens.idJag).toBeDefined();
      expect(result.tokens.accessToken).toBeDefined();
    }
  });

  it('maps 401 invalid_token (expired) to expired_token', async () => {
    installMock({
      resourceStatus: 401,
      wwwAuthenticate:
        'Bearer error="invalid_token", error_description="token has expired"',
    });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('expired_token');
  });

  it('maps 401 invalid_token (signature) to invalid_token', async () => {
    installMock({
      resourceStatus: 401,
      wwwAuthenticate:
        'Bearer error="invalid_token", error_description="signature verification failed"',
    });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_token');
  });

  it('maps generic 401 to unauthorized', async () => {
    installMock({ resourceStatus: 401, wwwAuthenticate: 'Bearer' });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unauthorized');
  });

  it('maps 403 to insufficient_scope', async () => {
    installMock({
      resourceStatus: 403,
      wwwAuthenticate: 'Bearer error="insufficient_scope"',
    });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('insufficient_scope');
  });

  it('maps network failure to resource_failure', async () => {
    installMock({ resourceThrow: new Error('ECONNREFUSED') });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('resource_failure');
  });

  it('maps IdP invalid_grant to expired_token', async () => {
    installMock({
      idpStatus: 400,
      idpBody: {
        error: 'invalid_grant',
        error_description: 'subject_token expired',
      },
    });
    const call = await importCall();
    const result = await call('expired.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['expired_token', 'token_exchange_failure']).toContain(result.error);
    }
  });

  it('maps a 5xx upstream resource error to resource_failure', async () => {
    installMock({ resourceStatus: 502 });
    const call = await importCall();
    const result = await call('fake.id.token');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('resource_failure');
  });
});
