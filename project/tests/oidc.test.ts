/**
 * OIDC login URL builder — checks PKCE + state + nonce + correct params.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IDP = 'https://idp.test.example';

const discoveryDoc = {
  issuer: IDP,
  token_endpoint: `${IDP}/oauth2/v1/token`,
  authorization_endpoint: `${IDP}/oauth2/v1/authorize`,
  jwks_uri: `${IDP}/oauth2/v1/keys`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code'],
  code_challenge_methods_supported: ['S256'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
};

describe('buildLoginUrl', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(discoveryDoc), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('produces a PKCE login URL with state, nonce, and S256 challenge', async () => {
    const oidc = await import('@/lib/oidc');
    oidc.__resetOidcCache();
    const { authUrl, codeVerifier, state, nonce } = await oidc.buildLoginUrl();

    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);

    const u = new URL(authUrl);
    expect(u.origin).toBe(IDP);
    expect(u.pathname).toBe('/oauth2/v1/authorize');
    expect(u.searchParams.get('client_id')).toBe('test-client');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback',
    );
    expect(u.searchParams.get('scope')).toContain('openid');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('state')).toBe(state);
    expect(u.searchParams.get('nonce')).toBe(nonce);
    expect(u.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
