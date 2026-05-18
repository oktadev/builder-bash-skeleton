import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/lib/config';

describe('loadConfig', () => {
  it('returns all required values from env', () => {
    const cfg = loadConfig();
    expect(cfg.idpUrl).toBe('https://idp.test.example');
    expect(cfg.clientId).toBe('test-client');
    expect(cfg.authServerUrl).toBe('https://auth.test.example');
    expect(cfg.resourceUrl).toBe('https://resource.test.example');
    expect(cfg.resourcePath).toBe('/api/todos');
    expect(cfg.resourceScopes).toEqual(['todos.read']);
  });

  it('throws when a required env var is missing', () => {
    const original = process.env.CLIENT_SECRET;
    delete process.env.CLIENT_SECRET;
    expect(() => loadConfig()).toThrow(/CLIENT_SECRET/);
    process.env.CLIENT_SECRET = original;
  });

  it('parses comma-separated scope lists with whitespace tolerance', () => {
    const original = process.env.RESOURCE_SCOPES;
    process.env.RESOURCE_SCOPES = ' files.read , files.write ,, todos.read ';
    const cfg = loadConfig();
    expect(cfg.resourceScopes).toEqual(['files.read', 'files.write', 'todos.read']);
    process.env.RESOURCE_SCOPES = original;
  });
});
