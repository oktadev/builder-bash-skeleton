import type { Response } from 'express';
import { config } from '../config.js';

/**
 * Build a RFC 6750 WWW-Authenticate Bearer challenge header value.
 * MCP requests also get a resource_metadata hint per RFC 9728.
 */
function bearerChallenge(params: Record<string, string>, includeMcpHint: boolean): string {
  const parts: string[] = ['Bearer'];
  const all: Record<string, string> = { ...params };
  if (includeMcpHint) {
    // Absolute URL to the RFC 9728 protected-resource metadata document.
    all['resource_metadata'] = new URL(
      '/.well-known/oauth-protected-resource',
      config.resourceUrl,
    ).toString();
  }
  const kv = Object.entries(all).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`);
  if (kv.length) parts.push(kv.join(', '));
  return parts.join(' ');
}

export function sendUnauthorized(
  res: Response,
  description: string,
  opts: { error?: 'unauthorized' | 'invalid_token'; mcp?: boolean } = {},
): void {
  const error = opts.error ?? 'invalid_token';
  res
    .status(401)
    .set(
      'WWW-Authenticate',
      bearerChallenge({ error, error_description: description }, Boolean(opts.mcp)),
    )
    .json({ error, error_description: description });
}

export function sendForbidden(
  res: Response,
  description: string,
  requiredScope: string,
  opts: { mcp?: boolean } = {},
): void {
  res
    .status(403)
    .set(
      'WWW-Authenticate',
      bearerChallenge(
        {
          error: 'insufficient_scope',
          error_description: description,
          scope: requiredScope,
        },
        Boolean(opts.mcp),
      ),
    )
    .json({ error: 'insufficient_scope', error_description: description, scope: requiredScope });
}
