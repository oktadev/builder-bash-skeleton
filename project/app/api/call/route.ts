/**
 * POST /api/call
 *
 * Drives the full XAA flow: ID Token → ID-JAG → access token → resource call.
 * Requires an authenticated session.
 *
 * Response is either a `CallResult` (200) or `ApiError` (mapped status code).
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { callProtectedResource } from '@/lib/resource-call';
import { log } from '@/lib/logger';
import type { ApiError, ErrorCode } from '@/lib/types';

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  invalid_token: 401,
  expired_token: 401,
  insufficient_scope: 403,
  resource_failure: 502,
  config_error: 500,
  token_exchange_failure: 502,
  unknown: 500,
};

export async function POST() {
  const session = await getSession();
  if (!session.user) {
    log('warn', 'resource-call', 'POST /api/call without session');
    const err: ApiError = {
      ok: false,
      error: 'unauthorized',
      message: 'Not authenticated. Log in first.',
    };
    return NextResponse.json(err, { status: 401 });
  }

  const result = await callProtectedResource(session.user.idToken);
  if (!result.ok) {
    return NextResponse.json(result, {
      status: ERROR_STATUS[result.error] ?? 500,
    });
  }
  return NextResponse.json(result, { status: 200 });
}
