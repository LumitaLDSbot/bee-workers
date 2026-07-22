'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const applySchema = z.object({
  shiftId: z.string().uuid(),
  message: z.string().max(500).optional(),
  proposedRate: z.coerce.number().min(0).optional().nullable(),
});

export async function applyToShiftAction(input: z.infer<typeof applySchema>): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión para aplicar.' };

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Revisa los datos de tu aplicación.' };

  const { shiftId, message, proposedRate } = parsed.data;
  const { data: shift } = await supabase.from('shifts').select('*').eq('id', shiftId).maybeSingle();
  if (!shift) return { success: false, error: 'Turno no encontrado.' };
  if (shift.status !== 'published') return { success: false, error: 'Este turno ya no está disponible.' };
  if (shift.employer_id === user.id) return { success: false, error: 'No puedes aplicar a tu propio turno.' };

  const finalProposedRate = proposedRate ?? shift.hourly_rate_offer ?? undefined;
  if (!finalProposedRate || finalProposedRate <= 0) return { success: false, error: 'Este turno requiere propuesta de precio.' };

  const { error } = await supabase.from('shift_applications').insert({
    shift_id: shiftId, worker_id: user.id, proposed_rate: finalProposedRate,
    message: message ?? null, status: 'pending',
  });

  if (error) {
    if (error.message.includes('unique') || error.code === '23505') return { success: false, error: 'Ya has aplicado a este turno.' };
    return { success: false, error: 'No pudimos enviar tu aplicación.' };
  }

  return { success: true };
}

export async function acceptApplicationAction(applicationId: string): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { data: application } = await supabase.from('shift_applications').select('*, shifts(*)').eq('id', applicationId).maybeSingle();
  if (!application) return { success: false, error: 'Aplicación no encontrada.' };
  if (application.shifts?.employer_id !== user.id) return { success: false, error: 'No autorizado.' };

  const { count } = await supabase.from('shift_applications').select('id', { count: 'exact', head: true }).eq('shift_id', application.shift_id).eq('status', 'accepted');
  const slotsNeeded = application.shifts?.slots_needed ?? 1;
  if ((count ?? 0) >= slotsNeeded) return { success: false, error: 'Este turno ya cubrió todas las vacantes.' };

  const { error } = await supabase.from('shift_applications').update({ status: 'accepted' }).eq('id', applicationId);
  if (error) return { success: false, error: 'No pudimos aceptar la aplicación.' };
  return { success: true };
}

export async function rejectApplicationAction(applicationId: string): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { data: application } = await supabase.from('shift_applications').select('*, shifts(*)').eq('id', applicationId).maybeSingle();
  if (!application) return { success: false, error: 'Aplicación no encontrada.' };
  if (application.shifts?.employer_id !== user.id) return { success: false, error: 'No autorizado.' };

  const { error } = await supabase.from('shift_applications').update({ status: 'rejected' }).eq('id', applicationId);
  if (error) return { success: false, error: 'No pudimos rechazar la aplicación.' };
  return { success: true };
}
