import { createRemoteJWKSet } from 'jose';

const cache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Return a cached jose RemoteJWKSet for a given URL. jose handles key caching,
 * background refresh, and cooldown on misses.
 */
export function remoteJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = cache.get(jwksUrl);
  if (existing) return existing;
  const set = createRemoteJWKSet(new URL(jwksUrl));
  cache.set(jwksUrl, set);
  return set;
}
