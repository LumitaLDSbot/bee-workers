'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { submitRatingAction } from '@/server/actions/ratings.actions';
import type { PendingRating, RatingType } from '@/types/core';

export function usePendingRatings() {
  const supabase = createClient();
  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión.');
      const { data, error } = await supabase
        .from('pending_ratings').select('*, shifts(*)')
        .eq('rater_id', user.id).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw new Error('No pudimos cargar tus valoraciones pendientes.');
      setPendingRatings((data ?? []) as PendingRating[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar valoraciones.'); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase.channel(`pending-ratings-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_ratings', filter: `rater_id=eq.${user.id}` },
          () => fetchPending())
        .subscribe();
    }
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchPending, supabase]);

  const submitRating = useCallback(async (input: {
    pendingRatingId: string; shiftId: string; rateeId: string; type: RatingType;
    stars: number; punctuality?: number; professionalism?: number; comment?: string;
  }) => {
    const result = await submitRatingAction(input);
    if (result.success) await fetchPending();
    return result;
  }, [fetchPending]);

  return { pendingRatings, loading, error, refresh: fetchPending, submitRating };
}
