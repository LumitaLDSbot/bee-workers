'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

const publishShiftSchema = z.object({
  profession: z.string().min(1, 'Selecciona una profesión'),
  date: z.string().min(1, 'Selecciona una fecha'),
  startTime: z.string().min(1, 'Selecciona hora de inicio'),
  endTime: z.string().min(1, 'Selecciona hora de fin'),
  pricePerHour: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(1000).optional(),
  slotsNeeded: z.coerce.number().int().min(1).max(20),
});

export type PublishShiftInput = z.infer<typeof publishShiftSchema>;

export async function publishShiftAction(input: PublishShiftInput): Promise<ActionResult<{ shiftId: string }>> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión para publicar un turno.' };

  const parsed = publishShiftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message ?? 'Revisa los datos del turno.' };

  const data = parsed.data;
  const { data: employerProfile } = await supabase.from('employer_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (!employerProfile) return { success: false, error: 'No encontramos tu perfil de empleador.' };
  if (!employerProfile.latitude || !employerProfile.longitude) return { success: false, error: 'Tu empresa no tiene ubicación configurada.' };

  const { data: shiftData, error } = await supabase.from('shifts').insert({
    employer_id: user.id, profession_required: data.profession, description: data.description ?? null,
    shift_date: data.date, start_time: data.startTime, end_time: data.endTime,
    hourly_rate_offer: data.pricePerHour || null, location: employerProfile.address ?? employerProfile.location ?? 'Porto',
    latitude: employerProfile.latitude, longitude: employerProfile.longitude,
    status: 'published', slots_needed: data.slotsNeeded,
  }).select('id').single();

  if (error) return { success: false, error: 'No pudimos publicar el turno.' };
  return { success: true, data: { shiftId: shiftData.id }, redirect: '/app/employer/shifts' };
}

export async function cancelUpcomingShiftAction(shiftId: string): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { data: application } = await admin.from('shift_applications').select('*, shifts(*)').eq('shift_id', shiftId).eq('worker_id', user.id).maybeSingle();
  if (!application) return { success: false, error: 'No tienes aplicación para este turno.' };

  const shift = application.shifts;
  if (!shift) return { success: false, error: 'Turno no encontrado.' };

  const startsAt = new Date(shift.starts_at).getTime();
  const hoursUntilStart = (startsAt - Date.now()) / 3600000;

  if (application.status === 'accepted' && hoursUntilStart < 24) {
    return { success: false, error: 'Solo puedes cancelar un turno aceptado con más de 24 horas de antelación.' };
  }

  const nextStatus = application.status === 'accepted' ? 'cancelled' : 'withdrawn';
  const { error } = await admin.from('shift_applications').update({ status: nextStatus }).eq('id', application.id);
  if (error) return { success: false, error: 'No pudimos cancelar el turno.' };

  if (application.status === 'accepted') {
    await admin.from('notifications').insert({
      user_id: shift.employer_id, type: 'application_cancelled',
      title: 'Un worker canceló su turno', body: 'Un trabajador aceptado canceló su participación.',
      data: { shiftId, workerId: user.id },
    });
  }

  return { success: true };
}
