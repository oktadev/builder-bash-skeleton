import type { NextFunction, Request, Response } from 'express';
import { jwtVerify, type JWTPayload } from 'jose';
import { config, tokenIssuer } from '../config.js';
import { remoteJwks } from './jwks.js';
import { sendUnauthorized } from './errors.js';

export interface TokenClaims extends JWTPayload {
  scope?: string;
  client_id?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    token?: TokenClaims;
    scopes?: string[];
  }
}

/**
 * Bearer-token validation middleware. Applies to both REST and MCP routes.
 *
 * Rules (per https://xaa.dev/docs/token-structure and error-codes):
 *   - RS256 signature via the issuer's JWKS.
 *   - iss matches exactly.
 *   - aud matches config.resourceUrl exactly (the Auth Server does not
 *     normalize URLs — must equal the URL registered in Wizard Step 1).
 *   - exp in the future (30s clock tolerance).
 */
export function requireAccessToken(opts: { mcp?: boolean } = {}) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header) {
      sendUnauthorized(res, 'Missing Authorization header', {
        error: 'unauthorized',
        mcp: opts.mcp,
      });
      return;
    }

    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      sendUnauthorized(res, 'Authorization header must use the Bearer scheme', {
        mcp: opts.mcp,
      });
      return;
    }
    const token = match[1].trim();

    const { issuer, jwksUrl } = tokenIssuer();

    try {
      const { payload } = await jwtVerify(token, remoteJwks(jwksUrl), {
        issuer,
        audience: config.resourceUrl,
        algorithms: ['RS256'],
        clockTolerance: 30,
      });

      req.token = payload as TokenClaims;
      req.scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [];
      next();
    } catch (err) {
      const description = err instanceof Error ? err.message : 'Token validation failed';
      sendUnauthorized(res, description, { mcp: opts.mcp });
    }
  };
}
