import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('users').select('id').limit(1);
    if (error) return NextResponse.json({ status: 'degraded', database: 'error', timestamp: new Date().toISOString(), latencyMs: Date.now() - startedAt }, { status: 503 });
    return NextResponse.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString(), latencyMs: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json({ status: 'error', database: 'unreachable', timestamp: new Date().toISOString(), latencyMs: Date.now() - startedAt }, { status: 503 });
  }
}
