/**
 * GET /api/auth/callback
 *
 * Completes the OIDC Authorization Code + PKCE exchange. The IdP redirects
 * the browser here with `code` + `state` query params after the user signs
 * in. We pull the matching PKCE transaction off the session, exchange the
 * code for tokens, and store the user on the session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { completeLogin } from '@/lib/oidc';
import { getSession } from '@/lib/session';
import { log } from '@/lib/logger';
import { loadConfig } from '@/lib/config';

export async function GET(req: NextRequest) {
  const session = await getSession();
  const config = loadConfig();

  if (!session.pkce) {
    log('warn', 'auth', 'Callback hit without PKCE transaction in session');
    return NextResponse.redirect(
      `${config.appUrl}/login?error=missing_pkce_transaction`,
    );
  }

  const { codeVerifier, state, nonce, startedAt } = session.pkce;

  // 10-minute transaction expiry — defends against stale callbacks.
  const ageMs = Date.now() - new Date(startedAt).getTime();
  if (ageMs > 10 * 60 * 1000) {
    log('warn', 'auth', 'PKCE transaction expired', { ageMs });
    session.pkce = undefined;
    await session.save();
    return NextResponse.redirect(`${config.appUrl}/login?error=transaction_expired`);
  }

  try {
    const result = await completeLogin(
      new URL(req.url),
      codeVerifier,
      state,
      nonce,
    );

    session.user = {
      idToken: result.idToken,
      claims: result.claims,
      loggedInAt: new Date().toISOString(),
    };
    session.pkce = undefined;
    await session.save();

    log('info', 'auth', 'Login successful — ID Token stored in session', {
      sub: result.claims.sub,
    });

    return NextResponse.redirect(`${config.appUrl}/dashboard`);
  } catch (err) {
    log('error', 'auth', 'Authorization Code grant failed', {
      error: (err as Error).message,
    });
    session.pkce = undefined;
    await session.save();
    return NextResponse.redirect(
      `${config.appUrl}/login?error=${encodeURIComponent(
        (err as Error).message,
      )}`,
    );
  }
}
