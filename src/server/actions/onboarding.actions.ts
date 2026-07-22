'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getZodErrorMessage } from '@/lib/utils/zod';
import { workerRegistrationSchema, employerRegistrationSchema } from '@/lib/validations/onboarding';
import type { ActionResult, Role } from '@/types';
import { LEGAL } from '@/lib/constants/legal';

async function getAuthUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function assertOwnPath(path: string, userId: string, label: string) {
  if (!path.startsWith(`${userId}/`)) {
    throw new Error(`Documento inválido: ${label}`);
  }
}

export async function startOnboarding(role: Role): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Debes iniciar sesión antes de continuar.' };

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin.from('users').upsert({
      id: user.id, phone: user.phone ?? null, email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null, role,
      onboarding_completed: false, verification_status: 'pending', updated_at: now,
    });

    if (error) return { success: false, error: 'No hemos podido preparar tu cuenta. Inténtalo de nuevo.' };

    await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, role } });
    return { success: true };
  } catch { return { success: false, error: 'Error inesperado al iniciar el registro.' }; }
}

export async function ensureUserProfile(): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Sesión no encontrada.' };

    const admin = createAdminClient();
    const { data: existing } = await admin.from('users').select('id').eq('id', user.id).maybeSingle();
    if (existing) return { success: true };

    const role = (user.user_metadata?.role as Role) || 'worker';
    const now = new Date().toISOString();

    await admin.from('users').insert({
      id: user.id, phone: user.phone ?? null, email: user.email ?? null,
      full_name: user.user_metadata?.full_name ?? null, role,
      onboarding_completed: false, verification_status: 'pending', updated_at: now,
    });
    return { success: true };
  } catch { return { success: false, error: 'No hemos podido crear tu perfil básico.' }; }
}

export async function completeWorkerRegistration(input: unknown): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Debes iniciar sesión antes de completar el registro.' };

    const parsed = workerRegistrationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: getZodErrorMessage(parsed.error) };

    const data = parsed.data;
    assertOwnPath(data.idFrontPath, user.id, 'documento frontal');
    assertOwnPath(data.selfieDocPath, user.id, 'selfie con documento');
    assertOwnPath(data.nifDocumentPath, user.id, 'comprobante de NIF');
    assertOwnPath(data.atividadePath, user.id, 'comprobante de actividad');
    assertOwnPath(data.seguroPath, user.id, 'comprobante de seguro');

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error: userError } = await admin.from('users').upsert({
      id: user.id, full_name: data.fullName, email: data.email, nif: data.nif,
      birth_date: data.birthDate, profile_photo_url: data.profilePhotoUrl,
      role: 'worker', onboarding_completed: true, verification_status: 'pending',
      terms_accepted_at: now, fiscal_disclaimer_accepted_at: now,
      terms_version: LEGAL.termsVersion, updated_at: now,
    });
    if (userError) return { success: false, error: 'No hemos podido guardar tus datos personales.' };

    const { error: profileError } = await admin.from('worker_profiles').upsert({
      user_id: user.id, full_name: data.fullName, professions: data.professions, skills: data.skills,
      hourly_rate: data.hourlyRate, work_radius_km: data.workRadiusKm, is_autonomo: true,
      niss: data.niss || null, seguro_vigente: true, seguro_expires_at: data.seguroExpiresAt,
      document_type: data.documentType, id_front_path: data.idFrontPath,
      selfie_doc_path: data.selfieDocPath, nif_document_path: data.nifDocumentPath,
      atividade_path: data.atividadePath, seguro_path: data.seguroPath, updated_at: now,
    });
    if (profileError) return { success: false, error: 'No hemos podido guardar tu perfil de trabajador.' };

    const docs = [
      { user_id: user.id, doc_type: 'id_front', storage_bucket: 'worker-documents', storage_path: data.idFrontPath },
      { user_id: user.id, doc_type: 'selfie_doc', storage_bucket: 'worker-documents', storage_path: data.selfieDocPath },
      { user_id: user.id, doc_type: 'nif', storage_bucket: 'worker-documents', storage_path: data.nifDocumentPath },
      { user_id: user.id, doc_type: 'atividade', storage_bucket: 'worker-documents', storage_path: data.atividadePath },
      { user_id: user.id, doc_type: 'seguro', storage_bucket: 'worker-documents', storage_path: data.seguroPath },
    ];
    await admin.from('onboarding_documents').insert(docs);

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'worker', full_name: data.fullName, onboarding_completed: true },
    });

    return { success: true, redirect: '/verification-pending' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error inesperado al completar el registro.' };
  }
}

export async function completeEmployerRegistration(input: unknown): Promise<ActionResult> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Debes iniciar sesión antes de completar el registro.' };

    const parsed = employerRegistrationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: getZodErrorMessage(parsed.error) };

    const data = parsed.data;
    assertOwnPath(data.nifDocumentPath, user.id, 'NIF de empresa');

    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error: userError } = await admin.from('users').upsert({
      id: user.id, full_name: data.companyName, email: data.email, phone: data.contactPhone,
      role: 'employer', profile_photo_url: data.logoUrl, onboarding_completed: true,
      verification_status: 'pending', terms_accepted_at: now, terms_version: LEGAL.termsVersion, updated_at: now,
    });
    if (userError) return { success: false, error: 'No hemos podido guardar tus datos de empresa.' };

    const { error: profileError } = await admin.from('employer_profiles').upsert({
      user_id: user.id, company_name: data.companyName, nif_empresa: data.nifEmpresa,
      address: data.address, location: data.address, latitude: data.latitude, longitude: data.longitude,
      logo_url: data.logoUrl, nif_document_path: data.nifDocumentPath, verification_status: 'pending', updated_at: now,
    });
    if (profileError) return { success: false, error: 'No hemos podido guardar tu perfil de empresa.' };

    await admin.from('onboarding_documents').insert({
      user_id: user.id, doc_type: 'employer_nif', storage_bucket: 'employer-documents', storage_path: data.nifDocumentPath,
    });

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, role: 'employer', company_name: data.companyName, onboarding_completed: true },
    });

    return { success: true, redirect: '/verification-pending' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Error inesperado al completar el registro.' };
  }
}
