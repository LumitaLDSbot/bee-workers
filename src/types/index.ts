export type Role = 'worker' | 'employer' | 'both';

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  id: string;
  phone: string | null;
  email: string | null;
  full_name: string | null;
  nif: string | null;
  role: Role;
  is_verified: boolean;
  onboarding_completed: boolean;
  verification_status: VerificationStatus;
  profile_photo_url: string | null;
  birth_date: string | null;
  terms_accepted_at: string | null;
  fiscal_disclaimer_accepted_at: string | null;
  terms_version: string;
}

export interface WorkerProfile {
  user_id: string;
  full_name: string | null;
  professions: string[];
  skills: string[];
  hourly_rate: number;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  rating_count: number;
  total_jobs: number;
  is_autonomo: boolean;
  niss: string | null;
  first_activity_at: string | null;
  is_social_security_exempt: boolean;
  seguro_vigente: boolean;
  seguro_expires_at: string | null;
  work_radius_km: number | null;
  document_type: string | null;
  id_front_path: string | null;
  selfie_doc_path: string | null;
  nif_document_path: string | null;
  atividade_path: string | null;
  seguro_path: string | null;
}

export interface EmployerProfile {
  user_id: string;
  company_name: string;
  nif_empresa: string | null;
  address: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  rating_count: number;
  total_shifts: number;
  logo_url: string | null;
  nif_document_path: string | null;
  verification_status: VerificationStatus;
}

export type ActionResult<T = undefined> =
  | { success: true; data?: T; redirect?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}
