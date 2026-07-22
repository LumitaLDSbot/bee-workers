'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useShiftDetail } from '@/hooks/useShifts';
import { useShiftApplications } from '@/hooks/useApplications';
import {
  acceptApplicationAction,
  rejectApplicationAction,
} from '@/server/actions/applications.actions';
import { EmployerNav } from '@/components/layout/AppNav';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  Modal,
  Select,
} from '@/components/ui';
import { formatDateTime, calculateShiftHours } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';
import type { Application } from '@/types/core';

export default function EmployerShiftDetailPage() {
  const params = useParams();
  const router = useRouter();

  const shiftId = params.id as string;
  const { shift, loading, error, refresh } = useShiftDetail(shiftId);
  const { applications, refresh: refreshApplications } = useShiftApplications(shiftId);

  const [sortBy, setSortBy] = useState<'rating' | 'jobs' | 'price'>('rating');
  const [selectedWorker, setSelectedWorker] = useState<Application | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const sortedApplications = useMemo(() => {
    const list = [...applications];

    return list.sort((a, b) => {
      if (sortBy === 'rating') {
        return (
          (b.worker_profiles?.rating ?? 0) - (a.worker_profiles?.rating ?? 0)
        );
      }

      if (sortBy === 'jobs') {
        return (
          (b.worker_profiles?.total_jobs ?? 0) - (a.worker_profiles?.total_jobs ?? 0)
        );
      }

      return a.proposed_rate - b.proposed_rate;
    });
  }, [applications, sortBy]);

  const handleAccept = async (applicationId: string) => {
    setActionLoading(applicationId);
    await acceptApplicationAction(applicationId);
    setActionLoading(null);
    await Promise.all([refresh(), refreshApplications()]);
  };

  const handleReject = async (applicationId: string) => {
    setActionLoading(applicationId);
    await rejectApplicationAction(applicationId);
    setActionLoading(null);
    await refreshApplications();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <EmployerNav />
        <FullLoader />
      </div>
    );
  }

  if (error || !shift) {
    return (
      <div className="min-h-screen bg-[#FFFAF0]">
        <EmployerNav />
        <div className="mx-auto max-w-md px-4 py-6">
          <ErrorState message={error ?? 'Turno no encontrado.'} retry={refresh} />
        </div>
      </div>
    );
  }

  const hours = calculateShiftHours(shift.starts_at, shift.ends_at);
  const acceptedCount = applications.filter(a => a.status === 'accepted').length;
  const remainingSlots = Math.max(shift.slots_needed - acceptedCount, 0);

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <Button variant="ghost" onClick={() => router.back()}>
          ← Volver
        </Button>

        <Card className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-black">{shift.profession_required}</h1>
              <p className="text-sm text-[#8B8B8B]">{formatDateTime(shift.starts_at)}</p>
            </div>
            <Badge>{shift.status}</Badge>
          </div>

          <p className="text-sm text-[#8B8B8B]">
            {shift.hourly_rate_offer
              ? `${formatEUR(shift.hourly_rate_offer)}/h`
              : 'Precio a convenir'}{' '}
            · {hours.toFixed(1)}h · {acceptedCount}/{shift.slots_needed} aceptados
          </p>

          {shift.description && (
            <div className="rounded-2xl bg-[#F5F5F0] p-4 text-sm">
              {shift.description}
            </div>
          )}
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Aplicaciones</h2>

          <div className="w-40">
            <Select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="rating">Mejor rating</option>
              <option value="jobs">Más trabajos</option>
              <option value="price">Menor precio</option>
            </Select>
          </div>
        </div>

        {applications.length === 0 && (
          <EmptyState
            title="Sin aplicaciones"
            description="Comparte tu turno o espera a que los workers apliquen."
          />
        )}

        <div className="space-y-3">
          {sortedApplications.map(app => {
            const profile = app.worker_profiles;
            const showRating = (profile?.rating_count ?? 0) >= 3;

            return (
              <Card key={app.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold">
                      {profile?.full_name ?? 'Worker'}
                    </p>
                    <p className="text-xs text-[#8B8B8B]">
                      {showRating
                        ? `⭐ ${profile?.rating.toFixed(1)} · ${profile?.total_jobs} trabajos`
                        : 'Perfil nuevo'}
                    </p>
                  </div>

                  <Badge
                    variant={
                      app.status === 'accepted'
                        ? 'success'
                        : app.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {app.status}
                  </Badge>
                </div>

                <p className="text-sm font-semibold">
                  {formatEUR(app.proposed_rate)}/h
                </p>

                {app.message && (
                  <p className="rounded-2xl bg-[#F5F5F0] p-3 text-sm text-[#1A1A1A]">
                    {app.message}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedWorker(app)}
                  >
                    Ver perfil
                  </Button>

                  {app.status === 'pending' && remainingSlots > 0 && (
                    <Button
                      loading={actionLoading === app.id}
                      onClick={() => handleAccept(app.id)}
                    >
                      Aceptar
                    </Button>
                  )}

                  {app.status === 'pending' && (
                    <Button
                      variant="danger"
                      loading={actionLoading === app.id}
                      onClick={() => handleReject(app.id)}
                    >
                      Rechazar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      <Modal
        open={!!selectedWorker}
        onClose={() => setSelectedWorker(null)}
        title="Perfil del worker"
      >
        {selectedWorker?.worker_profiles && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-bold">
                {selectedWorker.worker_profiles.full_name}
              </p>

              <p className="text-sm text-[#8B8B8B]">
                {selectedWorker.worker_profiles.rating_count >= 3
                  ? `⭐ ${selectedWorker.worker_profiles.rating.toFixed(1)} · ${selectedWorker.worker_profiles.total_jobs} trabajos`
                  : 'Este perfil aún no tiene suficientes valoraciones'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Profesiones</p>
              <div className="flex flex-wrap gap-2">
                {selectedWorker.worker_profiles.professions.map(item => (
                  <span
                    key={item}
                    className="rounded-full bg-[#F5F5F0] px-3 py-1 text-xs"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Skills</p>
              <div className="flex flex-wrap gap-2">
                {selectedWorker.worker_profiles.skills.map(item => (
                  <span
                    key={item}
                    className="rounded-full bg-[#F5F5F0] px-3 py-1 text-xs"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}