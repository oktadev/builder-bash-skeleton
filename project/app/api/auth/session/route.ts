/**
 * GET /api/auth/session
 *
 * Returns the current user's session state for client-side rendering.
 * Never returns the raw ID Token — only the safe-to-render claims and
 * a `tokenState` summary derived server-side.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { jwtExpiry } from '@/lib/utils';
import { loadConfig } from '@/lib/config';
import type { TokenState } from '@/lib/types';

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ authenticated: false });
  }

  let scopes: string[] = [];
  try {
    scopes = loadConfig().resourceScopes;
  } catch {
    // config not present — surface as unauthenticated to the client
    return NextResponse.json({ authenticated: false });
  }

  const tokenState: TokenState = {
    hasIdToken: true,
    idTokenExpiresAt: jwtExpiry(session.user.idToken),
    hasResourceAccessToken: false, // re-exchanged on demand
    scopes,
  };

  return NextResponse.json({
    authenticated: true,
    claims: session.user.claims,
    loggedInAt: session.user.loggedInAt,
    tokenState,
  });
}
