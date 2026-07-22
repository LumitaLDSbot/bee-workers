'use client';

import { useRouter } from 'next/navigation';
import { useMyApplications } from '@/hooks/useApplications';
import { WorkerNav } from '@/components/layout/AppNav';
import { Badge, Card, EmptyState, FullLoader, ErrorState } from '@/components/ui';
import { formatShiftDate, formatHour } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';

export default function WorkerApplicationsPage() {
  const router = useRouter();
  const { applications, loading, error, refresh } = useMyApplications();

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <WorkerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <h1 className="text-2xl font-black">Mis aplicaciones</h1>

        {loading && <FullLoader />}

        {!loading && error && <ErrorState message={error} retry={refresh} />}

        {!loading && !error && applications.length === 0 && (
          <EmptyState
            title="Sin aplicaciones"
            description="Aplica a turnos desde el feed para verlos aquí."
          />
        )}

        <div className="space-y-3">
          {applications.map(app => (
            <Card
              key={app.id}
              onClick={() => router.push(`/app/worker/shifts/${app.shift_id}`)}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">
                  {app.shifts?.profession_required ?? 'Turno'}
                </p>
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

              {app.shifts && (
                <p className="text-sm text-[#8B8B8B]">
                  {formatShiftDate(app.shifts.shift_date)} ·{' '}
                  {formatHour(app.shifts.start_time)} -{' '}
                  {formatHour(app.shifts.end_time)}
                </p>
              )}

              <p className="text-sm font-semibold">
                Tu propuesta: {formatEUR(app.proposed_rate)}/h
              </p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}