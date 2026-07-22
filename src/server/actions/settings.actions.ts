'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

export async function getSettingsDataAction() {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false as const, error: 'Debes iniciar sesión.' };

  const [userData, workerProfile, employerProfile, settings, notificationSettings] = await Promise.all([
    admin.from('users').select('*').eq('id', user.id).maybeSingle(),
    admin.from('worker_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('employer_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    admin.from('notification_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  return { success: true as const, data: { user: userData.data, workerProfile: workerProfile.data, employerProfile: employerProfile.data, settings: settings.data, notificationSettings: notificationSettings.data } };
}

export async function updateUserSettingsAction(input: { language: 'es' | 'pt' | 'en'; theme: 'light' | 'dark' }): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };
  await admin.from('user_settings').upsert({ user_id: user.id, language: input.language, theme: input.theme, updated_at: new Date().toISOString() });
  return { success: true };
}

export async function updateNotificationSettingsAction(input: {
  new_shift_nearby: boolean; new_application: boolean; application_accepted: boolean;
  application_rejected: boolean; worker_checked_in: boolean; worker_checked_out: boolean;
  rating_pending: boolean; marketing: boolean;
}): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };
  await admin.from('notification_settings').upsert({ user_id: user.id, ...input, updated_at: new Date().toISOString() });
  return { success: true };
}

export async function requestDeleteAccountAction(): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };
  await admin.from('users').update({ delete_requested_at: new Date().toISOString() }).eq('id', user.id);
  return { success: true };
}

export async function cancelDeleteAccountAction(): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };
  await admin.from('users').update({ delete_requested_at: null }).eq('id', user.id);
  return { success: true };
}
