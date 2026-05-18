/**
 * POST /api/auth/logout
 *
 * Destroys the iron-session cookie. We don't currently call the IdP's
 * end_session endpoint (that would log the user out of xaa.dev too) —
 * instead we stay logged in upstream and only drop our local session.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { log } from '@/lib/logger';
import { loadConfig } from '@/lib/config';

export async function POST() {
  const session = await getSession();
  session.destroy();
  log('info', 'auth', 'Session destroyed');
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  session.destroy();
  const config = loadConfig();
  return NextResponse.redirect(`${config.appUrl}/login`);
}
