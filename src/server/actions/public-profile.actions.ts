'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getPublicWorkerProfileAction(workerId: string) {
  const admin = createAdminClient();
  const supabase = createServerSupabaseClient();

  const { data: user } = await admin.from('users').select('id, full_name, profile_photo_url, is_verified, verification_status, nif, is_suspended').eq('id', workerId).maybeSingle();
  if (!user || user.is_suspended) return { success: false as const, error: 'Perfil no disponible.' };

  const { data: profile } = await admin.from('worker_profiles').select('user_id, full_name, professions, skills, hourly_rate, rating, rating_count, total_jobs, is_active, is_autonomo, seguro_vigente, seguro_expires_at').eq('user_id', workerId).maybeSingle();
  if (!profile) return { success: false as const, error: 'Perfil no disponible.' };

  const showRating = (profile.rating_count ?? 0) >= 3;
  let comments: Array<{ stars: number; comment: string | null; created_at: string }> = [];
  if (showRating) {
    const { data: ratings } = await admin.from('ratings').select('stars, comment, created_at').eq('ratee_id', workerId).eq('type', 'employer_to_worker').not('comment', 'is', null).order('created_at', { ascending: false }).limit(5);
    comments = (ratings ?? []) as any;
  }

  const { data: { user: currentUser } } = await supabase.auth.getUser();
  let isFavorite = false;
  if (currentUser) {
    const { data: favorite } = await admin.from('user_favorites').select('worker_id').eq('employer_id', currentUser.id).eq('worker_id', workerId).maybeSingle();
    isFavorite = Boolean(favorite);
  }

  const seguroVigente = profile.seguro_vigente && (!profile.seguro_expires_at || new Date(profile.seguro_expires_at) > new Date());

  return { success: true as const, data: { user, profile: { ...profile, seguro_vigente: seguroVigente }, showRating, comments, isFavorite } };
}

export async function getPublicEmployerProfileAction(employerId: string) {
  const admin = createAdminClient();
  const supabase = createServerSupabaseClient();

  const { data: user } = await admin.from('users').select('id, full_name, profile_photo_url, is_verified, verification_status, is_suspended').eq('id', employerId).maybeSingle();
  if (!user || user.is_suspended) return { success: false as const, error: 'Perfil no disponible.' };

  const { data: profile } = await admin.from('employer_profiles').select('user_id, company_name, address, location, rating, rating_count, total_shifts, logo_url, nif_empresa').eq('user_id', employerId).maybeSingle();
  if (!profile) return { success: false as const, error: 'Perfil no disponible.' };

  const showRating = (profile.rating_count ?? 0) >= 3;
  let comments: Array<{ stars: number; comment: string | null; created_at: string }> = [];
  if (showRating) {
    const { data: ratings } = await admin.from('ratings').select('stars, comment, created_at').eq('ratee_id', employerId).eq('type', 'worker_to_employer').not('comment', 'is', null).order('created_at', { ascending: false }).limit(5);
    comments = (ratings ?? []) as any;
  }

  const { data: { user: currentUser } } = await supabase.auth.getUser();
  return { success: true as const, data: { user, profile, showRating, comments, currentUserId: currentUser?.id ?? null } };
}
