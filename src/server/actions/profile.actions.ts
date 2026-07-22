'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

export async function updateWorkerProfileAction(input: {
  fullName: string; hourlyRate: number; workRadiusKm: number;
  professions: string[]; skills: string[]; isActive: boolean; profilePhotoUrl?: string;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { error: userError } = await admin.from('users').update({
    full_name: input.fullName, profile_photo_url: input.profilePhotoUrl ?? null, updated_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (userError) return { success: false, error: 'No pudimos actualizar tus datos.' };

  const { error: profileError } = await admin.from('worker_profiles').update({
    full_name: input.fullName, hourly_rate: input.hourlyRate, work_radius_km: input.workRadiusKm,
    professions: input.professions, skills: input.skills, is_active: input.isActive, updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);
  if (profileError) return { success: false, error: 'No pudimos actualizar tu perfil de worker.' };
  return { success: true };
}

export async function updateEmployerProfileAction(input: {
  companyName: string; address: string; logoUrl?: string; email: string; phone: string;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { error: userError } = await admin.from('users').update({
    full_name: input.companyName, email: input.email, phone: input.phone,
    profile_photo_url: input.logoUrl ?? null, updated_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (userError) return { success: false, error: 'No pudimos actualizar tus datos.' };

  const { error: profileError } = await admin.from('employer_profiles').update({
    company_name: input.companyName, address: input.address, location: input.address,
    logo_url: input.logoUrl ?? null, updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);
  if (profileError) return { success: false, error: 'No pudimos actualizar tu perfil de empresa.' };
  return { success: true };
}

export async function toggleFavoriteWorkerAction(workerId: string): Promise<ActionResult<{ favorite: boolean }>> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const { data: existing } = await admin.from('user_favorites').select('worker_id').eq('employer_id', user.id).eq('worker_id', workerId).maybeSingle();
  if (existing) {
    await admin.from('user_favorites').delete().eq('employer_id', user.id).eq('worker_id', workerId);
    return { success: true, data: { favorite: false } };
  }
  await admin.from('user_favorites').insert({ employer_id: user.id, worker_id: workerId });
  return { success: true, data: { favorite: true } };
}

export async function createDisputeAction(input: { reportedUserId: string; shiftId?: string; reason: string }): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };
  if (!input.reason || input.reason.trim().length < 10) return { success: false, error: 'Describe el problema con al menos 10 caracteres.' };

  const { error } = await supabase.from('disputes').insert({
    reporter_id: user.id, reported_user_id: input.reportedUserId,
    shift_id: input.shiftId ?? null, reason: input.reason.trim(), status: 'open',
  });
  if (error) return { success: false, error: 'No pudimos enviar el reporte.' };
  return { success: true };
}
