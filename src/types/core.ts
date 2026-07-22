import type { WorkerProfile } from '@/types';

export type ShiftStatus =
  | 'draft'
  | 'published'
  | 'assigned'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'cancelled';

export type RatingType = 'employer_to_worker' | 'worker_to_employer';

export interface Shift {
  id: string;
  employer_id: string;
  profession_required: string;
  description: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  starts_at: string;
  ends_at: string;
  hourly_rate_offer: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ShiftStatus;
  slots_needed: number;
  accepted_count?: number;
  remaining_slots?: number;
  distance_km?: number;
}

export interface Application {
  id: string;
  shift_id: string;
  worker_id: string;
  proposed_rate: number;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  worker_profiles?: WorkerProfile | null;
}

export interface Checkin {
  id: string;
  shift_id: string;
  worker_id: string;
  check_in_at: string;
  lat: number | null;
  lng: number | null;
  distance_meters: number | null;
  check_out_at: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
}

export interface PendingRating {
  id: string;
  shift_id: string;
  rater_id: string;
  ratee_id: string;
  type: RatingType;
  status: 'pending' | 'done';
  created_at: string;
  shifts?: Shift | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export interface NetBreakdownInput {
  hourlyRate: number;
  hours: number;
  ssExempt?: boolean;
}

export interface NetBreakdownResult {
  hourlyRate: number;
  hours: number;
  gross: number;
  commissionRate: number;
  commission: number;
  netBeforeTaxes: number;
  irsTaxableBase: number;
  irsRate: number;
  irsEstimate: number;
  ssBase: number;
  ssRate: number;
  ssExempt: boolean;
  ssEstimate: number;
  totalTaxEstimate: number;
  netAfterTaxes: number;
}
