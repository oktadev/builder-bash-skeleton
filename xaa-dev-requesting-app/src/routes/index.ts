import { Router } from 'express';
import { config } from '../config.js';

export const indexRouter: Router = Router();

indexRouter.get('/', (req, res) => {
  const user = req.session.user;
  res.render('index', {
    user: user
      ? {
          email: user.claims.email ?? user.claims.sub ?? 'unknown',
          sub: user.claims.sub,
        }
      : null,
    config: {
      idpUrl: config.idpUrl,
      authServerUrl: config.authServerUrl,
      normalResourceUrl: config.normal.resourceUrl,
      mcpResourceUrl: config.mcp.resourceUrl,
    },
  });
});
