'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Application, Shift } from '@/types/core';

export function useShiftApplications(shiftId: string) {
  const supabase = createClient();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase
        .from('shift_applications').select('*, worker_profiles(*)')
        .eq('shift_id', shiftId).order('created_at', { ascending: false });
      if (error) throw new Error('No pudimos cargar las aplicaciones.');
      setApplications((data ?? []) as Application[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar aplicaciones.'); }
    finally { setLoading(false); }
  }, [shiftId, supabase]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  useEffect(() => {
    const channel = supabase.channel(`shift-applications-${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_applications', filter: `shift_id=eq.${shiftId}` },
        () => fetchApplications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchApplications, shiftId, supabase]);

  return { applications, loading, error, refresh: fetchApplications };
}

export function useMyApplications() {
  const supabase = createClient();
  const [applications, setApplications] = useState<Array<Application & { shifts?: Shift | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión.');
      const { data, error } = await supabase
        .from('shift_applications').select('*, shifts(*)')
        .eq('worker_id', user.id).order('created_at', { ascending: false });
      if (error) throw new Error('No pudimos cargar tus aplicaciones.');
      setApplications((data ?? []) as Array<Application & { shifts?: Shift | null }>);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar aplicaciones.'); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase.channel(`my-applications-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_applications', filter: `worker_id=eq.${user.id}` },
          () => fetchApplications())
        .subscribe();
    }
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchApplications, supabase]);

  return { applications, loading, error, refresh: fetchApplications };
}
