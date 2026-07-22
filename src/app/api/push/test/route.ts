import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push-server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const result = await sendPushToUser(user.id, { title: 'Bee Workers', body: 'Notificación de prueba correcta.', url: '/', tag: 'push-test' });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'No se pudo enviar la notificación' }, { status: 500 });
  }
}
