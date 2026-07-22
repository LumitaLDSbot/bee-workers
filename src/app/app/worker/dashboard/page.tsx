'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getWorkerDashboardAction,
  getWorkerMonthlyEarningsAction,
  getWorkerCompletedShiftsAction,
  cancelUpcomingShiftAction,
} from '@/server/actions/dashboard.actions';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FullLoader,
  ProgressBar,
  SimpleBarChart,
  StatCard,
} from '@/components/ui';
import { formatDateTime, formatEUR } from '@/lib/utils/format';

interface WorkerDashboardData {
  summary: {
    weekShifts: number;
    monthGross: number;
    monthNetBeforeTaxes: number;
    monthNetAfterTaxes: number;
    rating: number;
    ratingCount: number;
    totalJobs: number;
    isActive: boolean;
  };
  iva: {
    annualBilled: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };
  upcomingShifts: any[];
}

interface MonthlyEarning {
  month: string;
  label: string;
  gross: number;
  net: number;
}

interface CompletedHistory {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
}

export default function WorkerDashboardPage() {
  const [dashboard, setDashboard] = useState<WorkerDashboardData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEarning[]>([]);
  const [history, setHistory] = useState<CompletedHistory | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (currentPage = 0) => {
    setLoading(true);
    setError(null);

    const [dashRes, monthlyRes, historyRes] = await Promise.all([
      getWorkerDashboardAction(),
      getWorkerMonthlyEarningsAction(6),
      getWorkerCompletedShiftsAction(currentPage, 10),
    ]);

    if (!dashRes.success) {
      setError(dashRes.error);
      setLoading(false);
      return;
    }

    setDashboard(dashRes.data as WorkerDashboardData);
    setMonthly((monthlyRes.success ? monthlyRes.data : []) as MonthlyEarning[]);
    setHistory((historyRes.success ? historyRes.data : null) as CompletedHistory | null);
    setPage(currentPage);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const handleCancelShift = async (shiftId: string) => {
    setActionLoading(shiftId);
    const result = await cancelUpcomingShiftAction(shiftId);
    setActionLoading(null);

    if (result.success) {
      await load(page);
    } else {
      alert(result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
        <FullLoader label="Cargando tu panel..." />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-[#FFFAF0] px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-md">
          <ErrorState message={error ?? 'Error'} retry={() => load(page)} />
        </div>
      </div>
    );
  }

  const { summary, iva, upcomingShifts } = dashboard;
  const showRating = summary.ratingCount >= 3;

  return (
    <div className="min-h-screen bg-[#FFFAF0] dark:bg-neutral-950">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-[#1A1A1A] p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black">Panel Worker</h1>
            <p className="mt-1 text-sm text-white/70">
              Resumen de tu actividad como autónomo.
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/app/worker">
              <Button variant="secondary">Ver feed</Button>
            </Link>
            <Link href="/app/settings">
              <Button variant="ghost">Ajustes</Button>
            </Link>
          </div>
        </div>

        {/* Resumen */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Turnos esta semana"
            value={String(summary.weekShifts)}
            icon="📅"
          />
          <StatCard
            label="Ingresos del mes"
            value={formatEUR(summary.monthGross)}
            hint={`Antes de impuestos: ${formatEUR(summary.monthNetBeforeTaxes)}`}
            icon="💶"
          />
          <StatCard
            label="Rating actual"
            value={showRating ? summary.rating.toFixed(1) : 'Nuevo'}
            hint={`${summary.totalJobs} trabajos completados`}
            icon="⭐"
          />
          <StatCard
            label="Disponibilidad"
            value={summary.isActive ? 'Activo' : 'Inactivo'}
            icon={summary.isActive ? '🟢' : '⚪'}
          />
        </section>

        {/* IVA */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Límite de IVA</h2>
            <Badge variant={iva.percentUsed >= 80 ? 'danger' : 'default'}>
              {formatEUR(iva.annualBilled)} / {formatEUR(iva.limit)}
            </Badge>
          </div>

          <ProgressBar value={iva.annualBilled} max={iva.limit} label="Facturación anual" />

          {iva.remaining > 0 ? (
            <p className="rounded-2xl bg-[#FFB800]/10 p-4 text-sm text-[#1A1A1A] dark:text-neutral-100">
              Te quedan <strong>{formatEUR(iva.remaining)}</strong> antes de tener que
              cobrar IVA.
            </p>
          ) : (
            <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Has superado el límite de exención de IVA. Revisa tus obligaciones fiscales.
            </p>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gráfico ingresos */}
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Ingresos mensuales</h2>

            {monthly.length === 0 ? (
              <EmptyState title="Sin datos" description="Aún no tienes ingresos registrados." />
            ) : (
              <SimpleBarChart
                data={monthly.map(item => ({
                  label: item.label,
                  value: item.gross,
                }))}
                formatValue={formatEUR}
              />
            )}
          </Card>

          {/* Próximos turnos */}
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Próximos turnos</h2>

            {upcomingShifts.length === 0 ? (
              <EmptyState
                title="Sin próximos turnos"
                description="Aplica a turnos desde el feed."
                action={
                  <Link href="/app/worker">
                    <Button>Ir al feed</Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {upcomingShifts.map((shift: any) => {
                  const canCancel =
                    new Date(shift.starts_at).getTime() - Date.now() > 24 * 3600000;

                  return (
                    <div
                      key={shift.shift_id}
                      className="rounded-2xl border border-black/5 bg-[#F5F5F0] p-4 dark:border-white/10 dark:bg-neutral-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{shift.profession_required}</p>
                          <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                            {shift.company_name}
                          </p>
                          <p className="mt-1 text-sm text-[#8B8B8B] dark:text-neutral-400">
                            {formatDateTime(shift.starts_at)}
                          </p>
                        </div>

                        <Badge>{shift.application_status}</Badge>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Link href={`/app/worker/shifts/${shift.shift_id}`}>
                          <Button variant="secondary">Ver</Button>
                        </Link>

                        {canCancel && (
                          <Button
                            variant="danger"
                            loading={actionLoading === shift.shift_id}
                            onClick={() => handleCancelShift(shift.shift_id)}
                          >
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Historial */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Historial de turnos completados</h2>
            <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
              {history?.total ?? 0} registros
            </span>
          </div>

          {!history || history.items.length === 0 ? (
            <EmptyState title="Sin historial" description="Aún no completaste turnos." />
          ) : (
            <>
              <div className="space-y-3">
                {history.items.map((item: any) => (
                  <div
                    key={item.payment_id}
                    className="flex flex-col gap-3 rounded-2xl border border-black/5 p-4 dark:border-white/10 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="font-bold">{item.profession_required}</p>
                      <p className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                        {item.company_name} · {formatDateTime(item.effective_date)}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="font-black">{formatEUR(item.gross)}</p>
                      <p className="text-xs text-[#8B8B8B] dark:text-neutral-400">
                        Neto estimado: {formatEUR(item.worker_net_estimate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  disabled={page === 0}
                  onClick={() => load(page - 1)}
                >
                  Anterior
                </Button>

                <span className="text-sm text-[#8B8B8B] dark:text-neutral-400">
                  Página {page + 1}
                </span>

                <Button
                  variant="secondary"
                  disabled={(page + 1) * history.pageSize >= history.total}
                  onClick={() => load(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}