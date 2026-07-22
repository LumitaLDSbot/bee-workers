'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getEmployerDashboardAction } from '@/server/actions/dashboard.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  SimpleBarChart,
  StatCard,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

interface EmployerDashboardData {
  summary: {
    activeShifts: number;
    workersHiredMonth: number;
    rating: number;
    ratingCount: number;
    totalShifts: number;
    monthSpend: number;
  };
  shifts: any[];
  monthlySpend: Array<{ label: string; value: number }>;
  favorites: any[];
}

export default function EmployerDashboardPage() {
  const [dashboard, setDashboard] = useState<EmployerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await getEmployerDashboardAction();

    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDashboard(result.data as EmployerDashboardData);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando panel employer..." />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Error'} retry={load} />
        </div>
      </div>
    );
  }

  const { summary, shifts, monthlySpend, favorites } = dashboard;
  const showRating = summary.ratingCount >= 3;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-[#1A1A1A] p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black">Panel Employer</h1>
            <p className="mt-1 text-sm text-white/70">
              Gestiona tus turnos y workers contratados.
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/app/employer/shifts/new">
              <Button>Publicar turno</Button>
            </Link>
            <Link href="/app/settings">
              <Button variant="ghost">Ajustes</Button>
            </Link>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Turnos activos" value={String(summary.activeShifts)} icon="📌" />
          <StatCard
            label="Workers contratados este mes"
            value={String(summary.workersHiredMonth)}
            icon="👥"
          />
          <StatCard
            label="Gasto del mes"
            value={formatEUR(summary.monthSpend)}
            icon="💸"
          />
          <StatCard
            label="Rating empresa"
            value={showRating ? summary.rating.toFixed(1) : 'Nuevo'}
            hint={`${summary.totalShifts} turnos completados`}
            icon="⭐"
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Uso mensual</h2>

            {monthlySpend.length === 0 ? (
              <EmptyState title="Sin datos" description="Aún no hay gasto registrado." />
            ) : (
              <SimpleBarChart data={monthlySpend} formatValue={formatEUR} />
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Workers favoritos</h2>

            {favorites.length === 0 ? (
              <EmptyState
                title="Sin favoritos"
                description="Guarda workers con buena experiencia."
              />
            ) : (
              <div className="space-y-3">
                {favorites.map((worker: any) => (
                  <Link
                    key={worker.worker_id}
                    href={`/workers/${worker.worker_id}`}
                    className="flex items-center gap-3 rounded-2xl border border-black/5 p-3 transition hover:shadow-md dark:border-white/10"
                  >
                    <Avatar src={worker.profile_photo_url} fallback="W" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{worker.full_name}</p>
                      <p className="truncate text-sm text-[#8B8B8B] dark:text-neutral-400">
                        {worker.professions?.[0] ?? 'Worker'}
                      </p>
                    </div>

                    {worker.rating_count >= 3 && (
                      <Badge>⭐ {worker.rating.toFixed(1)}</Badge>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Turnos publicados</h2>
            <Link href="/app/employer/shifts">
              <Button variant="secondary">Ver todos</Button>
            </Link>
          </div>

          {shifts.length === 0 ? (
            <EmptyState
              title="Sin turnos"
              description="Publica tu primer turno."
              action={
                <Link href="/app/employer/shifts/new">
                  <Button>Publicar turno</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {shifts.map((shift: any) => (
                <Link
                  key={shift.shift_id}
                  href={`/app/employer/shifts/${shift.shift_id}`}
                  className="flex flex-col gap-3 rounded-2xl border border-black/5 p-4 transition hover:shadow-md dark:border-white/10 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-bold">{shift.profession_required}</p>
                    <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                      {formatDateTime(shift.starts_at)} · {shift.location}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted">{shift.application_count} apps</Badge>
                    <Badge variant="muted">
                      {shift.accepted_count}/{shift.slots_needed}
                    </Badge>
                    <Badge
                      variant={
                        shift.status === 'completed'
                          ? 'success'
                          : shift.status === 'assigned'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {shift.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}