/**
 * Iron-session cookie management for the requesting app.
 *
 * The session holds:
 *   - in-flight PKCE transaction material (between login redirect and callback)
 *   - the user's OIDC ID Token + claims after a successful login
 *
 * Resource access tokens are NOT stored in the session — they're short-lived
 * and re-exchanged on demand from the ID Token via the XAA flow. This keeps
 * the cookie small and ensures we always pull fresh tokens from xaa.dev.
 */

import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { loadConfig } from './config';
import type { SessionData } from './types';

export function sessionOptions(): SessionOptions {
  const config = loadConfig();
  return {
    password: config.sessionSecret,
    cookieName: 'xaa_requesting_app_session',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8, // 8h
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}
