'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { Shift, Checkin, Application } from '@/types/core';
import type { EmployerProfile } from '@/types';

export interface ShiftFilters {
  profession: string;
  maxKm: number;
  date: string;
  minPrice: number;
}

export function useNearbyShifts(filters: ShiftFilters) {
  const supabase = createClient();
  const geo = useGeolocation();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const positionRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchShifts = useCallback(async (pos: { lat: number; lng: number }) => {
    const { data, error } = await supabase.rpc('get_nearby_shifts', {
      worker_lat: pos.lat, worker_lng: pos.lng, max_km: filters.maxKm, profession: filters.profession || null,
    });
    if (error) throw new Error('No pudimos cargar los turnos cercanos.');

    const normalized = (data ?? []) as Shift[];
    const filtered = normalized.filter(shift => {
      if (filters.date && shift.shift_date !== filters.date) return false;
      if (filters.minPrice > 0 && (shift.hourly_rate_offer ?? 0) < filters.minPrice) return false;
      return true;
    });
    setShifts(filtered);
  }, [filters.maxKm, filters.profession, filters.date, filters.minPrice, supabase]);

  const refresh = useCallback(async () => {
    if (!positionRef.current) {
      const pos = await geo.requestPosition();
      positionRef.current = pos;
      await fetchShifts(pos);
      return;
    }
    await fetchShifts(positionRef.current);
  }, [fetchShifts, geo]);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true); setError(null);
      try {
        const pos = geo.position ?? (await geo.requestPosition());
        if (!active) return;
        positionRef.current = pos;
        await fetchShifts(pos);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Error al cargar turnos.');
      } finally { if (active) setLoading(false); }
    }
    init();
    return () => { active = false; };
  }, [fetchShifts, geo.position, geo.requestPosition]);

  useEffect(() => {
    const channel = supabase.channel('nearby-shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: 'status=eq.published' },
        async () => { if (positionRef.current) await fetchShifts(positionRef.current); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchShifts, supabase]);

  return { shifts, loading, error, refresh, geo };
}

export function useMyPublishedShifts() {
  const supabase = createClient();
  const [shifts, setShifts] = useState<Array<Shift & { application_count: number; accepted_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShifts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión.');
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts').select('*').eq('employer_id', user.id).order('starts_at', { ascending: false });
      if (shiftsError) throw new Error('No pudimos cargar tus turnos.');
      const ids = (shiftsData ?? []).map(s => s.id);
      let applications: Array<{ shift_id: string; status: string }> = [];
      if (ids.length > 0) {
        const { data: appsData } = await supabase.from('shift_applications').select('shift_id,status').in('shift_id', ids);
        applications = appsData ?? [];
      }
      const enriched = (shiftsData ?? []).map(shift => {
        const shiftApps = applications.filter(app => app.shift_id === shift.id);
        const accepted = shiftApps.filter(app => app.status === 'accepted').length;
        return { ...(shift as Shift), application_count: shiftApps.length, accepted_count: accepted };
      });
      setShifts(enriched);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar turnos.'); }
    finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    async function setup() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase.channel(`employer-shifts-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `employer_id=eq.${user.id}` },
          () => fetchShifts())
        .subscribe();
    }
    setup();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [fetchShifts, supabase]);

  return { shifts, loading, error, refresh: fetchShifts };
}

export function useShiftDetail(shiftId: string) {
  const supabase = createClient();
  const [shift, setShift] = useState<Shift | null>(null);
  const [employer, setEmployer] = useState<EmployerProfile | null>(null);
  const [myApplication, setMyApplication] = useState<Application | null>(null);
  const [myCheckin, setMyCheckin] = useState<Checkin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts').select('*').eq('id', shiftId).maybeSingle();
      if (shiftError) throw new Error('No pudimos cargar el turno.');
      if (!shiftData) throw new Error('Turno no encontrado.');
      setShift(shiftData as Shift);
      const { data: employerData } = await supabase
        .from('employer_profiles').select('*').eq('user_id', shiftData.employer_id).maybeSingle();
      setEmployer((employerData as EmployerProfile) ?? null);
      if (user) {
        const { data: appData } = await supabase
          .from('shift_applications').select('*').eq('shift_id', shiftId).eq('worker_id', user.id).maybeSingle();
        setMyApplication((appData as Application) ?? null);
        const { data: checkinData } = await supabase
          .from('shift_checkins').select('*').eq('shift_id', shiftId).eq('worker_id', user.id).maybeSingle();
        setMyCheckin((checkinData as Checkin) ?? null);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al cargar el turno.'); }
    finally { setLoading(false); }
  }, [shiftId, supabase]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  useEffect(() => {
    const channel = supabase.channel(`shift-detail-${shiftId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `id=eq.${shiftId}` }, () => fetchDetail())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_applications', filter: `shift_id=eq.${shiftId}` }, () => fetchDetail())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_checkins', filter: `shift_id=eq.${shiftId}` }, () => fetchDetail())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDetail, shiftId, supabase]);

  return { shift, employer, myApplication, myCheckin, loading, error, refresh: fetchDetail };
}
