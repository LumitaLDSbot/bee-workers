'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cancelUpcomingShiftAction } from '@/server/actions/shifts.actions';

export async function getWorkerDashboardAction() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_worker_dashboard');
  if (error) return { success: false as const, error: 'No pudimos cargar tu panel.' };
  return { success: true as const, data };
}

export async function getWorkerMonthlyEarningsAction(monthCount = 6) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_worker_monthly_earnings', { month_count: monthCount });
  if (error) return { success: false as const, error: 'No pudimos cargar tus ingresos.' };
  return { success: true as const, data };
}

export async function getWorkerCompletedShiftsAction(page = 0, pageSize = 10) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_worker_completed_shifts', { page, page_size: pageSize });
  if (error) return { success: false as const, error: 'No pudimos cargar tu historial.' };
  return { success: true as const, data };
}

export async function getEmployerDashboardAction() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_employer_dashboard');
  if (error) return { success: false as const, error: 'No pudimos cargar tu panel.' };
  return { success: true as const, data };
}

export { cancelUpcomingShiftAction };
