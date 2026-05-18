/**
 * GET /api/logs   — return the in-memory observability buffer
 * DELETE /api/logs — clear the buffer
 */

import { NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/logger';

export async function GET() {
  return NextResponse.json({ logs: getLogs() });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ ok: true });
}
