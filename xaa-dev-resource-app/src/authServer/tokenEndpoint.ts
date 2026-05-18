import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';
import { remoteJwks } from '../auth/jwks.js';
import { getSigningMaterial } from './keys.js';

export const tokenRouter = Router();

interface TokenError {
  error:
    | 'invalid_request'
    | 'invalid_grant'
    | 'invalid_client'
    | 'unsupported_grant_type'
    | 'invalid_scope'
    | 'invalid_target';
  error_description: string;
  status?: number;
}

function fail(err: TokenError) {
  return { status: err.status ?? 400, body: { error: err.error, error_description: err.error_description } };
}

/**
 * RFC 7523 jwt-bearer grant endpoint.
 *
 * Accepts an ID-JAG (signed by idp.xaa.dev) addressed to this auth server,
 * verifies it, and issues an access token usable against this resource's REST
 * and MCP endpoints.
 */
tokenRouter.post('/token', async (req, res) => {
  const form = req.body ?? {};
  const grantType = form.grant_type;
  const assertion = form.assertion;
  const requestedScope = typeof form.scope === 'string' ? form.scope.trim() : '';

  if (grantType !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
    const { status, body } = fail({
      error: 'unsupported_grant_type',
      error_description: `This endpoint only supports grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer (got "${grantType}")`,
    });
    res.status(status).json(body);
    return;
  }

  if (typeof assertion !== 'string' || !assertion) {
    const { status, body } = fail({
      error: 'invalid_request',
      error_description: '`assertion` (the ID-JAG) is required',
    });
    res.status(status).json(body);
    return;
  }

  // Verify the ID-JAG against the IdP's JWKS.
  // Per draft-parecki-oauth-identity-assertion-authz-grant, the assertion's
  // JOSE `typ` header MUST be `oauth-id-jag+jwt`; reject anything else.
  let idJagPayload;
  try {
    const result = await jwtVerify(assertion, remoteJwks(config.own.idpJwksUrl), {
      issuer: config.own.idpIssuer,
      audience: config.own.authServerUrl,
      algorithms: ['RS256'],
      typ: 'oauth-id-jag+jwt',
      clockTolerance: 30,
    });
    idJagPayload = result.payload;
  } catch (err) {
    const description = err instanceof Error ? err.message : 'ID-JAG verification failed';
    const { status, body } = fail({ error: 'invalid_grant', error_description: description });
    res.status(status).json(body);
    return;
  }

  // ID-JAG's `resource` claim (or `aud` as fallback) must point at this resource.
  const declaredResource =
    typeof idJagPayload['resource'] === 'string' ? (idJagPayload['resource'] as string) : undefined;
  if (declaredResource && declaredResource !== config.resourceUrl) {
    const { status, body } = fail({
      error: 'invalid_target',
      error_description: `Assertion resource "${declaredResource}" does not match this resource "${config.resourceUrl}"`,
    });
    res.status(status).json(body);
    return;
  }

  // Intersect requested scopes with supported scopes.
  const requested: string[] = requestedScope
    ? requestedScope.split(/\s+/).filter(Boolean)
    : config.supportedScopes;
  const granted = requested.filter((s: string) => config.supportedScopes.includes(s));
  if (requested.length && granted.length === 0) {
    const { status, body } = fail({
      error: 'invalid_scope',
      error_description: `None of the requested scopes are supported by this resource: ${requested.join(' ')}`,
    });
    res.status(status).json(body);
    return;
  }

  const { privateKey, kid, alg } = await getSigningMaterial();
  const sub = typeof idJagPayload.sub === 'string' ? idJagPayload.sub : 'unknown';
  const clientId = typeof idJagPayload['client_id'] === 'string' ? (idJagPayload['client_id'] as string) : undefined;

  const accessToken = await new SignJWT({
    scope: granted.join(' '),
    ...(clientId ? { client_id: clientId } : {}),
  })
    // RFC 9068: OAuth 2.0 JWT Access Tokens use `typ: at+jwt`.
    .setProtectedHeader({ alg, kid, typ: 'at+jwt' })
    .setIssuer(config.own.authServerUrl)
    // Exact-string copy of the registered resource URL — becomes the `aud`
    // the resource-server middleware validates against.
    .setAudience(config.resourceUrl)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${config.own.accessTokenTtl}s`)
    .setJti(randomUUID())
    .sign(privateKey);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: config.own.accessTokenTtl,
    scope: granted.join(' '),
  });
});
