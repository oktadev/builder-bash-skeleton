import { Router, urlencoded, json } from 'express';
import { metadataRouter } from './metadata.js';
import { tokenRouter } from './tokenEndpoint.js';

/**
 * Mounts the own auth server at /auth. Only wired up when AUTH_MODE=own.
 */
export const authServerRouter = Router();

// Token endpoint must accept application/x-www-form-urlencoded (and tolerate JSON).
authServerRouter.use(urlencoded({ extended: false }));
authServerRouter.use(json());

authServerRouter.use('/', metadataRouter);
authServerRouter.use('/', tokenRouter);
