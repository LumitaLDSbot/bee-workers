'use server';

import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const ratingSchema = z.object({
  pendingRatingId: z.string().uuid(),
  shiftId: z.string().uuid(),
  rateeId: z.string().uuid(),
  type: z.enum(['employer_to_worker', 'worker_to_employer']),
  stars: z.number().int().min(1).max(5),
  punctuality: z.number().int().min(1).max(5).optional(),
  professionalism: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});

export async function submitRatingAction(input: z.infer<typeof ratingSchema>): Promise<ActionResult> {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Debes iniciar sesión.' };

  const parsed = ratingSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Revisa los datos de la valoración.' };

  const data = parsed.data;
  const { data: pending } = await supabase.from('pending_ratings').select('*')
    .eq('id', data.pendingRatingId).eq('rater_id', user.id).eq('status', 'pending').maybeSingle();
  if (!pending) return { success: false, error: 'Esta valoración ya no está pendiente.' };

  const { error } = await supabase.from('ratings').insert({
    shift_id: data.shiftId, rater_id: user.id, ratee_id: data.rateeId, type: data.type,
    stars: data.stars, punctuality: data.punctuality ?? null, professionalism: data.professionalism ?? null,
    comment: data.comment ?? null,
  });
  if (error) return { success: false, error: 'No pudimos guardar la valoración.' };
  return { success: true };
}
