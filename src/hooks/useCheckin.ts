'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import { checkInAction, checkOutAction } from '@/server/actions/checkin.actions';
import type { Checkin, Shift } from '@/types/core';

export function useCheckin(shiftId: string) {
  const supabase = createClient();
  const geo = useGeolocation();
  const [shift, setShift] = useState<Shift | null>(null);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => { const interval = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(interval); }, []);

  const fetchCheckin = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión.');
      const { data: shiftData } = await supabase.from('shifts').select('*').eq('id', shiftId).maybeSingle();
      setShift((shiftData as Shift) ?? null);
      const { data: checkinData } = await supabase
        .from('shift_checkins').select('*').eq('shift_id', shiftId).eq('worker_id', user.id).maybeSingle();
      setCheckin((checkinData as Checkin) ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar check-in.'); }
    finally { setLoading(false); }
  }, [shiftId, supabase]);

  useEffect(() => { fetchCheckin(); }, [fetchCheckin]);

  const canCheckIn = (() => {
    if (!shift || checkin) return false;
    const start = new Date(shift.starts_at).getTime();
    const end = new Date(shift.ends_at).getTime();
    const current = now.getTime();
    return current >= start - 15 * 60 * 1000 && current <= end + 2 * 60 * 60 * 1000;
  })();

  const doCheckIn = useCallback(async () => {
    setActionLoading(true); setActionError(null);
    try {
      const pos = await geo.requestPosition();
      const result = await checkInAction({ shiftId, lat: pos.lat, lng: pos.lng });
      if (!result.success) throw new Error(result.error);
      await fetchCheckin();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Error al hacer check-in.'); }
    finally { setActionLoading(false); }
  }, [fetchCheckin, geo, shiftId]);

  const doCheckOut = useCallback(async () => {
    setActionLoading(true); setActionError(null);
    try {
      const pos = await geo.requestPosition();
      const result = await checkOutAction({ shiftId, lat: pos.lat, lng: pos.lng });
      if (!result.success) throw new Error(result.error);
      await fetchCheckin();
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Error al finalizar turno.'); }
    finally { setActionLoading(false); }
  }, [fetchCheckin, geo, shiftId]);

  return { shift, checkin, loading, error, actionLoading, actionError, canCheckIn, doCheckIn, doCheckOut, refresh: fetchCheckin };
}
