'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResult } from '@/types';

async function assertAdmin() {
  const supabase = createServerSupabaseClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Debes iniciar sesión.');
  const { data } = await admin.from('users').select('is_admin').eq('id', user.id).maybeSingle();
  if (!data?.is_admin) throw new Error('No autorizado.');
  return user;
}

export async function adminGetMetricsAction() {
  try {
    await assertAdmin();
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc('get_admin_metrics');
    if (error) return { success: false as const, error: 'No pudimos cargar métricas.' };
    return { success: true as const, data };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminGetUsersAction(input: {
  role?: 'worker' | 'employer'; verification?: 'pending' | 'approved' | 'rejected';
  suspended?: boolean; search?: string; page?: number; pageSize?: number;
}) {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const page = input.page ?? 0;
    const pageSize = input.pageSize ?? 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = admin.from('users').select(`
      id, full_name, email, phone, role, is_verified, verification_status, is_suspended,
      delete_requested_at, created_at,
      worker_profiles (user_id, full_name, professions, rating, rating_count, total_jobs, is_active),
      employer_profiles (user_id, company_name, rating, rating_count, total_shifts)
    `, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

    if (input.role === 'worker') query = query.in('role', ['worker', 'both']);
    if (input.role === 'employer') query = query.in('role', ['employer', 'both']);
    if (input.verification) query = query.eq('verification_status', input.verification);
    if (typeof input.suspended === 'boolean') query = query.eq('is_suspended', input.suspended);
    if (input.search?.trim()) {
      const term = input.search.trim().replace(/[%]/g, '');
      query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    const { data, error, count } = await query;
    if (error) return { success: false as const, error: 'No pudimos cargar usuarios.' };
    return { success: true as const, data: { users: data ?? [], total: count ?? 0, page, pageSize } };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminSetVerificationAction(input: { userId: string; status: 'pending' | 'approved' | 'rejected' }) {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    await admin.from('users').update({ verification_status: input.status, is_verified: input.status === 'approved', updated_at: new Date().toISOString() }).eq('id', input.userId);
    await admin.from('employer_profiles').update({ verification_status: input.status, updated_at: new Date().toISOString() }).eq('user_id', input.userId);
    return { success: true as const };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminSetSuspensionAction(input: { userId: string; suspended: boolean; reason?: string }) {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    await admin.from('users').update({ is_suspended: input.suspended, suspension_reason: input.reason ?? null, updated_at: new Date().toISOString() }).eq('id', input.userId);
    return { success: true as const };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminGetPendingDocumentsAction() {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const { data: docs } = await admin.from('onboarding_documents').select(`
      id, user_id, doc_type, storage_bucket, storage_path, status, created_at,
      users:user_id (id, full_name, email, role)
    `).eq('status', 'pending').order('created_at', { ascending: true }).limit(100);

    const enriched = await Promise.all((docs ?? []).map(async doc => {
      const { data: signed } = await admin.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path, 60 * 10);
      return { ...doc, signedUrl: signed?.signedUrl ?? null };
    }));
    return { success: true as const, data: enriched };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminReviewDocumentAction(input: { documentId: string; status: 'approved' | 'rejected'; rejectReason?: string }) {
  try {
    const adminUser = await assertAdmin();
    const admin = createAdminClient();
    await admin.from('onboarding_documents').update({
      status: input.status, reviewed_by: adminUser.id, reviewed_at: new Date().toISOString(), reject_reason: input.rejectReason ?? null,
    }).eq('id', input.documentId);
    return { success: true as const };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminGetDisputesAction(status?: 'open' | 'under_review' | 'resolved' | 'closed') {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    let query = admin.from('disputes').select(`
      id, reason, status, admin_notes, created_at,
      reporter:reporter_id (id, full_name, email),
      reported:reported_user_id (id, full_name, email)
    `).order('created_at', { ascending: false }).limit(100);
    if (status) query = query.eq('status', status);
    const { data } = await query;
    return { success: true as const, data: data ?? [] };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}

export async function adminResolveDisputeAction(input: { disputeId: string; status: 'under_review' | 'resolved' | 'closed'; adminNotes?: string }) {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    await admin.from('disputes').update({ status: input.status, admin_notes: input.adminNotes ?? null, updated_at: new Date().toISOString() }).eq('id', input.disputeId);
    return { success: true as const };
  } catch (err) { return { success: false as const, error: err instanceof Error ? err.message : 'No autorizado.' }; }
}
