/**
 * One-shot RS256 keypair generator. Run via `npm run keygen`.
 *
 * Writes PKCS#8 private + SPKI public PEMs to the paths in .env. Skipped if
 * both files already exist.
 */
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { config } from '../config.js';

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function main(): void {
  const { privateKeyPath, publicKeyPath } = config.own;

  if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
    console.log(`Keys already exist at ${privateKeyPath} / ${publicKeyPath}. Skipping.`);
    return;
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  ensureDir(privateKeyPath);
  ensureDir(publicKeyPath);
  writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  writeFileSync(publicKeyPath, publicKey);

  console.log(`Wrote RS256 keypair:\n  private: ${privateKeyPath}\n  public:  ${publicKeyPath}`);
}

main();
