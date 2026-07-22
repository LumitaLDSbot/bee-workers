'use client';

import { useRouter } from 'next/navigation';
import { useMyPublishedShifts } from '@/hooks/useShifts';
import { EmployerNav } from '@/components/layout/AppNav';
import { Badge, Button, Card, EmptyState, ErrorState, FullLoader } from '@/components/ui';
import { formatShiftDate, formatHour } from '@/lib/utils/date';
import { formatEUR } from '@/lib/utils/number';

export default function EmployerShiftsPage() {
  const router = useRouter();
  const { shifts, loading, error, refresh } = useMyPublishedShifts();

  return (
    <div className="min-h-screen bg-[#FFFAF0]">
      <EmployerNav />

      <main className="mx-auto max-w-md space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black">Mis turnos</h1>
          <Button onClick={() => router.push('/app/employer/shifts/new')}>
            Publicar
          </Button>
        </div>

        {loading && <FullLoader />}

        {!loading && error && <ErrorState message={error} retry={refresh} />}

        {!loading && !error && shifts.length === 0 && (
          <EmptyState
            title="Aún no publicaste turnos"
            description="Publica tu primer turno para recibir aplicaciones."
            action={
              <Button onClick={() => router.push('/app/employer/shifts/new')}>
                Publicar turno
              </Button>
            }
          />
        )}

        <div className="space-y-3">
          {shifts.map(shift => (
            <Card
              key={shift.id}
              onClick={() => router.push(`/app/employer/shifts/${shift.id}`)}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-bold">{shift.profession_required}</p>
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

              <p className="text-sm text-[#8B8B8B]">
                {formatShiftDate(shift.shift_date)} · {formatHour(shift.start_time)} -{' '}
                {formatHour(shift.end_time)}
              </p>

              <div className="flex items-center justify-between text-sm">
                <span>
                  {shift.hourly_rate_offer
                    ? `${formatEUR(shift.hourly_rate_offer)}/h`
                    : 'Precio a convenir'}
                </span>
                <span className="text-[#8B8B8B]">
                  {shift.application_count} apps · {shift.accepted_count}/
                  {shift.slots_needed}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}