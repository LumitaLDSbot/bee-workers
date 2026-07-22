'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const checkInSchema = z.object({ shiftId: z.string().uuid(), lat: z.number(), lng: z.number() });

export async function checkInAction(input: z.infer<typeof checkInSchema>): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Ubicación inválida.' };

  const { shiftId, lat, lng } = parsed.data;
  const { error } = await supabase.from('shift_checkins').insert({
    shift_id: shiftId, worker_id: user.id, check_in_at: new Date().toISOString(), lat, lng,
  });

  if (error) {
    if (error.message.includes('too far') || error.message.includes('demasiado lejos')) return { success: false, error: 'Estás demasiado lejos del turno.' };
    if (error.message.includes('check-in solo está disponible')) return { success: false, error: 'El check-in solo está disponible desde 15 minutos antes del inicio.' };
    return { success: false, error: 'No pudimos registrar el check-in.' };
  }

  return { success: true };
}

const checkOutSchema = z.object({ shiftId: z.string().uuid(), lat: z.number(), lng: z.number() });

export async function checkOutAction(input: z.infer<typeof checkOutSchema>): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const parsed = checkOutSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Ubicación inválida.' };

  const { shiftId, lat, lng } = parsed.data;
  const { error } = await supabase.from('shift_checkins').update({
    check_out_at: new Date().toISOString(), check_out_lat: lat, check_out_lng: lng,
  }).eq('shift_id', shiftId).eq('worker_id', user.id).is('check_out_at', null);

  if (error) return { success: false, error: 'No pudimos registrar el check-out.' };
  return { success: true };
}
