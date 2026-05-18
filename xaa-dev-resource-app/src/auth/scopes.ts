import type { NextFunction, Request, Response } from 'express';
import { sendForbidden } from './errors.js';

/**
 * Gate a route on one required scope. Must run after requireAccessToken().
 */
export function requireScope(scope: string, opts: { mcp?: boolean } = {}) {
  return function scopeMiddleware(req: Request, res: Response, next: NextFunction): void {
    const scopes = req.scopes ?? [];
    if (!scopes.includes(scope)) {
      sendForbidden(res, `Token is missing required scope "${scope}"`, scope, { mcp: opts.mcp });
      return;
    }
    next();
  };
}
