import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clearLogs, getLogs, log, redactToken, redactData } from '@/lib/logger';

describe('logger', () => {
  beforeEach(() => {
    clearLogs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('redacts long tokens to head…tail', () => {
    expect(redactToken('eyJabc.def.ghi.JKLmnopqrstuvw')).toMatch(/^eyJabc.+uvw$/);
  });

  it('redacts short tokens to ***', () => {
    expect(redactToken('short')).toBe('***');
  });

  it('returns undefined for missing token', () => {
    expect(redactToken(undefined)).toBeUndefined();
  });

  it('redacts fields whose key matches token/secret/assertion/jag/jwt', () => {
    const out = redactData({
      idJag: 'aaaaaabbbbbbccccccddddddeeeeee',
      access_token: 'aaaaaabbbbbbccccccddddddeeeeee',
      assertion: 'aaaaaabbbbbbccccccddddddeeeeee',
      audience: 'https://auth.example',
    });
    expect(out!.idJag).not.toContain('cccccc');
    expect(out!.access_token).not.toContain('cccccc');
    expect(out!.assertion).not.toContain('cccccc');
    expect(out!.audience).toBe('https://auth.example');
  });

  it('appends entries to the buffer with metadata', () => {
    log('info', 'auth', 'hello', { foo: 'bar' });
    const logs = getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('hello');
    expect(logs[0].category).toBe('auth');
    expect(logs[0].level).toBe('info');
    expect(logs[0].data).toEqual({ foo: 'bar' });
    expect(logs[0].id).toMatch(/^log_/);
    expect(logs[0].timestamp).toMatch(/T.+Z$/);
  });

  it('caps the buffer at 200 entries (FIFO)', () => {
    for (let i = 0; i < 250; i++) {
      log('info', 'auth', `m${i}`);
    }
    const logs = getLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('m50');
    expect(logs[logs.length - 1].message).toBe('m249');
  });
});
