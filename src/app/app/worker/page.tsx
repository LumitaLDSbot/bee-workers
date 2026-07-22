'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useNearbyShifts, type ShiftFilters } from '@/hooks/useShifts';
import { WorkerNav } from '@/components/layout/AppNav';
import { ShiftFiltersBar } from '@/components/shifts/ShiftFilters';
import { ShiftCard } from '@/components/shifts/ShiftCard';
import { Button, EmptyState, ErrorState, FullLoader } from '@/components/ui';
import type { EmployerProfile, Shift } from '@/types/core';

export default function WorkerFeedPage() {
  const router = useRouter();
  const supabase = createClient();
  const [filters, setFilters] = useState<ShiftFilters>({ profession: '', maxKm: 10, date: '', minPrice: 0 });
  const { shifts, loading, error, refresh } = useNearbyShifts(filters);
  const [employers, setEmployers] = useState<Record<string, EmployerProfile>>({});

  useEffect(() => {
    async function fetchEmployers() {
      const employerIds = Array.from(new Set(shifts.map(s => s.employer_id)));
      if (employerIds.length === 0) return;
      const { data } = await supabase.from('employer_profiles').select('*').in('user_id', employerIds);
      const map: Record<string, EmployerProfile> = {};
      (data ?? []).forEach(item => { map[item.user_id] = item as EmployerProfile; });
      setEmployers(map);
    }
    fetchEmployers();
  }, [shifts, supabase]);

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />
      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <div className="rounded-3xl bg-[#1A1A1A] p-5 text-white">
          <h1 className="text-2xl font-black">Turnos cerca de ti</h1>
          <p className="mt-1 text-sm text-white/70">Encuentra oportunidades en Porto y aplica en segundos.</p>
        </div>
        <ShiftFiltersBar filters={filters} onChange={setFilters} />
        {loading && <FullLoader label="Buscando turnos cercanos..." />}
        {!loading && error && <ErrorState message={error} retry={async () => { await refresh(); }} />}
        {!loading && !error && shifts.length === 0 && <EmptyState title="No hay turnos cerca" description="Prueba a ampliar el radio o cambiar los filtros." action={<Button variant="secondary" onClick={refresh}>Recargar</Button>} />}
        <div className="space-y-3">
          {shifts.map((shift: Shift) => {
            const employer = employers[shift.employer_id];
            return <ShiftCard key={shift.id} shift={shift} employerName={employer?.company_name} employerRating={employer?.rating} employerRatingCount={employer?.rating_count} onClick={() => router.push(`/app/worker/shifts/${shift.id}`)} />;
          })}
        </div>
      </main>
    </div>
  );
}
