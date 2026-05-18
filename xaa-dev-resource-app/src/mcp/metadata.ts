import { Router } from 'express';
import { config } from '../config.js';

/**
 * RFC 9728 protected resource metadata. Mounted at the resource origin so
 * MCP clients / LLM agents can auto-discover the authorization server.
 */
export const protectedResourceMetadataRouter = Router();

protectedResourceMetadataRouter.get('/.well-known/oauth-protected-resource', (_req, res) => {
  const authServer =
    config.authMode === 'playground' ? config.playground.issuer : config.own.authServerUrl;

  res.json({
    resource: config.resourceUrl,
    authorization_servers: [authServer],
    scopes_supported: config.supportedScopes,
    bearer_methods_supported: ['header'],
    resource_documentation: new URL('/', config.resourceUrl).toString(),
  });
});
