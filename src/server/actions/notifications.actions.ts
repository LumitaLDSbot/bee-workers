'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('user_id', user.id);
  return { success: true };
}
