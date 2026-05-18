import { describe, expect, it } from 'vitest';
import { jwtExpiry, cn } from '@/lib/utils';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('jwtExpiry', () => {
  it('returns the iso expiry for a valid JWT', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = makeJwt({ sub: 'u', exp });
    const iso = jwtExpiry(token);
    expect(iso).toBeTruthy();
    expect(new Date(iso!).getTime()).toBe(exp * 1000);
  });

  it('returns undefined for an undefined token', () => {
    expect(jwtExpiry(undefined)).toBeUndefined();
  });

  it('returns undefined for a non-JWT string', () => {
    expect(jwtExpiry('not-a-jwt')).toBeUndefined();
  });

  it('returns undefined when exp claim is missing', () => {
    const token = makeJwt({ sub: 'u' });
    expect(jwtExpiry(token)).toBeUndefined();
  });
});

describe('cn', () => {
  it('merges tailwind classes deduplicating conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-sm', false && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});
