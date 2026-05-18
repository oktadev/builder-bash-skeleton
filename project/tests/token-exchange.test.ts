/**
 * Integration test for the two-step XAA token-exchange flow.
 *
 * We mock the OIDC discovery + token endpoints with a fake fetch so the
 * tests run hermetically with no network access. The assertions cover:
 *   - the two POSTs are made in order (token-exchange → jwt-bearer)
 *   - the request bodies use the spec-correct grant types and parameters
 *   - the chained ID-JAG / access_token are returned end-to-end
 *   - upstream OAuth errors are surfaced (and mapped by the call layer)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We import lazily inside the tests so the mocked fetch is in place when
// openid-client runs discovery.
async function importExchange() {
  const mod = await import('@/lib/token-exchange');
  const oidc = await import('@/lib/oidc');
  oidc.__resetOidcCache();
  return mod;
}

const IDP = 'https://idp.test.example';
const AUTH = 'https://auth.test.example';

interface MockResponseDef {
  url: RegExp;
  status?: number;
  body: unknown;
  contentType?: string;
}

function installFetchMock(responses: MockResponseDef[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : (input as Request).url;
      calls.push({ url, init: init ?? undefined });
      const match = responses.find((r) => r.url.test(url));
      if (!match) {
        throw new Error(`No mock for ${url}`);
      }
      return new Response(JSON.stringify(match.body), {
        status: match.status ?? 200,
        headers: { 'content-type': match.contentType ?? 'application/json' },
      });
    });
  return { fetchSpy, calls };
}

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

describe('exchangeForResourceAccessToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs the two-step XAA flow with correct grant types', async () => {
    const { calls } = installFetchMock([
      {
        url: /idp\.test\.example.*\.well-known\/openid-configuration/,
        body: discoveryDoc,
      },
      {
        url: /auth\.test\.example.*\.well-known\/openid-configuration/,
        body: authServerDoc,
      },
      {
        url: /idp\.test\.example.*\/token$/,
        body: {
          access_token: 'fake.idjag.signed',
          token_type: 'N_A',
          issued_token_type: 'urn:ietf:params:oauth:token-type:id-jag',
          expires_in: 300,
        },
      },
      {
        url: /auth\.test\.example.*\/token$/,
        body: {
          access_token: 'fake.access.token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'todos.read',
        },
      },
    ]);

    const { exchangeForResourceAccessToken } = await importExchange();
    const result = await exchangeForResourceAccessToken(
      'fake.id.token',
      'https://resource.test.example',
      ['todos.read'],
    );

    expect(result.idJag).toBe('fake.idjag.signed');
    expect(result.accessToken).toBe('fake.access.token');
    expect(result.scopes).toEqual(['todos.read']);

    // Verify both /token endpoints were hit.
    const tokenCalls = calls.filter((c) => c.url.endsWith('/token'));
    expect(tokenCalls).toHaveLength(2);

    // Step 1 — token exchange to IdP must use the right grant + token types.
    const step1 = tokenCalls[0];
    expect(step1.url).toContain('idp.test.example');
    const body1 = new URLSearchParams(step1.init!.body as string);
    expect(body1.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:token-exchange',
    );
    expect(body1.get('requested_token_type')).toBe(
      'urn:ietf:params:oauth:token-type:id-jag',
    );
    expect(body1.get('subject_token')).toBe('fake.id.token');
    expect(body1.get('subject_token_type')).toBe(
      'urn:ietf:params:oauth:token-type:id_token',
    );
    expect(body1.get('audience')).toBe(AUTH);
    expect(body1.get('resource')).toBe('https://resource.test.example');
    expect(body1.get('scope')).toBe('todos.read');

    // Step 2 — jwt-bearer to auth server.
    const step2 = tokenCalls[1];
    expect(step2.url).toContain('auth.test.example');
    const body2 = new URLSearchParams(step2.init!.body as string);
    expect(body2.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
    expect(body2.get('assertion')).toBe('fake.idjag.signed');
    expect(body2.get('scope')).toBe('todos.read');
  });

  it('surfaces an upstream invalid_grant from the IdP', async () => {
    installFetchMock([
      {
        url: /idp\.test\.example.*\.well-known\/openid-configuration/,
        body: discoveryDoc,
      },
      {
        url: /auth\.test\.example.*\.well-known\/openid-configuration/,
        body: authServerDoc,
      },
      {
        url: /idp\.test\.example.*\/token$/,
        status: 400,
        body: {
          error: 'invalid_grant',
          error_description: 'subject_token expired',
        },
      },
    ]);

    const { exchangeForResourceAccessToken } = await importExchange();
    await expect(
      exchangeForResourceAccessToken(
        'expired.id.token',
        'https://resource.test.example',
        ['todos.read'],
      ),
    ).rejects.toThrow();
  });
});
