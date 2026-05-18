/**
 * GET /api/auth/login
 *
 * Starts the OIDC Authorization Code + PKCE flow:
 *   1. Generate code_verifier, state, nonce.
 *   2. Stash them on the session (so the callback can verify).
 *   3. Build the IdP authorization URL and 302 the browser there.
 */

import { NextResponse } from 'next/server';
import { buildLoginUrl } from '@/lib/oidc';
import { getSession } from '@/lib/session';
import { log } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getSession();
    const { authUrl, codeVerifier, state, nonce } = await buildLoginUrl();

    session.pkce = {
      codeVerifier,
      state,
      nonce,
      startedAt: new Date().toISOString(),
    };
    await session.save();

    log('info', 'auth', 'Built OIDC authorization URL — redirecting to IdP', {
      state,
    });

    return NextResponse.redirect(authUrl);
  } catch (err) {
    log('error', 'auth', 'Failed to start login', {
      error: (err as Error).message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'config_error',
        message: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
