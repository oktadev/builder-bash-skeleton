import { readFileSync } from 'node:fs';
import { importPKCS8, importSPKI, exportJWK, type KeyLike, type JWK } from 'jose';
import { config } from '../config.js';

interface SigningMaterial {
  privateKey: KeyLike;
  publicJwk: JWK;
  kid: string;
  alg: 'RS256';
}

let cached: SigningMaterial | null = null;

/**
 * Lazy-load the own auth server's signing material. Called only when
 * AUTH_MODE=own.
 */
export async function getSigningMaterial(): Promise<SigningMaterial> {
  if (cached) return cached;

  const { privateKeyPath, publicKeyPath, keyId } = config.own;

  const privatePem = readFileSync(privateKeyPath, 'utf8');
  const publicPem = readFileSync(publicKeyPath, 'utf8');

  const privateKey = await importPKCS8(privatePem, 'RS256');
  const publicKey = await importSPKI(publicPem, 'RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = keyId;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  cached = { privateKey, publicJwk, kid: keyId, alg: 'RS256' };
  return cached;
}
