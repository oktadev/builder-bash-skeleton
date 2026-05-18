/**
 * Lightweight in-memory ring buffer for the observability panel.
 *
 * The XAA flow has many discrete steps (login redirect, callback, token
 * exchange, jwt-bearer, resource call) and showing the full lifecycle is
 * one of the explicit deliverables. This logger is process-local and is
 * intentionally NOT persisted — the goal is to reflect the live request
 * lifecycle, not build a long-term audit trail.
 *
 * Token values are redacted before storage (first/last 6 chars only).
 */

import type { LogEntry } from './types';

const BUFFER_SIZE = 200;
const buffer: LogEntry[] = [];

function makeId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Redact a token to "head…tail" form so logs are useful for debugging
 * (you can see WHICH token is in play) without leaking the credential.
 */
export function redactToken(token: string | undefined): string | undefined {
  if (!token) return undefined;
  if (token.length <= 16) return '***';
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}

export function redactData(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const redacted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && /token|secret|assertion|jag|jwt/i.test(k)) {
      redacted[k] = redactToken(v);
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

export function log(
  level: LogEntry['level'],
  category: LogEntry['category'],
  message: string,
  data?: Record<string, unknown>,
): LogEntry {
  const entry: LogEntry = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data: redactData(data),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  // Mirror to stdout for `next dev` console visibility.
  // eslint-disable-next-line no-console
  console.log(`[${entry.timestamp}] [${level}] [${category}] ${message}`);
  return entry;
}

export function getLogs(): LogEntry[] {
  return [...buffer];
}

export function clearLogs(): void {
  buffer.length = 0;
}
